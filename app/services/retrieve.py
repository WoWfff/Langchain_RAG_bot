import asyncio
import logging
import re
from collections.abc import Generator, Mapping
from pathlib import Path
from typing import Any

import aiohttp
import chromadb
from langchain_core.embeddings import Embeddings
from tiktoken import Encoding

from app.models.agent import ChunkModel, DocUrlModel

PYTHON_PATTERN = r"(?im)^.*python.*$"
URL_PATTERN = r"\((https?:\/\/[^)]+)\)"
ALLOWED_PREFIXES = ("https://docs.langchain.com/oss/python/langchain/",)
EXCLUDED_PREFIXES = (
    "https://docs.langchain.com/oss/python/langchain/frontend/",
    "https://docs.langchain.com/oss/python/langchain/changelog",
)
DOCS_URL = "https://docs.langchain.com/llms.txt"
EXCLUDED_DOCS_TEXT = (
    """> ## Documentation Index
> Fetch the complete documentation index at: https://docs.langchain.com/llms.txt
> Use this file to discover all available pages before exploring further.

""",
)

HEADERS = {"User-Agent": "Mozilla/5.0"}

CHUNK_SIZE = 200
CHUNK_OVERLAP = 30
BATCH_SIZE = 100

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
            if url.startswith(ALLOWED_PREFIXES) and not url.startswith(EXCLUDED_PREFIXES):
                urls.append(url)
    return urls


def format_docs_urls(docs_urls: list[str]) -> list[DocUrlModel]:
    logger.info("Formating docs urls")
    return [DocUrlModel(url=url) for url in docs_urls if url.endswith(".md")]


def dump_urls(docs_urls: list[DocUrlModel], path_to_urls_file: Path) -> None:
    logger.info("Dumping URLs")
    path_to_urls_file.write_text("\n".join(str(url.url) for url in docs_urls) + "\n", encoding="utf-8")


def filter_doc(doc_text: str, excluded_text: tuple) -> str:
    for string in excluded_text:
        doc_text = doc_text.replace(string, "")
    return doc_text


async def download_docs(
    session: aiohttp.ClientSession,
    url: str,
    semaphore: asyncio.Semaphore,
    path_to_pages_folder: Path,
) -> None:
    try:
        async with semaphore:
            filename = url.replace("https://docs.langchain.com/oss/python/", "").replace("/", "_")
            logger.info(f"Downloading doc: {filename}")

            async with session.get(url=url) as response:
                response.raise_for_status()

                content_type = response.headers.get("Content-Type", "")

                if "text/html" in content_type:
                    logger.warning(f"Skipped HTML page: {url}")
                    return

                data = await response.text()

                data = filter_doc(doc_text=data, excluded_text=EXCLUDED_DOCS_TEXT)

                (path_to_pages_folder / filename).write_text(data, encoding="utf-8")

    except aiohttp.ClientResponseError as err:
        logger.warning(f"HTTP {err.status}: {url}")

    except Exception as err:  # noqa: BLE001
        logger.error(f"ERROR: {err}, url: {url}")


def tokens_to_chunks(tokens: list[int], encoding_model: Encoding) -> Generator:
    step = CHUNK_SIZE - CHUNK_OVERLAP

    for i in range(0, len(tokens), step):
        chunk_tokens = tokens[i : i + CHUNK_SIZE]
        yield encoding_model.decode(chunk_tokens)


def convert_to_chunk_model(index: int, filename: str, chunk_text: str) -> ChunkModel:
    return ChunkModel(text=chunk_text, source=filename, chunk_index=index)


def chunked(lst: list, size: int) -> Generator:
    for i in range(0, len(lst), size):
        yield lst[i : i + size]


def dump_data_to_chromadb(
    all_chunks: list[ChunkModel],
    collection: chromadb.Collection,
    embedding: Embeddings,
) -> None:
    if collection.count() > 0:
        logger.info(f"Collection already exists: {collection.count()} chunks, skipping")
        return

    documents = [chunk.text for chunk in all_chunks]
    metadatas: list[Mapping[str, Any]] = [
        {
            "source": chunk.source,
            "chunk_index": chunk.chunk_index,
        }
        for chunk in all_chunks
    ]
    ids = [f"{chunk.source}_{chunk.chunk_index}" for chunk in all_chunks]

    for i in range(0, len(documents), BATCH_SIZE):
        batch_docs = documents[i : i + BATCH_SIZE]
        batch_meta = metadatas[i : i + BATCH_SIZE]
        batch_ids = ids[i : i + BATCH_SIZE]

        batch_embeddings: list[list[float]] = embedding.embed_documents(batch_docs)

        collection.add(
            documents=batch_docs,
            metadatas=batch_meta,
            ids=batch_ids,
            embeddings=batch_embeddings,  # type: ignore
        )


def _build_chunks(path_to_pages_folder: Path, encoding_model: Encoding) -> list[ChunkModel]:
    pages = path_to_pages_folder.glob("*.md")
    all_chunks = []
    for page in pages:
        text = page.read_text(encoding="utf-8")
        tokens = encoding_model.encode(text=text)
        for index, chunk in enumerate(tokens_to_chunks(tokens=tokens, encoding_model=encoding_model)):
            all_chunks.append(convert_to_chunk_model(index=index, filename=page.name, chunk_text=chunk))
    return all_chunks


async def ingest_docs_to_chromadb(
    path_to_pages_folder: Path,
    path_to_chromadb: Path,
    path_to_urls_file: Path,
    embedding: Embeddings,
    encoding_model: Encoding,
    collection_name: str,
    skip_downloading: bool = False,
) -> None:
    client = await asyncio.to_thread(chromadb.PersistentClient, path=str(path_to_chromadb))
    collection = await asyncio.to_thread(client.get_or_create_collection, name=collection_name)

    if not skip_downloading:
        async with aiohttp.ClientSession(headers=HEADERS) as session:
            # 1st stage
            logger.info("Stage 1 - GET doc urls")
            docs_text = await get_docs_text(session=session, url=DOCS_URL)

            if not docs_text:
                return

            raw_urls = filter_urls(docs_text=docs_text)
            docs_urls = format_docs_urls(docs_urls=raw_urls)

            await asyncio.to_thread(dump_urls, docs_urls, path_to_urls_file)

            # 2nd stage
            logger.info("Stage 2 - Download all docs")
            sem = asyncio.Semaphore(10)
            await asyncio.gather(
                *(
                    download_docs(
                        session=session,
                        url=url.url,
                        semaphore=sem,
                        path_to_pages_folder=path_to_pages_folder,
                    )
                    for url in docs_urls
                )
            )

    # 3rd stage
    logger.info("Stage 3 - Convert docs to chunks")
    all_chunks = await asyncio.to_thread(_build_chunks, path_to_pages_folder, encoding_model)
    logger.info(f"Total chunks: {len(all_chunks)}")

    # 4th stage
    logger.info("Stage 4 - Dump data to ChromaDB")
    await asyncio.to_thread(dump_data_to_chromadb, all_chunks, collection, embedding)
    count = await asyncio.to_thread(collection.count)
    logger.info(f"Done. Collection count: {count}")
