"""Evatt Casebase API — ingest, search, and streaming AI summary."""

import os
from io import BytesIO
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from ingest import ingest_document
from search import search as run_search

load_dotenv()

_DATA_DIR = Path(__file__).resolve().parent.parent / "data"
_OPENAI_KEY = os.getenv("OPENAI_API_KEY", "").strip()
# Latest capable mini for summaries (override if your org pins a snapshot)
_OPENAI_MODEL = os.getenv("OPENAI_SUMMARY_MODEL", "gpt-5.4-mini").strip() or "gpt-5.4-mini"

app = FastAPI(title="Evatt Casebase API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class IngestBody(BaseModel):
    text: str = Field(..., min_length=1)
    source: str = Field(default="upload", max_length=256)


class SearchBody(BaseModel):
    query: str = Field(..., min_length=1)
    top_k: int = Field(default=5, ge=1, le=20)


def _extract_pdf_text(raw: bytes) -> str:
    """
    Extract plain text from a PDF byte payload using pypdf.

    Raises HTTPException if PDF parsing fails.
    """
    try:
        from pypdf import PdfReader

        reader = PdfReader(BytesIO(raw))
        pages = [page.extract_text() or "" for page in reader.pages]
        return "\n\n".join(p.strip() for p in pages if p.strip())
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=422, detail=f"PDF parse error: {exc}") from exc


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/samples")
def list_samples() -> list[dict]:
    """Return all .txt files from the data/ folder as {name, text} objects."""
    results = []
    if _DATA_DIR.is_dir():
        for f in sorted(_DATA_DIR.glob("*.txt")):
            try:
                results.append(
                    {"name": f.stem, "text": f.read_text(encoding="utf-8", errors="replace")}
                )
            except OSError:
                pass
    return results


@app.get("/stats")
def stats() -> dict:
    """Return how many chunks are currently stored in the vector index."""
    from vector_store import get_collection
    return {"chunk_count": get_collection().count()}


@app.delete("/reset")
def reset_index() -> dict:
    """
    Drop and recreate the Chroma collection.
    Use this to clear duplicate chunks from repeated ingestion.
    """
    import chromadb
    from vector_store import _CHROMA_DIR, _COLLECTION_NAME, get_collection
    import vector_store

    vector_store._client = None
    vector_store._collection = None

    client = chromadb.PersistentClient(path=str(_CHROMA_DIR))
    try:
        client.delete_collection(_COLLECTION_NAME)
    except Exception:  # noqa: BLE001
        pass
    client.get_or_create_collection(
        name=_COLLECTION_NAME,
        metadata={"hnsw:space": "cosine"},
    )
    return {"status": "reset", "chunk_count": 0}


@app.post("/ingest")
def ingest(body: IngestBody) -> dict:
    return ingest_document(body.text.strip(), body.source.strip() or "upload")


@app.post("/ingest/file")
async def ingest_file(
    file: UploadFile = File(...),
    source: str | None = Query(default=None),
) -> dict:
    raw = await file.read()
    filename = file.filename or "file"

    if filename.lower().endswith(".pdf"):
        text = _extract_pdf_text(raw)
    else:
        text = raw.decode("utf-8", errors="replace")

    text = text.strip()
    if not text:
        raise HTTPException(status_code=422, detail="No text could be extracted from the file.")

    label = (source or filename.rsplit(".", 1)[0] or "file").strip() or "file"
    return ingest_document(text, label)


@app.post("/search")
def search_endpoint(body: SearchBody) -> dict:
    payload = run_search(body.query.strip(), top_k=body.top_k)
    return {
        "query": body.query,
        "requested_top_k": body.top_k,
        "effective_top_k": payload["effective_top_k"],
        "index_chunk_count": payload["index_chunk_count"],
        "returned": payload["returned"],
        "results": payload["results"],
    }


@app.post("/search/stream")
async def search_stream(body: SearchBody) -> StreamingResponse:
    """
    Retrieve top-K chunks, then stream an AI-generated summary via SSE.
    Requires OPENAI_API_KEY in backend/.env.
    Falls back to a plain retrieval summary if no key is configured.
    """
    payload = run_search(body.query.strip(), top_k=body.top_k)
    results = payload["results"]

    async def _no_key_stream():
        """Yield a specific error if the API key is not configured."""
        import json
        payload = json.dumps({"type": "error", "text": "OPENAI_API_KEY_MISSING"})
        yield f"data: {payload}\n\n"

    if not _OPENAI_KEY:
        return StreamingResponse(_no_key_stream(), media_type="text/event-stream")

    import json

    from openai import AsyncOpenAI

    context_blocks = []
    for i, r in enumerate(results, 1):
        src = r.get("metadata", {}).get("source", "unknown")
        sec = r.get("metadata", {}).get("section", "")
        label = f"{src} ({sec})" if sec else src
        context_blocks.append(f"[{i}] {label}:\n{r.get('snippet', '')}")

    context = "\n\n---\n\n".join(context_blocks)
    system_prompt = (
        "You are a legal research assistant. Given retrieved passages from legal judgments, "
        "write a concise, grounded summary (3–5 sentences) that directly answers the user's query. "
        "Cite sources by their label (e.g. [1], [2]). Do not hallucinate facts not in the passages."
    )
    user_prompt = (
        f"Query: {body.query}\n\n"
        f"Retrieved passages:\n\n{context}\n\n"
        "Summarise the key legal principles and holdings relevant to the query."
    )

    async def _openai_stream():
        client = AsyncOpenAI(api_key=_OPENAI_KEY)
        # Newer chat models prefer max_completion_tokens; older ones use max_tokens.
        _m = _OPENAI_MODEL.lower()
        _use_completion_cap = _m.startswith(
            ("gpt-5", "o1", "o3", "o4"),
        ) or _m.startswith("gpt-4.1")
        _cap_kw = (
            {"max_completion_tokens": 512}
            if _use_completion_cap
            else {"max_tokens": 512}
        )
        try:
            stream = await client.chat.completions.create(
                model=_OPENAI_MODEL,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                stream=True,
                temperature=0.2,
                **_cap_kw,
            )
            async for chunk in stream:
                delta = chunk.choices[0].delta.content or ""
                if delta:
                    yield f"data: {json.dumps({'type': 'chunk', 'text': delta})}\n\n"
        except Exception as exc:  # noqa: BLE001
            yield f"data: {json.dumps({'type': 'error', 'text': str(exc)})}\n\n"
        finally:
            yield f"data: {json.dumps({'type': 'done'})}\n\n"

    return StreamingResponse(_openai_stream(), media_type="text/event-stream")
