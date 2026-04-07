import asyncio
import logging
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
from app.services.agent import Agent
from app.services.database import Database
from app.services.retrieve import ingest_docs_to_chromadb
from dotenv import load_dotenv
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


async def init_services(checkpointer) -> Agent:
    try:
        embedding_model, encoding_model = await asyncio.gather(
            asyncio.to_thread(get_embedding),
            asyncio.to_thread(get_encoding),
        )

        await ingest_docs_to_chromadb(
            path_to_chromadb=PATH_TO_CHROMADB,
            path_to_pages_folder=PATH_TO_PAGES_FOLDER,
            path_to_urls_file=PATH_TO_URLS_FILE,
            embedding=embedding_model,
            encoding_model=encoding_model,
            collection_name=COLLECTION_NAME,
            skip_downloading=True,
        )

        return Agent(
            path_to_chromadb=PATH_TO_CHROMADB,
            embedding=embedding_model,
            collection_name=COLLECTION_NAME,
            system_prompt=SYSTEM_PROMPT,
            model_name=LLM_MODEL_NAME,
            checkpointer=checkpointer,
        )

    except Exception:
        logger.error("init_services failed")
        raise


# TEST
async def test():
    db = Database()
    await db.connect()

    pool = AsyncConnectionPool(
        conninfo=PSYCOPG_URL,
        kwargs={"autocommit": True, "prepare_threshold": 0, "row_factory": dict_row},
        max_size=20,
        open=False,
    )
    await pool.open()
    checkpointer = AsyncPostgresSaver(pool)  # type: ignore
    await checkpointer.setup()
    agent = await init_services(checkpointer)

    result = await agent.get_thread_history("33f21a46-cb10-45c5-9f6e-ddf443283e85")

    # async for msg in agent.stream_message("what is langchain?", "11", debug=False):
    #     result.append(msg)

    # proccess = await agent.process_message("what is langgraph in relation to langchain?", "12", debug=False)
    # print()


asyncio.run(test())
