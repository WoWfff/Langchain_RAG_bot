# Requirements

* Python 3.13+
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
   Execute:

   ```bash
   cp .env.example .env
   ```
   Then write your Gemini API key into .env file


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
