import asyncio
import logging
import pathlib
from os import getenv
from uuid import uuid4

import tiktoken
import torch
from app.routers import health
from app.services.agent import Agent
from app.services.retrieve import ingest_docs_to_chromadb
from dotenv import load_dotenv
from fastapi import FastAPI
from langchain_huggingface import HuggingFaceEmbeddings

# Configuration
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
app = FastAPI()
app.include_router(health.router)

# Variables
thread_id = uuid4()
PATH_TO_ROOT_FOLDER = pathlib.Path(__file__).resolve().parent
PATH_TO_DATA_FOLDER = PATH_TO_ROOT_FOLDER / "data"
PATH_TO_URLS_FILE = PATH_TO_DATA_FOLDER / "urls.txt"
PATH_TO_PAGES_FOLDER = PATH_TO_DATA_FOLDER / "pages"
PATH_TO_CHROMADB = PATH_TO_DATA_FOLDER / "chromadb"
PATH_TO_PAGES_FOLDER.mkdir(parents=True, exist_ok=True)
PATH_TO_CHROMADB.mkdir(parents=True, exist_ok=True)
COLLECTION_NAME = "langchain-docs"
DEVICE_FOR_MODELS = "cuda" if torch.cuda.is_available() else "cpu"
LLM_MODEL_NAME = "gemini-2.5-flash"  # gemini-3.1-flash-lite-preview  gemini-2.5-flash-lite
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

# API key
load_dotenv()
GEMINI_API_KEY = getenv("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    raise ValueError("API key not found in .env")

# Models
encoding_model = tiktoken.get_encoding("o200k_base")
langchain_embedding = HuggingFaceEmbeddings(
    model_name="sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2",
    model_kwargs={"device": DEVICE_FOR_MODELS},
    encode_kwargs={"normalize_embeddings": True},
)


async def main():
    # Create chroma database
    await ingest_docs_to_chromadb(
        path_to_chromadb=PATH_TO_CHROMADB,
        path_to_pages_folder=PATH_TO_PAGES_FOLDER,
        path_to_urls_file=PATH_TO_URLS_FILE,
        embedding=langchain_embedding,
        encoding_model=encoding_model,
        collection_name=COLLECTION_NAME,
        skip_downloading=True,
    )

    # Init langchain agent
    agent = Agent(
        path_to_chromadb=PATH_TO_CHROMADB,
        embedding=langchain_embedding,
        collection_name=COLLECTION_NAME,
        system_prompt=SYSTEM_PROMPT,
        model_name=LLM_MODEL_NAME,
    )

    # Test
    db_pm = await agent.process_message("what is langchain?", thread_id, debug=True)

    stream = []
    async for chunk in agent.stream_message("what is langchain", thread_id):
        print(chunk, end="", flush=True)
        stream.append(chunk)

    # @app.on_event("startup")
    # async def startup():
    #     app.state.agent = agent


if __name__ == "__main__":
    asyncio.run(main())
