from pathlib import Path

from langchain.agents import create_agent
from langchain.tools import tool
from langchain_chroma import Chroma
from langchain_core.embeddings import Embeddings
from langchain_core.tools import BaseTool
from langchain_google_genai import ChatGoogleGenerativeAI


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
                timeout=60,
                max_retries=2,
            )

            self.retriever = self.db.as_retriever(search_kwargs={"k": 5})

            tools = self._build_tools()

            self.agent = create_agent(
                model=self.model,
                tools=[*tools],
                system_prompt=system_prompt,
            )

        except Exception as err:
            raise ValueError("Error while initialising AI agent.") from err

    def _build_tools(self) -> list[BaseTool]:
        @tool
        def search_docs(query: str) -> str:
            """Search for relevant information in the documentation. Use this tool for technical questions."""
            docs = self.retriever.invoke(query)
            return "\n\n".join(doc.page_content[:500] for doc in docs)

        return [search_docs]

    async def process_message(self, message: str):
        try:
            messages = {"messages": [{"role": "user", "content": message}]}

            buffer = ""

            async for chunk in self.agent.astream(
                input=messages,
                stream_mode="messages",
                version="v2",
            ):  # type: ignore
                if chunk["type"] != "messages":
                    continue

                token, _ = chunk["data"]

                for block in token.content_blocks:
                    if block["type"] != "text":
                        continue

                    text = block["text"]
                    buffer += text

                    if " " in buffer or len(buffer) > 20:
                        yield buffer
                        buffer = ""

            if buffer:
                yield buffer

        except Exception as err:
            raise ValueError("Error while processing user message.") from err
