"""Local embeddings via sentence-transformers (no API key)."""

from functools import lru_cache
from typing import TYPE_CHECKING

import numpy as np

if TYPE_CHECKING:
    from sentence_transformers import SentenceTransformer

_MODEL_NAME = "all-MiniLM-L6-v2"


@lru_cache(maxsize=1)
def _model():
    # Import lazily so the API can bind to $PORT before PyTorch / ST load (Render health checks).
    from sentence_transformers import SentenceTransformer

    return SentenceTransformer(_MODEL_NAME)


def embed_texts(texts: list[str]) -> list[list[float]]:
    if not texts:
        return []
    model = _model()
    vectors = model.encode(
        texts,
        convert_to_numpy=True,
        normalize_embeddings=True,
        show_progress_bar=False,
    )
    if isinstance(vectors, np.ndarray):
        return vectors.astype(np.float32).tolist()
    return [np.asarray(v, dtype=np.float32).tolist() for v in vectors]


def embed_query(text: str) -> list[float]:
    return embed_texts([text])[0]
