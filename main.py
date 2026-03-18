import asyncio
import pathlib

import tiktoken
import torch
from app.services.agent import start_agent
from app.services.retrieve import ingest_docs_to_chromadb
from chromadb.utils import embedding_functions
from langchain_huggingface import HuggingFaceEmbeddings

# Variables
PATH_TO_ROOT_FOLDER = pathlib.Path(__file__).resolve().parent
PATH_TO_DATA_FOLDER = PATH_TO_ROOT_FOLDER / "data"
PATH_TO_URLS_FILE = PATH_TO_DATA_FOLDER / "urls.txt"
PATH_TO_PAGES_FOLDER = PATH_TO_DATA_FOLDER / "pages"
PATH_TO_CHROMADB = PATH_TO_DATA_FOLDER / "chromadb"
PATH_TO_PAGES_FOLDER.mkdir(parents=True, exist_ok=True)
PATH_TO_CHROMADB.mkdir(parents=True, exist_ok=True)
COLLECTION_NAME = "langchain-docs"

# Models
encoding_model = tiktoken.get_encoding("o200k_base")
embedding_function = embedding_functions.SentenceTransformerEmbeddingFunction(
    model_name="sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2",
    device="cuda" if torch.cuda.is_available() else "cpu",
    normalize_embeddings=True,
)
langchain_embedding = HuggingFaceEmbeddings(
    model_name="sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2",
    model_kwargs={"device": "cuda"},
    encode_kwargs={"normalize_embeddings": True},
)


if __name__ == "__main__":
    # Create chroma database
    collection = asyncio.run(
        ingest_docs_to_chromadb(
            path_to_chromadb=PATH_TO_CHROMADB,
            path_to_pages_folder=PATH_TO_PAGES_FOLDER,
            path_to_urls_file=PATH_TO_URLS_FILE,
            embedding_function=embedding_function,
            encoding_model=encoding_model,
            collection_name=COLLECTION_NAME,
            skip_downloading=True,
        )
    )

    # Run langchain agent
    asyncio.run(
        start_agent(
            path_to_chromadb=PATH_TO_CHROMADB,
            embedding_function=langchain_embedding,
            collection_name=COLLECTION_NAME,
        )
    )
