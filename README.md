# Evatt Casebase — Mini Legal Case Search (RAG-lite)

A minimal **legal case search prototype** using **semantic retrieval** over locally stored embeddings. Demonstrates structured ingestion (PDF + text), vector search, and a clean UI with **streaming AI-generated summaries** — no auth, payments, or managed cloud required.

---

## What it does

Paste, upload a `.txt`, or upload a **PDF** → backend splits it into structured chunks with metadata → embeds using [`all-MiniLM-L6-v2`](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2) → stores in a local Chroma vector DB. Then: run a natural language query → retrieve top-K semantically similar passages → display ranked snippets **and** stream a grounded AI summary via `gpt-5.4-mini`.

---

## Architecture

```
Browser (Next.js)
    │  POST /ingest         →  chunk + embed + store
    │  POST /ingest/file    →  PDF or .txt → extract → chunk + embed + store
    │  POST /search         →  embed query + similarity search → ranked results
    │  POST /search/stream  →  retrieve top-K → stream AI summary (SSE)
    ↓
FastAPI (Python)
    ├── pypdf               PDF text extraction
    ├── sentence-transformers  local embeddings (all-MiniLM-L6-v2)
    └── Chroma              local persistent vector DB
```

---

## Key decisions

### 1. Structured chunking
Not fixed-size — the pipeline:
- Splits on paragraph boundaries (`\n\n`)
- Detects legal section headings (`FACTS`, `JUDGMENT`, `HELD`, `ORDERS`, `CONCLUSION`) and tags each chunk with its section
- 120-char overlap on oversized paragraphs to avoid cutting mid-sentence

Each chunk stored as:
```json
{ "text": "...", "metadata": { "source": "smith_v_jones", "section": "judgement" } }
```

### 2. PDF ingestion
`POST /ingest/file` auto-detects `.pdf` by filename extension and routes through `pypdf.PdfReader` before chunking. `.txt` files fall back to plain UTF-8 decode.

### 3. Retrieval before generation (with streaming)
Retrieval runs first — the top-K chunks are grounded context. `POST /search/stream` then calls **`gpt-5.4-mini`** (override with `OPENAI_SUMMARY_MODEL`) and streams the summary as SSE. **If no `OPENAI_API_KEY` is set**, the stream returns an error event so the UI can show a “key required” state — core search still works.

### 4. Local-first, zero API keys required
Core retrieval works entirely locally (sentence-transformers + Chroma). The AI summary is an optional enhancement.

---

## How to run

### Backend

```bash
cd backend
python -m venv .venv
# Windows:
.venv\Scripts\activate
# macOS/Linux: source .venv/bin/activate

pip install -r requirements.txt
```

Optional — add your OpenAI key to enable AI summaries:
```bash
copy .env.example .env   # Windows
# Then set: OPENAI_API_KEY=sk-...
```

```bash
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

> First run downloads the embedding model (~80 MB, one-time).

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Try it instantly

Click **"Load sample cases"** — auto-ingests all files in `data/`. Then search:
- `breach of contract retail`
- `force majeure delivery`
- `restraint of trade`

---

## API

| Method | Path | Body / Notes |
|--------|------|------|
| `GET` | `/health` | — |
| `GET` | `/samples` | Returns `[{name, text}]` from `data/*.txt` |
| `POST` | `/ingest` | `{ "text": "...", "source": "case_id" }` |
| `POST` | `/ingest/file` | `multipart/form-data` — `.txt` or `.pdf` + optional `?source=` |
| `POST` | `/search` | `{ "query": "...", "top_k": 5 }` |
| `POST` | `/search/stream` | Same body — returns SSE stream of AI summary chunks |

---

## Project layout

```
backend/
  main.py          FastAPI — all endpoints including /search/stream SSE
  ingest.py        Chunk → embed → Chroma write
  search.py        Query embed → Chroma similarity search → ranked results
  embeddings.py    sentence-transformers wrapper (lru_cache lazy load)
  utils.py         Paragraph chunker with section inference & overlap
  vector_store.py  Chroma PersistentClient singleton
  .env.example     Copy to .env, add OPENAI_API_KEY

frontend/
  app/page.tsx                 Main page — Ingest → Search → AI Summary → Results
  app/components/
    Upload.tsx                 Paste text or upload .txt/.pdf, one-click sample loader
    Search.tsx                 Query input with top-K control
    StreamingSummary.tsx       Streams AI summary token-by-token via /search/stream
    Results.tsx                Ranked snippets with relevance badge + source
  lib/api.ts                   Typed fetch wrappers incl. streamSummary() async generator

data/
  sample_cases.txt             Contract law samples
  sample_employment.txt        Employment law samples
  sample_ip_privacy.txt        IP & privacy law samples
```

---

## Deploy API on Render (free tier)

Render probes for an open **port** while your process starts. Loading **PyTorch + sentence-transformers** at import time can delay binding and triggers *“No open ports detected”*. This repo **lazy-loads** the embedding model on first ingest/search so `uvicorn` can listen immediately.

**Web Service settings**

| Setting | Value |
|--------|--------|
| **Root directory** | `backend` |
| **Build command** | `pip install -r requirements.txt` |
| **Start command** | `uvicorn main:app --host 0.0.0.0 --port $PORT` |
| **Python** | 3.11.x (set `PYTHON_VERSION` if needed) |

Set env vars: `OPENAI_API_KEY`, optional `CORS_ORIGINS` / `OPENAI_SUMMARY_MODEL`. Chroma files on disk are **ephemeral** on free instances — expect an empty index after redeploys until someone ingests again.

---

## Production path

- Swap Chroma → **Qdrant / Pinecone** (chunk shape already aligned)
- Add a **cross-encoder reranker** between retrieval and generation
- Add **metadata filters** (court, year, jurisdiction) as Chroma `where` clauses
- Containerise with **Docker Compose** (FastAPI + Next.js)
