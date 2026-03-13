import asyncio
import logging
import pathlib
import re

import aiohttp
from app.models.pydantic import DocUrlModel

PATH_TO_ROOT_FOLDER = pathlib.Path(__file__).resolve().parent
PATH_TO_DATA_FOLDER = PATH_TO_ROOT_FOLDER / "data"
PATH_TO_URLS_FILE = PATH_TO_DATA_FOLDER / "urls.txt"
PATH_TO_PAGES_FOLDER = PATH_TO_DATA_FOLDER / "pages"
PATH_TO_PAGES_FOLDER.mkdir(parents=True, exist_ok=True)

PYTHON_PATTERN = r"(?im)^.*python.*$"
URL_PATTERN = r"\((https?:\/\/[^)]+)\)"
ALLOWED_PREFIXES = ("https://docs.langchain.com/oss/python/langchain/",)
DOCS_URL = "https://docs.langchain.com/llms.txt"

HEADERS = {"User-Agent": "Mozilla/5.0"}


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def get_docs_text(session: aiohttp.ClientSession, url: str) -> str | None:
    try:
        logger.info("GET docs urls")
        async with session.get(url=url) as response:
            response.raise_for_status()
            text = await response.text()
            return text

    except aiohttp.ClientResponseError as err:
        logger.warning(f"HTTP {err.status}: {url}")
        return None


def filter_urls(docs_text: str) -> list[str]:
    urls = []
    logger.info("Filtering raw docs text")

    strings_with_python = re.findall(pattern=PYTHON_PATTERN, string=docs_text)

    for string in strings_with_python:
        match = re.search(URL_PATTERN, string)
        if match:
            url = match.group(1)
            if url.startswith(ALLOWED_PREFIXES):
                urls.append(url)
    return urls


def format_docs_urls(docs_urls: list[str]) -> list[DocUrlModel]:
    logger.info("Formating docs urls")
    return [DocUrlModel(url=url) for url in docs_urls if url.endswith(".md")]


def dump_urls(docs_urls: list[DocUrlModel]) -> None:
    logger.info("Dumping URLs")
    PATH_TO_URLS_FILE.write_text("\n".join(str(url.url) for url in docs_urls) + "\n", encoding="utf-8")


async def download_docs(session: aiohttp.ClientSession, url: str, semaphore: asyncio.Semaphore) -> None:
    try:
        async with semaphore:
            filename = url.replace("https://docs.langchain.com/oss/python/", "").replace("/", "_")
            logger.info(f"Downloading doc: {filename}")

            async with session.get(url=url) as response:
                response.raise_for_status()

                data = await response.text()
                (PATH_TO_PAGES_FOLDER / filename).write_text(data=data, encoding="utf-8")

    except aiohttp.ClientResponseError as err:
        logger.warning(f"HTTP {err.status}: {url}")

    except Exception as err:
        logger.error(f"ERROR: {err}, url: {url}")


async def main():
    async with aiohttp.ClientSession(headers=HEADERS) as session:
        # 1st stage
        docs_text = await get_docs_text(session=session, url=DOCS_URL)
        if not docs_text:
            return
        raw_urls = filter_urls(docs_text=docs_text)
        docs_urls = format_docs_urls(docs_urls=raw_urls)
        dump_urls(docs_urls=docs_urls)

        # 2nd stage
        sem = asyncio.Semaphore(10)
        await asyncio.gather(*(download_docs(session=session, url=url.url, semaphore=sem) for url in docs_urls))


if __name__ == "__main__":
    asyncio.run(main())
