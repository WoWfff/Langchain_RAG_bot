from pydantic import BaseModel, field_validator


class DocUrlModel(BaseModel):
    url: str

    @field_validator("url")
    @classmethod
    def check_md(cls, v: str):
        if not v.endswith(".md"):
            raise ValueError("url must ends with .md")
        return v
