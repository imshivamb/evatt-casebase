"""Semantic search over ingested chunks (Chroma vector query only)."""

from embeddings import embed_query
from vector_store import get_collection


def _snippet_key(snippet: str) -> str:
    """Stable key so duplicate ingests (same text) collapse to one hit."""
    return " ".join((snippet or "").split())


def _dedupe_top_k(results: list[dict], k: int) -> list[dict]:
    """Keep Chroma’s relevance order; skip repeated identical snippets."""
    seen: set[str] = set()
    out: list[dict] = []
    for r in results:
        key = _snippet_key(r.get("snippet", ""))
        if not key or key in seen:
            continue
        seen.add(key)
        out.append(r)
        if len(out) >= k:
            break
    return out


def search(query: str, top_k: int = 5) -> dict:
    collection = get_collection()
    count = int(collection.count())
    if count == 0:
        return {
            "results": [],
            "requested_top_k": top_k,
            "effective_top_k": 0,
            "index_chunk_count": 0,
            "returned": 0,
        }

    requested = max(1, min(int(top_k), 20))
    k = min(requested, count)

    # Ask for more than k neighbours so we can drop duplicate snippets (common if
    # the same case text was ingested multiple times).
    fetch_n = min(count, max(k * 15, k + 20))

    q_emb = embed_query(query.strip())
    raw = collection.query(
        query_embeddings=[q_emb],
        n_results=int(fetch_n),
        include=["documents", "metadatas", "distances"],
    )

    row_docs = (raw.get("documents") or [[]])[0]
    row_metas = (raw.get("metadatas") or [[]])[0]
    row_dists = (raw.get("distances") or [[]])[0]

    candidates: list[dict] = []
    for i, doc in enumerate(row_docs):
        if doc is None:
            continue
        meta = row_metas[i] if i < len(row_metas) else {}
        dist = row_dists[i] if i < len(row_dists) else None
        score = None
        if dist is not None:
            try:
                d = float(dist)
                score = round(1.0 / (1.0 + d), 4)
            except (TypeError, ValueError):
                score = None
        candidates.append(
            {
                "snippet": doc,
                "metadata": meta or {},
                "score": score,
            }
        )

    results = _dedupe_top_k(candidates, k)

    return {
        "results": results,
        "requested_top_k": requested,
        "effective_top_k": k,
        "index_chunk_count": count,
        "returned": len(results),
    }
