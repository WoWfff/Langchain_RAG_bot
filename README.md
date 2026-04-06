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

---

## 🔧 Manual setup

### Using uv (recommended)

```bash
cd Langchain_RAG_bot
uv venv
source .venv/bin/activate
uv sync
```

### Using pip

```bash
cd Langchain_RAG_bot
python3 -m venv .venv
source .venv/bin/activate
python3 -m pip install -r requirements.txt
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

---

# ▶️ Run the project

### Using uv

```bash
uv run main.py
```

### Using pip

```bash
python3 main.py
```

---

# 🔌 API Endpoints

## Chat
- `GET /chat/` - Get initialization status
- `POST /chat/process_message` - Send message to AI agent

## Threads Management
- `GET /threads/` - List all user threads
- `POST /threads/new` - Create new conversation thread
- `POST /threads/{thread_id}/activate` - Switch to specific thread
- `DELETE /threads/{thread_id}` - Delete thread (cannot delete active thread)

## Health
- `GET /health` - Check service health

---

# 🗄️ Database

The application uses PostgreSQL with the following tables:
- `users` - User accounts with session management
- `threads` - Conversation threads
- `checkpoints` - LangGraph conversation state (auto-created)
- `checkpoint_writes` - LangGraph state writes (auto-created)
- `checkpoint_blobs` - LangGraph binary data (auto-created)

User sessions are managed via cookies, and conversation history is preserved across page reloads.