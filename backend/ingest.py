"""Ingest text: chunk, embed, store in Chroma."""

from uuid import uuid4

from embeddings import embed_texts
from utils import split_into_chunks
from vector_store import get_collection


def ingest_document(text: str, source: str) -> dict:
    collection = get_collection()
    chunks = split_into_chunks(text, source)
    if not chunks:
        return {"ingested_chunks": 0, "source": source}

    documents = [c["text"] for c in chunks]
    embeddings = embed_texts(documents)
    metadatas = [dict(c["metadata"]) for c in chunks]
    ids = [str(uuid4()) for _ in chunks]

    collection.add(
        ids=ids,
        embeddings=embeddings,
        documents=documents,
        metadatas=metadatas,
    )
    return {"ingested_chunks": len(chunks), "source": source}
