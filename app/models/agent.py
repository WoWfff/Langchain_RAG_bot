from pydantic import BaseModel, field_validator


class DocUrlModel(BaseModel):
    url: str

    @field_validator("url")
    @classmethod
    def check_md(cls, v: str):
        if not v.endswith(".md"):
            raise ValueError("url must ends with .md")
        return v


class ChunkModel(BaseModel):
    text: str
    source: str
    chunk_index: int


class ToolInput(BaseModel):
    query: str


class ToolResponse(BaseModel):
    text: str
    source: str
    chunk_index: int | str


class AgentResult(BaseModel):
    response_text: str | None
    tool_response: list[dict] | None
