"""Chunking with simple structure and metadata for legal-style text."""

import re
from typing import Any

_SECTION_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"^(judgment|judgement)\s*[:\.]?\s*$", re.I), "judgement"),
    (re.compile(r"^(facts|background|introduction)\s*[:\.]?\s*$", re.I), "facts"),
    (re.compile(r"^(held|holding|decision|orders?)\s*[:\.]?\s*$", re.I), "held"),
    (re.compile(r"^(reasons?|analysis|discussion)\s*[:\.]?\s*$", re.I), "reasons"),
    (re.compile(r"^(conclusion)\s*[:\.]?\s*$", re.I), "conclusion"),
]

_DEFAULT_MAX_CHARS = 900
_OVERLAP_CHARS = 120


def _infer_section_from_heading(first_line: str) -> str | None:
    line = first_line.strip()
    if len(line) > 80:
        return None
    for pattern, label in _SECTION_PATTERNS:
        if pattern.match(line):
            return label
    return None


def _split_oversized_paragraph(text: str, max_chars: int) -> list[str]:
    if len(text) <= max_chars:
        return [text]
    parts: list[str] = []
    start = 0
    while start < len(text):
        end = min(start + max_chars, len(text))
        if end < len(text):
            break_at = text.rfind(". ", start + max_chars // 3, end)
            if break_at == -1:
                break_at = text.rfind(" ", start + max_chars // 3, end)
            if break_at > start:
                end = break_at + 1
        chunk = text[start:end].strip()
        if chunk:
            parts.append(chunk)
        if end >= len(text):
            break
        start = max(start + 1, end - _OVERLAP_CHARS)
    return parts if parts else [text[:max_chars]]


def split_into_chunks(
    text: str,
    source: str,
    *,
    max_chars: int = _DEFAULT_MAX_CHARS,
) -> list[dict[str, Any]]:
    """
    Split by paragraphs; attach source and section metadata.
    Long paragraphs are split with light overlap.
    If the text lacks typical markdown paragraph breaks (e.g., from PDF extraction),
    falls back to splitting on every newline so section headings are still detected.
    """
    normalized = text.replace("\r\n", "\n").strip()
    if not normalized:
        return []

    if "\n\n" not in normalized and "\n" in normalized:
        paragraphs = [p.strip() for p in normalized.split("\n") if p.strip()]
    else:
        paragraphs = [p.strip() for p in re.split(r"\n\s*\n", normalized) if p.strip()]
    chunks: list[dict[str, Any]] = []
    current_section = "body"

    for para in paragraphs:
        lines = para.split("\n", 1)
        first = lines[0].strip()
        inferred = _infer_section_from_heading(first)
        body = para
        if inferred and len(lines) > 1:
            current_section = inferred
            body = lines[1].strip()
            if not body:
                continue
        elif inferred:
            current_section = inferred
            continue

        for piece in _split_oversized_paragraph(body, max_chars):
            if len(piece) > max_chars:
                piece = piece[:max_chars]
            chunks.append(
                {
                    "text": piece,
                    "metadata": {
                        "source": source,
                        "section": current_section,
                    },
                }
            )

    return chunks
