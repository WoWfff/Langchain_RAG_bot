import os
import pathlib

import tiktoken
import torch
from dotenv import load_dotenv
from langchain_huggingface import HuggingFaceEmbeddings

# API key
load_dotenv()
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    raise ValueError("API key not found in .env")

# Pathes
PATH_TO_ROOT_FOLDER = pathlib.Path(__file__).resolve().parent.parent
PATH_TO_DATA_FOLDER = PATH_TO_ROOT_FOLDER / "data"
PATH_TO_URLS_FILE = PATH_TO_DATA_FOLDER / "urls.txt"
PATH_TO_PAGES_FOLDER = PATH_TO_DATA_FOLDER / "pages"
PATH_TO_CHROMADB = PATH_TO_DATA_FOLDER / "chromadb"
PATH_TO_MODEL_DIRECTORY = PATH_TO_DATA_FOLDER / "models"
PATH_TO_MODEL_DIRECTORY.mkdir(parents=True, exist_ok=True)
PATH_TO_PAGES_FOLDER.mkdir(parents=True, exist_ok=True)
PATH_TO_CHROMADB.mkdir(parents=True, exist_ok=True)

# Database
DB_USER = os.getenv("POSTGRES_USER", "postgres")
DB_PASSWORD = os.getenv("POSTGRES_PASSWORD", "postgres")
DB_NAME = os.getenv("POSTGRES_DB", "rag_bot_database")
DB_HOST = os.getenv("POSTGRES_HOST", "localhost")
DB_PORT = os.getenv("POSTGRES_PORT", "5432")
DB_SSLMODE = os.getenv("POSTGRES_SSLMODE", "prefer")
DATABASE_URL = f"postgresql+asyncpg://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
PSYCOPG_URL = f"postgresql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}?sslmode={DB_SSLMODE}"

# LLM variables
encoding_model = None
langchain_embedding = None
COLLECTION_NAME = "langchain-docs"
DEVICE_FOR_MODELS = "cuda" if torch.cuda.is_available() else "cpu"
LLM_MODEL_NAME = "gemma-4-31b-it"  # gemini-3.1-flash-lite-preview  gemini-2.5-flash-lite gemma-4-31b-it
LLM_MODEL_TEMPERATURE = 0.5
SYSTEM_PROMPT = """You are a technical assistant specialized in LangChain and its ecosystem.

You have access to a tool:

- search_docs(query: string) → returns relevant LangChain documentation

Your goal is to provide accurate, factual, and up-to-date answers STRICTLY grounded in retrieved documentation.

---

## CRITICAL EXECUTION RULE

If the user query is related to LangChain in ANY way, you are NOT allowed to answer directly.

You MUST follow this sequence:

1. Call `search_docs`
2. Read the retrieved content carefully
3. Generate the answer ONLY using retrieved information

If you skip the tool when it was required → the answer is INVALID.

---

##  TOOL TRIGGER CONDITIONS

You MUST call `search_docs` if the query mentions or implies:

- LangChain (explicitly or implicitly)
- chains, agents, tools, retrievers
- prompts, memory, callbacks
- vector stores, embeddings, RAG pipelines
- integrations (OpenAI, Anthropic, Google, etc.)
- any code that could involve LangChain
- ANY implementation detail

Even weak signals count.

If there is ≥1% chance the question is about LangChain → call the tool.

---

## WHEN NOT TO USE TOOL


You MAY skip the tool ONLY if the question is clearly unrelated to LangChain, such as:

- general programming (pure Python, JS, etc.)
- math, history, casual conversation
- general LLM theory with no LangChain context

If unsure → USE THE TOOL.

---

## AFTER TOOL USAGE

- Base your answer ONLY on retrieved content
- Do NOT hallucinate APIs or behavior
- Do NOT invent undocumented features
- If information is incomplete:
  → explicitly say: "I am not fully certain based on the retrieved documentation"

You MAY:
- summarize
- restructure
- provide examples derived from retrieved data

---

## ANSWER STYLE

- concise but complete
- structured (bullet points / steps)
- include code examples when relevant
- avoid unnecessary verbosity
- DO NOT mention the tool

---

## FEW-SHOT EXAMPLES

### Example 1 (LangChain → MUST use tool)

User: How do I create an agent in LangChain?

Assistant:
→ CALL search_docs("LangChain create agent")

→ THEN answer using retrieved content


---

### Example 2 (LangChain implicit → MUST use tool)

User: How to use a retriever with vector store?

Assistant:
→ CALL search_docs("LangChain retriever vector store")

→ THEN answer


---

### Example 3 (Non-LangChain → NO tool)

User: What is a Python dictionary?

Assistant:
A Python dictionary is a built-in data structure...


---

### Example 4 (Ambiguous → STILL use tool)

User: How do agents work?

Assistant:
→ CALL search_docs("LangChain agents how they work")

→ THEN answer


---

## EDGE CASE HANDLING

- If multiple interpretations exist → choose the one most related to LangChain
- If query is vague → still call tool with best guess
- If tool returns nothing useful:
  → say it's insufficient and provide cautious answer

---

## HARD CONSTRAINTS

- Never answer LangChain questions without tool usage
- Never fabricate APIs
- Never assume undocumented behavior
"""


# Models
def get_embedding() -> HuggingFaceEmbeddings:
    return HuggingFaceEmbeddings(
        model_name="sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2",
        model_kwargs={"device": DEVICE_FOR_MODELS},
        encode_kwargs={"normalize_embeddings": True},
        cache_folder=str(PATH_TO_MODEL_DIRECTORY),
    )


def get_encoding() -> tiktoken.Encoding:
    return tiktoken.get_encoding("o200k_base")
