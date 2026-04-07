import os
import pathlib

import tiktoken
import torch
from langchain_huggingface import HuggingFaceEmbeddings

# Pathes
PATH_TO_ROOT_FOLDER = pathlib.Path(__file__).resolve().parent.parent
PATH_TO_DATA_FOLDER = PATH_TO_ROOT_FOLDER / "data"
PATH_TO_URLS_FILE = PATH_TO_DATA_FOLDER / "urls.txt"
PATH_TO_PAGES_FOLDER = PATH_TO_DATA_FOLDER / "pages"
PATH_TO_CHROMADB = PATH_TO_DATA_FOLDER / "chromadb"
PATH_TO_MODEL_DIRECTORY = PATH_TO_DATA_FOLDER / "models"
PATH_TO_MODEL_DIRECTORY.mkdir(parents=True, exist_ok=True)
PATH_TO_PAGES_FOLDER.mkdir(parents=True, exist_ok=True)
PATH_TO_CHROMADB.mkdir(parents=True, exist_ok=True)

# Database
DB_USER = os.getenv("POSTGRES_USER", "postgres")
DB_PASSWORD = os.getenv("POSTGRES_PASSWORD", "postgres")
DB_NAME = os.getenv("POSTGRES_DB", "rag_bot_database")
DB_HOST = os.getenv("POSTGRES_HOST", "localhost")
DB_PORT = os.getenv("POSTGRES_PORT", "5432")
DB_SSLMODE = os.getenv("POSTGRES_SSLMODE", "prefer")
DATABASE_URL = f"postgresql+asyncpg://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
PSYCOPG_URL = f"postgresql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}?sslmode={DB_SSLMODE}"

# LLM variables
encoding_model = None
langchain_embedding = None
COLLECTION_NAME = "langchain-docs"
DEVICE_FOR_MODELS = "cuda" if torch.cuda.is_available() else "cpu"
LLM_MODEL_NAME = "gemini-2.5-flash-lite"  # gemini-3.1-flash-lite-preview  gemini-2.5-flash-lite
SYSTEM_PROMPT = """You are a technical assistant specialized in LangChain and its ecosystem.

You have access to a tool called `search_docs` that retrieves relevant information from LangChain documentation.

Your primary goal is to provide accurate, up-to-date, and factual answers.

## Tool usage rules

* ALWAYS use the `search_docs` tool when the user asks about:

  * LangChain APIs, classes, or functions
  * Agents, tools, retrievers, or chains
  * Integrations with LLM providers (OpenAI, Anthropic, Google, etc.)
  * Any technical or implementation detail related to LangChain

* DO NOT rely on your internal knowledge if the question is about LangChain specifics — use the tool first.

* If the tool returns relevant information:

  * Base your answer ONLY on that information
  * Do not invent details

* If the tool returns insufficient or unclear results:

  * You may supplement with your general knowledge, but clearly prioritize retrieved data

## Answer style

* Be concise but complete
* Use clear technical explanations
* Prefer structured answers (bullet points, steps)
* Include code examples when relevant
* Do not mention the tool or that you used it

## Behavior constraints

* Do not hallucinate APIs or methods
* Do not guess undocumented behavior
* If unsure, say you are not certain

## Tool usage strategy

1. Analyze the question
2. If it is related to LangChain → call `search_docs`
3. Read retrieved context carefully
4. Generate final answer based on retrieved data

Your answers must be grounded in the retrieved documentation whenever possible.
"""


# Models
def get_embedding() -> HuggingFaceEmbeddings:
    return HuggingFaceEmbeddings(
        model_name="sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2",
        model_kwargs={"device": DEVICE_FOR_MODELS},
        encode_kwargs={"normalize_embeddings": True},
        cache_folder=str(PATH_TO_MODEL_DIRECTORY),
    )


def get_encoding() -> tiktoken.Encoding:
    return tiktoken.get_encoding("o200k_base")
