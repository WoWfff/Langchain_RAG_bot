from pathlib import Path

from langchain_chroma import Chroma
from langchain_core.embeddings import Embeddings


async def start_agent(
    path_to_chromadb: Path,
    embedding_function: Embeddings,
    collection_name: str,
) -> None:
    db = Chroma(
        persist_directory=str(path_to_chromadb),
        embedding_function=embedding_function,
        collection_name=collection_name,
    )
