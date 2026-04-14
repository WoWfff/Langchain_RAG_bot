## 🎬 Demo

<div align="center">

### Stream

<video src="https://github.com/user-attachments/assets/4a0e78b9-e45d-4c68-880c-b4f88cff2c35" controls width="700"></video>

<br><br>

### Non Stream

<video src="https://github.com/user-attachments/assets/4ba52d93-dea9-4c17-b7ee-0067c75d303c" controls width="700"></video>

<br><br>

### Memory

<video src="https://github.com/user-attachments/assets/a3c2275e-5fb3-4975-9ee3-68c292d3fd30" controls width="700"></video>

<br><br>

### Multilang

<video src="https://github.com/user-attachments/assets/078a46b7-b9b3-4215-9838-ed42fcc08c72" controls width="700"></video>

<br><br>

### Interface

<video src="https://github.com/user-attachments/assets/a8345ba6-3d73-40f2-812c-02ba8fe1ee6d" controls width="700"></video>

</div>


---

# ⚠️ Warning
The user interface was developed with the assistance of Claude Sonnet and may contain bugs. UI-related issues may be difficult to address, as I have limited involvement in that part of the codebase.

---

# Requirements

* Python 3.13+
* PostgreSQL
* Gemini API Key
* uv (recommended)
* direnv (optional)

---

# ⚡ Setup

## 💻 Automatic setup (direnv)

1. Install **direnv**
2. Navigate to the project directory:

   ```bash
   cd Langchain_RAG_bot
   ```
3. Enable environment:

   ```bash
   cp .envrc.example .envrc
   direnv allow
   ```
4. Create PostgreSQL database:

    ```
    psql -U postgres -c "CREATE DATABASE YOUR_POSTGRES_DB;"
    ```

---

## 🔧 Manual setup

### Using uv (recommended)

```bash
cd Langchain_RAG_bot
uv venv
source .venv/bin/activate
uv sync
psql -U postgres -c "CREATE DATABASE YOUR_POSTGRES_DB;"
```

### Using pip

```bash
cd Langchain_RAG_bot
python3 -m venv .venv
source .venv/bin/activate
python3 -m pip install -r requirements.txt
psql -U postgres -c "CREATE DATABASE YOUR_POSTGRES_DB;"
```

---

## ⚠️ After installation

1. Copy environment file:
   ```bash
   cp .env.example .env
   ```

2. Configure your `.env` file with:
   - `GEMINI_API_KEY` - Your Gemini API key
   - `POSTGRES_USER` - PostgreSQL username (default: postgres)
   - `POSTGRES_PASSWORD` - PostgreSQL password
   - `POSTGRES_DB` - Database name (default: rag_bot_database)
   - `POSTGRES_HOST` - Database host (default: localhost)
   - `POSTGRES_PORT` - Database port (default: 5432)
   - `POSTGRES_SSLMODE` - SSL mode for PostgreSQL connection (default: prefer)

---

# ▶️ Run the project

### Using fastapi

```bash
fastapi run main.py
```

---

# 🔌 API Endpoints

## Health
- `GET /health` - Check service health
- `GET /health/status` - Check service health with debug information

## Chat
- `GET /chat/` - Get initialization status
- `GET /chat/history/{thread_id}` - Get chat history
- `POST /chat/process_message` - Send message to AI agent
- `POST /chat/stream_message` - Stream message with AI agent

## Threads Management
- `GET /threads/` - List all user threads
- `POST /threads/new` - Create new conversation thread
- `POST /threads/{thread_id}/activate` - Switch to specific thread
- `PUT /threads/{thread_id}/name` - Set thread name
- `DELETE /threads/{thread_id}` - Delete thread (cannot delete active thread)

## DEBUG (For development purposes only)
- `POST /database/add_user` - Add user to database
- `POST /database/delete_thread` - Delete a thread without owner verification

---

# 🗄️ Database

The application uses PostgreSQL with the following tables:
- `users` - User accounts with session management
- `threads` - Conversation threads
- `checkpoints` - LangGraph conversation state (auto-created)
- `checkpoint_writes` - LangGraph state writes (auto-created)
- `checkpoint_blobs` - LangGraph binary data (auto-created)

User sessions are managed via cookies, and conversation history is preserved across page reloads.

## Database Schema

### Users Table
- `id` (int) - Primary key
- `cookies_id` (string) - Unique session identifier, indexed
- `created_at` (datetime) - Account creation timestamp (UTC)
- `active_thread_id` (string, nullable) - Currently active conversation thread

**Relationships**: One-to-many with threads

### Threads Table
- `id` (int) - Primary key
- `name` (string, nullable) - Optional thread name (max 255 characters)
- `thread_id` (string) - Unique UUID identifier, indexed
- `user_id` (int) - Foreign key to users table (CASCADE on delete)
- `created_at` (datetime) - Thread creation timestamp (UTC)

