import logging
import pathlib
import re

import requests
from app.models.pydantic import DocUrlModel

PATH_TO_ROOT_FOLDER = pathlib.Path(__file__).resolve().parent
PATH_TO_DATA_FOLDER = PATH_TO_ROOT_FOLDER / "data"
PYTHON_PATTERN = r"(?im)^.*python.*$"
URL_PATTERN = r"\((https?:\/\/[^)]+)\)"
ALLOWED_PREFIXES = ("https://docs.langchain.com/oss/python/langchain/",)
DOCS_URL = "https://docs.langchain.com/llms.txt"


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def get_docs_text(url: str) -> str:
    try:
        response = requests.get(url=url)
        text = response.text
        response.raise_for_status()
        return text

    except requests.HTTPError as err:
        logger.error(f"HTTP ERROR: {err}")
        raise


def filter_urls(docs_text: str) -> list[str]:
    urls = []
    strings_with_python = re.findall(pattern=PYTHON_PATTERN, string=docs_text)
    for string in strings_with_python:
        match = re.search(URL_PATTERN, string)
        if match:
            url = match.group(1)
            if url.startswith(ALLOWED_PREFIXES):
                urls.append(url)
    return urls


def format_docs_urls(docs_urls: list[str]) -> list[DocUrlModel]:
    return [DocUrlModel(url=url) for url in docs_urls if url.endswith(".md")]


def dump_urls(docs_urls: list[DocUrlModel]) -> None:
    path = PATH_TO_DATA_FOLDER / "urls.txt"
    path.write_text("\n".join(str(url.url) for url in docs_urls) + "\n", encoding="utf-8")


def main():
    docs_text = get_docs_text(url=DOCS_URL)
    urls = filter_urls(docs_text=docs_text)
    docs_urls = format_docs_urls(docs_urls=urls)
    dump_urls(docs_urls=docs_urls)


if __name__ == "__main__":
    main()
