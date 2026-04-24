import asyncio
import logging

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