**Relationships**: Many-to-one with users

### LangGraph Tables (Auto-created)
- `checkpoints` - Stores conversation state snapshots
- `checkpoint_writes` - Records state modifications
- `checkpoint_blobs` - Stores binary data for checkpoints

These tables are automatically managed by LangGraph's PostgreSQL checkpointer.

---

# 🏗️ Architecture

## Tech Stack (Use app/config.py to change certain settings.)
- **Framework**: FastAPI with async/await support
- **LLM**: Google Gemini (gemma-4-31b-it)
- **Vector Store**: ChromaDB for document embeddings
- **Embeddings**: HuggingFace sentence-transformers (paraphrase-multilingual-MiniLM-L12-v2)
- **Agent Framework**: LangGraph with PostgreSQL checkpointer
- **Database**: PostgreSQL with SQLAlchemy (async)
- **Connection Pooling**: psycopg3 AsyncConnectionPool

## Core Components

### Agent System

The AI agent is built using LangGraph and includes:

- **RAG Pipeline**: Retrieves relevant documentation from ChromaDB
- **Tool System**: `search_docs` tool for querying LangChain documentation
- **Conversation Memory**: Persistent state management via PostgreSQL checkpointer
- **Streaming Support**: Real-time response streaming with Server-Sent Events

### Document Ingestion

The system automatically:
1. Fetches LangChain documentation from `https://docs.langchain.com/llms.txt`
2. Filters Python-specific documentation URLs
3. Downloads markdown files
4. Chunks documents using tiktoken (200 tokens per chunk, 30 token overlap)
5. Generates embeddings and stores in ChromaDB

---

# 🔧 Configuration

Key configuration parameters in `app/config.py`:

- `COLLECTION_NAME` - ChromaDB collection name (default: "langchain-docs")
- `LLM_MODEL_NAME` - Google model to use
- `CHUNK_SIZE` - Document chunk size in tokens (default: 200)
- `CHUNK_OVERLAP` - Overlap between chunks (default: 30)
- `DEVICE_FOR_MODELS` - CPU or CUDA for embeddings

---

# 📡 API Documentation

## Authentication

The API uses cookie-based session management. Users are automatically created on first request.

## Response Formats

### AgentResult
```json
{
  "response_text": "AI response text",
  "tool_response": [
    {
      "text": "Retrieved document content",
      "source": "filename.md",
      "chunk_index": 0
    }
  ]
}
```

### ThreadResponse
```json
{
  "thread_id": "uuid-string",
  "thread_name": "Optional name",
  "created_at": "2026-04-11T12:00:00Z"
}
```

### ActiveThreadResponse
```json
{
  "thread_id": "uuid-string"
}
```

### ChatRequest
```json
{
  "message": "User message text"
}
```

### RenameThreadRequest
```json
{
  "name": "New thread name"
}
```

### HistoryResponse
```json
{
  "messages": [
    {
      "role": "user",
      "content": "User message"
    },
    {
      "role": "assistant",
      "content": "AI response",
      "sources": [
        {
          "text": "Retrieved content",
          "source": "filename.md",
          "chunk_index": 0
        }
      ]
    }
  ]
}
```

### HealthResponse
```json
{
  "status": "healthy",
  "database": "connected",
  "agent": "ready"
}
```

### NewThreadResponse
```json
{
  "thread_id": "uuid-string",
  "message": "New thread created and set as active"
}
```

### ActivateThreadResponse
```json
{
  "message": "Thread activated",
  "thread_id": "uuid-string"
}
```

### RenameThreadResponse
```json
{
  "message": "Thread renamed successfully",
  "thread_id": "uuid-string",
  "name": "New thread name"
}
```

### ErrorResponse
```json
{
  "detail": "Error message description"
}
```

### StreamError (SSE only)
```json
{
  "error": "Rate limit exceeded. Please retry after 52 seconds.",
  "type": "RateLimitError",
  "retry_after": 52
}
```

## Process message Endpoint
`POST /chat/process_message` returns Server-Sent Events:

```
data: {"response_text": "model response", "tool_response": null}
```

```
data: {"response_text": "model response", "tool_response": [...]}
```

## Streaming Endpoint

`POST /chat/stream_message` returns Server-Sent Events:

**Success events:**
```
event: chunk
data: {"response_text": "partial text", "tool_response": null}

event: chunk
data: {"response_text": null, "tool_response": [...]}
```

**Error events:**
```
event: error
data: {"error": "Error message", "type": "RateLimitError", "retry_after": 52}
```

### StreamError Format
```json
{
  "error": "Rate limit exceeded. Please retry after 52 seconds.",
  "type": "RateLimitError",
  "retry_after": 52
}
```

