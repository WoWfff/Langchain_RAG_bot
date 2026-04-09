import asyncio
import json
import logging
from collections.abc import AsyncGenerator
from pathlib import Path

from langchain.agents import create_agent
from langchain.messages import HumanMessage, ToolMessage
from langchain_chroma import Chroma
from langchain_core.embeddings import Embeddings
from langchain_core.tools import BaseTool, StructuredTool
from langchain_google_genai import ChatGoogleGenerativeAI
from langgraph.types import GraphOutput

from app.models.agent import AgentResult, ToolInput, ToolResponse
from app.models.exceptions import AgentHistoryError, AgentProcessingError

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


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
        checkpointer,
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
                checkpointer=checkpointer,
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

    def extract_tool_data(self, message: str) -> list[dict]:
        tool_results = []

        try:
            tool_results.extend(json.loads(message))
        except Exception:  # noqa: BLE001
            pass

        return tool_results

    def extract_tool_response_for_stream_message(self, token: ToolMessage) -> list[dict]:
        if getattr(token, "status", None) == "success" and getattr(token, "type", None) == "tool":
            content = getattr(token, "content", None)
            result = self.extract_tool_data(content) if content else None
        return result or []

    def extract_tool_response_for_process_message(self, response: list[dict]) -> list[dict]:
        accumulated_sources = []

        for msg in response:
            data = msg.get("data", ())
            tools = data.get("tools", {})
            messages = tools.get("messages", [])

            for message in messages:
                if getattr(message, "status", None) == "success" and getattr(message, "type", None) == "tool":
                    if hasattr(message, "content") and message.content:
                        result = self.extract_tool_data(message=message.content)
                        accumulated_sources.extend(result)

        return accumulated_sources

    def extract_ai_response_from_procces_message(self, response: list[dict]) -> str | None:
        for msg in reversed(response):
            data = msg.get("data", ())
            updates = data.get("model", {})
            messages = updates.get("messages", [])

            for message in messages:
                if getattr(message, "type", None) == "ai":
                    result = getattr(message, "text", None)

            return result or None

        return None

    def extract_ai_response_from_stream_message(self, message) -> list[dict] | None:
        result = None

        if hasattr(message, "type") and hasattr(message, "text"):
            if message.type != "tool" or getattr(message, "status", None) != "success":
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
                input={
                    "messages": [HumanMessage(content=message)],
                },
                stream_mode="updates",
                version="v2",
                config={"configurable": {"thread_id": thread_id}},
            )  # type: ignore

            if debug:
                return result

            text = self.extract_ai_response_from_procces_message(response=result)  # type: ignore
            tool_response = self.extract_tool_response_for_process_message(response=result)  # type: ignore

            return AgentResult(response_text=text, tool_response=tool_response)

        except Exception as err:
            logger.error(f"Error processing message for thread {thread_id}: {err}")
            raise AgentProcessingError("Failed to process message", original_error=err) from err

    async def stream_message(
        self,
        message: str,
        thread_id: str,
        debug: bool = False,
    ) -> AsyncGenerator[AgentResult | dict]:
        try:
            async for chunk in self.agent.astream(
                input={"messages": [{"role": "user", "content": message}]},
                stream_mode=["messages"],
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

                        if metadata and metadata.get("langgraph_node") == "tools":
                            tool_response = (
                                self.extract_tool_response_for_stream_message(token=token)
                                if isinstance(token, ToolMessage)
                                else None
                            )
                            yield AgentResult(response_text=None, tool_response=tool_response)

        except Exception as err:
            logger.error(f"Error streaming message for thread {thread_id}: {err}")
            raise AgentProcessingError(f"Failed to stream message: {err}", original_error=err) from err

    async def get_thread_history(self, thread_id: str) -> list[dict]:
        try:
            state = await self.agent.aget_state(config={"configurable": {"thread_id": thread_id}})
            messages = []
            pending_sources: list[dict] = []

            if state and hasattr(state, "values") and "messages" in state.values:
                for msg in state.values["messages"]:
                    msg_type = getattr(msg, "type", None)

                    if msg_type == "human":
                        messages.append({"role": "user", "content": getattr(msg, "content", "")})

                    elif msg_type == "ai":
                        text = getattr(msg, "text", "")

                        if text and text.strip():
                            new_msg = {"role": "assistant", "content": text}
                            if pending_sources:
                                new_msg["sources"] = pending_sources
                                pending_sources = []
                            messages.append(new_msg)

                    elif msg_type == "tool":
                        if hasattr(msg, "text") and msg.text:
                            try:
                                tool_data = json.loads(msg.text)
                                pending_sources.extend(tool_data)
                            except json.JSONDecodeError:
                                pass

            return messages
        except Exception as err:
            logger.error(f"Failed to get thread history for {thread_id}: {err}")
            raise AgentHistoryError(thread_id, original_error=err) from err
