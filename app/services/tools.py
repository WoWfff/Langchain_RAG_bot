import asyncio
import logging

<<<<<<< HEAD
from langchain_core.vectorstores import VectorStoreRetriever

from app.models.agent import ToolResponse

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def search_docs(query: str, retriever: VectorStoreRetriever) -> list[dict]:
    docs = await asyncio.to_thread(retriever.invoke, query)
    logger.info("Tool call: search_docs | query=%s | docs_found=%d", query, len(docs))

    response = [
        ToolResponse(
            text=doc.page_content,
            source=doc.metadata.get("source", "unknown"),
            chunk_index=doc.metadata.get("chunk_index", "unknown"),
        ).model_dump()
        for doc in docs
    ]

    return response
=======
from langchain_core.tools import BaseTool, StructuredTool
from langchain_core.vectorstores import VectorStoreRetriever

from app.models.agent import ToolInput, ToolResponse

logger = logging.getLogger(__name__)


def build_search_docs_tool(retriever: VectorStoreRetriever) -> BaseTool:
    async def search_docs(query: str) -> list[dict]:
        docs = await asyncio.to_thread(retriever.invoke, query)
        logger.info("Tool call: search_docs | query=%s | docs_found=%d", query, len(docs))

        response = [
            ToolResponse(
                text=doc.page_content,
                source=doc.metadata.get("source", "unknown"),
                chunk_index=doc.metadata.get("chunk_index", "unknown"),
            ).model_dump()
            for doc in docs
        ]

        return response

    func_tool = StructuredTool.from_function(
        coroutine=search_docs,
        name="search_docs",
        description="""Find the information you need in the documentation.
Returns a list of objects with: text, source, chunk_index.""",
        args_schema=ToolInput,
    )

    return func_tool
>>>>>>> 56c3246 (A model temperature parameter has been added to the configuration file.)
