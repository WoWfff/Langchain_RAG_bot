import asyncio
import logging
from contextlib import asynccontextmanager
from os import getenv

from app.config import (
    COLLECTION_NAME,
    LLM_MODEL_NAME,
    PATH_TO_CHROMADB,
    PATH_TO_PAGES_FOLDER,
    PATH_TO_URLS_FILE,
    SYSTEM_PROMPT,
    encoding_model,
    langchain_embedding,
)
from app.routers import chat, health
from app.services.agent import Agent
from app.services.retrieve import ingest_docs_to_chromadb
from dotenv import load_dotenv
from fastapi import FastAPI

# Configuration
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# API key
load_dotenv()
GEMINI_API_KEY = getenv("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    raise ValueError("API key not found in .env")


async def init_agent(app: FastAPI):
    try:
        app.state.status = "Setting chromadb..."
        app.state.progress = 10

        await ingest_docs_to_chromadb(
            path_to_chromadb=PATH_TO_CHROMADB,
            path_to_pages_folder=PATH_TO_PAGES_FOLDER,
            path_to_urls_file=PATH_TO_URLS_FILE,
            embedding=langchain_embedding,
            encoding_model=encoding_model,
            collection_name=COLLECTION_NAME,
            skip_downloading=True,
        )

        app.state.progress = 50
        app.state.status = "Initialising AI-agent..."
        agent = Agent(
            path_to_chromadb=PATH_TO_CHROMADB,
            embedding=langchain_embedding,
            collection_name=COLLECTION_NAME,
            system_prompt=SYSTEM_PROMPT,
            model_name=LLM_MODEL_NAME,
        )

        app.state.agent = agent
        app.state.is_ready = True
        app.state.progress = 100
        app.state.status = "Ready"

    except Exception as e:  # noqa: BLE001
        app.state.error = str(e)
        app.state.is_ready = False


@asynccontextmanager
async def lifespan(app: FastAPI):  # noqa: RUF029
    app.state.agent = None
    app.state.progress = 0
    app.state.status = None
    app.state.is_ready = False
    app.state.error = None
    app.state.thread_id = None
    app.state.database = None

    asyncio.create_task(init_agent(app=app))  # noqa: RUF006

    yield


app = FastAPI(lifespan=lifespan)

app.include_router(health.router)
app.include_router(chat.router)