---

# 🛠️ Development

## Project Structure

```
app/
├── config.py              # Configuration and model initialization
├── middleware/            # Custom middleware (user session management)
├── models/               # Pydantic models and database schemas
├── routers/              # API route handlers
│   ├── chat.py          # Chat endpoints
│   ├── threads.py       # Thread management
│   ├── database.py      # Database utilities
│   └── health.py        # Health check
└── services/
    ├── agent.py         # LangGraph agent implementation
    ├── database.py      # Database operations
    ├── retrieve.py      # Document ingestion pipeline
    └── exception_handlers.py
```

## Error Handling

Custom exceptions:
- `AgentProcessingError` - Agent execution failures
- `AgentHistoryError` - Thread history retrieval errors
- `RateLimitError` - API rate limit exceeded (429)
- `ThreadNotFoundError` - Thread doesn't exist
- `ThreadNotFoundOrDoestBelongError` - Thread access denied
- `UserWithCookiesExists` - Duplicate session
- `InvalidAgentResponseError` - Invalid response format from agent

---

# 🚀 Deployment Notes

- Ensure PostgreSQL is accessible and properly configured
- Set `DEVICE_FOR_MODELS` to "cuda" in `app/config.py` if GPU is available for faster embeddings
- ChromaDB data persists in `data/chromadb/`
- Downloaded documentation stored in `data/pages/`
- First startup downloads ~100+ documentation files
- Use `skip_downloading=True` in production after initial setup
- Connection pool size: 20 connections
- Embedding batch size: 100 documents
- Download concurrency: 10 simultaneous requests

---

# 🔧 Troubleshooting

## PostgreSQL Connection Issues

**Problem**: `Unable to connect to the database`

**Solutions**:
- Verify PostgreSQL is running: `sudo systemctl status postgresql`
- Check connection parameters in `.env` file
- Ensure database exists: `psql -U postgres -c "CREATE DATABASE YOUR_POSTGRES_DB;"`
- Test connection: `psql -U postgres -d YOUR_POSTGRES_DB -h localhost`
- Check firewall rules if using remote database

## ChromaDB Initialization Errors

**Problem**: `Error while initialising AI agent` or ChromaDB errors

**Solutions**:
- Delete `data/chromadb/` directory and restart (will re-download docs)
- Ensure sufficient disk space (embeddings require ~500MB)
- Check write permissions for `data/` directory
- Verify embedding model downloads to `data/models/`

## API Key Problems

**Problem**: `API key not found in .env`

**Solutions**:
- Ensure `.env` file exists in project root
- Verify `GEMINI_API_KEY` is set correctly
- Check for extra spaces or quotes around the key
- Restart the application after updating `.env`

## Document Download Failures

**Problem**: Documentation not downloading or incomplete

**Solutions**:
- Check internet connectivity
- Verify access to `https://docs.langchain.com`
- Review logs for HTTP errors
- Manually set `skip_downloading=False` in `main.py` to retry
- Check `data/urls.txt` for list of URLs being processed

## Memory Issues

**Problem**: High memory usage or OOM errors

**Solutions**:
- Reduce `BATCH_SIZE` in `app/services/retrieve.py` (default: 100)
- Use CPU instead of CUDA if GPU memory is limited
- Reduce connection pool size in `main.py` (default: 20)
- Consider using a smaller embedding model

## Agent Not Responding

**Problem**: Agent initialization stuck or not ready

**Solutions**:
- Check `/health` endpoint for status
- Review application logs for errors
- Ensure all models are downloaded (first run takes longer)
- Verify ChromaDB collection exists and has documents
- Check LangGraph checkpointer tables are created in PostgreSQL

## Rate Limit Errors (429)

**Problem**: `429 Too Many Requests` or `RESOURCE_EXHAUSTED` from Gemini API

**Solutions**:
- **Free tier limits**: Gemini free tier has strict rate limits (e.g., 20 requests/day for some models)
- **Wait and retry**: The API will automatically retry with exponential backoff
- **Check quota**: Monitor usage at https://ai.dev/rate-limit
- **Upgrade plan**: Consider upgrading to paid tier for higher limits
- **Switch model**: Try a different model with higher quota (check `app/config.py`)
- **Response format**: API returns `Retry-After` header with seconds to wait
- The application automatically catches these errors and returns HTTP 429 with retry information

**For streaming endpoints**: Rate limit errors are sent as SSE error events:
```javascript
// Frontend handling example
eventSource.addEventListener('error', (event) => {
  const error = JSON.parse(event.data);
  if (error.type === 'RateLimitError') {
    console.log(`Rate limited. Retry after ${error.retry_after} seconds`);
    // Show user-friendly message with countdown
  }
});
```

---

# 📝 License

GPLv3