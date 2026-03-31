import asyncio
import json
import logging
from collections.abc import AsyncGenerator
from pathlib import Path

from langchain.agents import create_agent
from langchain_chroma import Chroma
from langchain_core.embeddings import Embeddings
from langchain_core.tools import BaseTool, StructuredTool
from langchain_google_genai import ChatGoogleGenerativeAI
from langgraph.checkpoint.memory import MemorySaver
from langgraph.types import GraphOutput

from app.models.agent import AgentResult, ToolInput, ToolResponse

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
memory = MemorySaver()


def search(query: str) -> str:
    return "result"


class Agent:
    def __init__(
        self,
        path_to_chromadb: Path,
        embedding: Embeddings,
        collection_name: str,
        system_prompt: str,
        model_name: str,
    ):
        try:
            self.db = Chroma(
                persist_directory=str(path_to_chromadb),
                embedding_function=embedding,
                collection_name=collection_name,
            )

            self.model = ChatGoogleGenerativeAI(
                model=model_name,
                temperature=1.0,
                max_tokens=None,
                timeout=120,
                max_retries=3,
            )

            self.retriever = self.db.as_retriever(search_kwargs={"k": 5})

            self.tools = self._build_tools()

            self.agent = create_agent(
                model=self.model,
                tools=[*self.tools],
                system_prompt=system_prompt,
                checkpointer=memory,
            )

        except Exception as err:
            raise ValueError("Error while initialising AI agent.") from err

    def _build_tools(self) -> list[BaseTool]:

        async def search_docs(query: str) -> list[dict]:
            docs = await asyncio.to_thread(self.retriever.invoke, query)
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

        return [func_tool]

    def extract_tool_data(self, message) -> list[dict]:
        tool_results = []

        try:
            tool_results.extend(json.loads(message.content))
        except Exception:  # noqa: BLE001
            pass

        return tool_results

    def extract_tool_response(self, response: dict) -> list[dict]:
        messages = response.get("messages", [])

        result: list[dict] = []

        for msg in messages:
            if msg.type == "tool" and msg.name == "search_docs":
                result = self.extract_tool_data(message=msg)

        return result

    def extract_ai_response_from_procces_message(self, response: dict) -> str | None:
        for msg in reversed(response["messages"]):
            if getattr(msg, "type", None) == "ai":
                return msg.text
        return None

    def extract_ai_response_from_stream_message(self, message) -> list[dict] | None:
        result = None

        if hasattr(message, "type") and hasattr(message, "text"):
            if message.type != "tool" or message.status != "success":
                return None

            result = self.extract_tool_data(message)

        return result

    async def process_message(
        self,
        message: str,
        thread_id: str,
        debug: bool = False,
    ) -> GraphOutput | AgentResult:
        try:
            result: GraphOutput = await self.agent.ainvoke(
                input={"messages": [{"role": "user", "content": message}]},
                version="v2",
                config={"configurable": {"thread_id": thread_id}},
            )  # type: ignore
            tool_response = self.extract_tool_response(response=result.value)
            text = self.extract_ai_response_from_procces_message(response=result.value)

            if debug:
                return result

            return AgentResult(response_text=text, tool_response=tool_response)

        except Exception as err:
            raise ValueError("Error while processing user message.") from err

    async def stream_message(
        self,
        message: str,
        thread_id: str,
        debug: bool = False,
    ) -> AsyncGenerator[AgentResult | dict]:
        try:
            async for chunk in self.agent.astream(
                input={"messages": [{"role": "user", "content": message}]},
                stream_mode=["messages", "values"],
                version="v2",
                config={"configurable": {"thread_id": thread_id}},
            ):  # type: ignore
                if debug:
                    yield chunk  # type: ignore

                else:
                    if chunk["type"] == "messages":
                        token, metadata = chunk["data"]

                        if metadata and metadata.get("langgraph_node") == "model":
                            if hasattr(token, "content_blocks") and token.content_blocks:
                                for block in token.content_blocks:
                                    if block.get("type") != "text":
                                        continue
                                    yield AgentResult(response_text=block["text"], tool_response=None)  # type: ignore

                            else:
                                if getattr(token, "text", None):
                                    yield AgentResult(response_text=token.text, tool_response=None)

                    elif chunk["type"] == "values":
                        messages = chunk.get("data", {}).get("messages", [])  # type: ignore
                        for msg in messages:
                            tool_reponse = self.extract_ai_response_from_stream_message(message=msg)  # type: ignore
                            yield AgentResult(response_text=None, tool_response=tool_reponse)

        except Exception as err:
            raise ValueError("Error while processing user message.") from err
