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
    PSYCOPG_URL,
    SYSTEM_PROMPT,
    get_embedding,
    get_encoding,
)
from app.middleware.user_middleware import UserMiddleware
from app.routers import chat, database, health, threads
from app.services.agent import Agent
from app.services.database import Database
from app.services.retrieve import ingest_docs_to_chromadb
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool

# Configuration
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# API key
load_dotenv()
GEMINI_API_KEY = getenv("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    raise ValueError("API key not found in .env")


async def init_services(app: FastAPI, checkpointer):
    try:
        app.state.status = "Loading models..."
        app.state.progress = 5

        embedding_model, encoding_model = await asyncio.gather(
            asyncio.to_thread(get_embedding),
            asyncio.to_thread(get_encoding),
        )
        app.state.status = "Setting chromadb..."
        app.state.progress = 10

        await ingest_docs_to_chromadb(
            path_to_chromadb=PATH_TO_CHROMADB,
            path_to_pages_folder=PATH_TO_PAGES_FOLDER,
            path_to_urls_file=PATH_TO_URLS_FILE,
            embedding=embedding_model,
            encoding_model=encoding_model,
            collection_name=COLLECTION_NAME,
            skip_downloading=True,
        )

        app.state.progress = 50
        app.state.status = "Initialising AI-agent..."
        agent = Agent(
            path_to_chromadb=PATH_TO_CHROMADB,
            embedding=embedding_model,
            collection_name=COLLECTION_NAME,
            system_prompt=SYSTEM_PROMPT,
            model_name=LLM_MODEL_NAME,
            checkpointer=checkpointer,
        )

        app.state.agent = agent
        app.state.is_ready = True
        app.state.progress = 100
        app.state.status = "Ready"

    except Exception as err:  # noqa: BLE001
        logger.error("init_services failed")
        app.state.error = str(err)
        app.state.is_ready = False


@asynccontextmanager
async def lifespan(app: FastAPI):
    db = Database()
    await db.connect()

    pool = AsyncConnectionPool(
        conninfo=PSYCOPG_URL,
        kwargs={"autocommit": True, "prepare_threshold": 0, "row_factory": dict_row},
        max_size=20,
        open=False,
    )
    await pool.open()
    checkpointer = AsyncPostgresSaver(conn=pool)  # type: ignore
    await checkpointer.setup()

    app.state.database = db
    app.state.checkpointer = checkpointer
    app.state.pg_pool = pool
    app.state.agent = None
    app.state.progress = 0
    app.state.status = None
    app.state.is_ready = False
    app.state.error = None
    app.state.thread_id = None

    asyncio.create_task(init_services(app, checkpointer))  # noqa: RUF006

    yield
    await pool.close()
    await db.close()


app = FastAPI(lifespan=lifespan)
app.add_middleware(UserMiddleware)

# Mount static files
app.mount("/static", StaticFiles(directory="static"), name="static")

app.include_router(health.router)
app.include_router(chat.router)
app.include_router(database.router)
app.include_router(threads.router)


@app.get("/")
async def root():
    """Serve the main HTML page"""
    return FileResponse("templates/index.html")
