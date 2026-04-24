import json
import logging
from collections.abc import AsyncGenerator
from pathlib import Path

from langchain.agents import create_agent
from langchain_chroma import Chroma
from langchain_core.embeddings import Embeddings
from langchain_core.messages import AIMessage, HumanMessage, ToolMessage
from langchain_core.tools import BaseTool
from langchain_google_genai import ChatGoogleGenerativeAI
from langgraph.types import GraphOutput

from app.models.agent import AgentResult
from app.models.exceptions import AgentHistoryError, AgentProcessingError, RateLimitError
from app.services.tools import build_search_docs_tool

logger = logging.getLogger(__name__)


class Agent:
    def __init__(
        self,
        path_to_chromadb: Path,
        embedding: Embeddings,
        collection_name: str,
        system_prompt: str,
        model_name: str,
        model_temperature: float,
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
                temperature=model_temperature,
                max_tokens=None,
                timeout=180,  # 3 min
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
        search_docs_tool = build_search_docs_tool(self.retriever)
        return [search_docs_tool]

    def extract_tool_response_for_process_message(self, response: list[dict]) -> list[dict]:
        accumulated_sources = []
        tool_results = []

        for msg in response:
            data = msg.get("data", ())
            tools = data.get("tools", {})
            messages = tools.get("messages", [])

            for message in messages:
                if isinstance(message, ToolMessage) and message.status == "success":
                    if isinstance(message.content, str):
                        try:
                            tool_results.extend(json.loads(message.content))
                        except Exception:  # noqa: BLE001
                            pass
                        result = tool_results
                        accumulated_sources.extend(result)

        return accumulated_sources

    def extract_ai_response_from_process_message(self, response: list[dict]) -> str | None:
        for msg in reversed(response):
            data = msg.get("data", ())
            updates = data.get("model", {})
            messages = updates.get("messages", [])

            for message in messages:
                if isinstance(message, AIMessage):
                    if hasattr(message, "text") and message.text:
                        return message.text

        return None

    async def process_message(
        self,
        message: str,
        thread_id: str,
        debug: bool = False,
    ) -> GraphOutput | AgentResult:
        try:
            logger.info(f"Starting process_message for thread: {thread_id}")
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

            text = self.extract_ai_response_from_process_message(response=result)  # type: ignore
            tool_response = self.extract_tool_response_for_process_message(response=result)  # type: ignore

            return AgentResult(response_text=text, tool_response=tool_response)

        except Exception as err:
            # Check if it's a rate limit error
            error_str = str(err)
            if "429" in error_str or "RESOURCE_EXHAUSTED" in error_str or "quota" in error_str.lower():
                # Try to extract retry delay from error message
                import re

                retry_match = re.search(r"retry.*?(\d+)(?:\.\d+)?s", error_str, re.IGNORECASE)
                retry_after = int(float(retry_match.group(1))) if retry_match else None
                logger.warning(f"Rate limit exceeded for thread {thread_id}. Retry after: {retry_after}s")
                raise RateLimitError(retry_after=retry_after) from err

            logger.error(f"Error processing message for thread {thread_id}: {err}")
            raise AgentProcessingError("Failed to process message", original_error=err) from err

    async def stream_message(
        self,
        message: str,
        thread_id: str,
        debug: bool = False,
    ) -> AsyncGenerator[AgentResult | dict]:
        try:
            logger.info(f"Starting stream_message for thread: {thread_id}")
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

                        if metadata and metadata.get("langgraph_node") == "tools" and isinstance(token, ToolMessage):
                            if token.status == "success" and isinstance(token.content, str):
                                tool_response = json.loads(token.content)
                                yield AgentResult(response_text=None, tool_response=tool_response)

        except Exception as err:
            # Check if it's a rate limit error
            error_str = str(err)
            if "429" in error_str or "RESOURCE_EXHAUSTED" in error_str or "quota" in error_str.lower():
                # Try to extract retry delay from error message
                import re

                retry_match = re.search(r"retry.*?(\d+)(?:\.\d+)?s", error_str, re.IGNORECASE)
                retry_after = int(float(retry_match.group(1))) if retry_match else None
                logger.warning(f"Rate limit exceeded for thread {thread_id}. Retry after: {retry_after}s")
                raise RateLimitError(retry_after=retry_after) from err

            logger.error(f"Error streaming message for thread {thread_id}: {err}")
            raise AgentProcessingError(f"Failed to stream message: {err}", original_error=err) from err

    async def get_thread_history(self, thread_id: str) -> list[dict]:
        try:
            state = await self.agent.aget_state(config={"configurable": {"thread_id": thread_id}})
            messages = []
            pending_sources: list[dict] = []

            if state and "messages" in state.values:
                for msg in state.values["messages"]:
                    if isinstance(msg, HumanMessage):
                        messages.append({"role": "user", "content": msg.content})

                    elif isinstance(msg, AIMessage):
                        text = msg.text or ""

                        if text.strip():
                            new_msg: dict[str, str | list[dict]] = {"role": "assistant", "content": text}
                            if pending_sources:
                                new_msg["sources"] = pending_sources
                                pending_sources = []
                            messages.append(new_msg)  # type: ignore

                    elif isinstance(msg, ToolMessage):
                        if isinstance(msg.content, str):
                            try:
                                tool_data = json.loads(msg.content)
                                if isinstance(tool_data, list):
                                    pending_sources.extend(tool_data)
                            except json.JSONDecodeError:
                                pass

            return messages
        except Exception as err:
            logger.error(f"Failed to get thread history for {thread_id}: {err}")
            raise AgentHistoryError(thread_id, original_error=err) from err
