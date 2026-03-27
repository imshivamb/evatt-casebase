"""Persistent Chroma collection with cosine space for semantic search."""

from __future__ import annotations

from pathlib import Path

import chromadb

_CHROMA_DIR = Path(__file__).resolve().parent / "chroma_data"
_COLLECTION_NAME = "legal_cases"


_client: chromadb.PersistentClient | None = None
_collection: chromadb.Collection | None = None


def get_collection() -> chromadb.Collection:
    """Returns the ChromaDB collection singleton.

    Note: PersistentClient is a factory in chromadb; PEP 604 unions evaluate at import
    without postponed annotations and would raise on `function | None`.
    """
    global _client, _collection
    if _collection is not None:
        return _collection
    _chroma_dir = _CHROMA_DIR
    _chroma_dir.mkdir(parents=True, exist_ok=True)
    _client = chromadb.PersistentClient(path=str(_chroma_dir))
    _collection = _client.get_or_create_collection(
        name=_COLLECTION_NAME,
        metadata={"hnsw:space": "cosine"},
    )
    return _collection
