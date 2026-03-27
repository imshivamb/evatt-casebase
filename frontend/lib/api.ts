const API_BASE =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ??
  "https://evatt-casebase-1.onrender.com";

export type SearchResult = {
  snippet: string;
  metadata: Record<string, string | number | boolean | null>;
  score: number | null;
};

export type SearchResponse = {
  query: string;
  results: SearchResult[];
  requested_top_k: number;
  effective_top_k: number;
  index_chunk_count: number;
  returned: number;
};

export type SampleFile = {
  name: string;
  text: string;
};

export async function fetchSamples(): Promise<SampleFile[]> {
  const res = await fetch(`${API_BASE}/samples`);
  if (!res.ok) throw new Error(`Could not load samples (${res.status})`);
  return res.json() as Promise<SampleFile[]>;
}

export async function fetchStats(): Promise<{ chunk_count: number }> {
  const res = await fetch(`${API_BASE}/stats`);
  if (!res.ok) throw new Error(`Stats failed (${res.status})`);
  return res.json() as Promise<{ chunk_count: number }>;
}

export async function resetIndex(): Promise<void> {
  const res = await fetch(`${API_BASE}/reset`, { method: "DELETE" });
  if (!res.ok) throw new Error(`Reset failed (${res.status})`);
}

export async function ingestText(text: string, source: string): Promise<unknown> {
  const res = await fetch(`${API_BASE}/ingest`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, source }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || `Ingest failed (${res.status})`);
  }
  return res.json();
}

export async function ingestFile(file: File, source: string): Promise<unknown> {
  const fd = new FormData();
  fd.append("file", file);
  const q = new URLSearchParams();
  if (source.trim()) q.set("source", source.trim());
  const res = await fetch(`${API_BASE}/ingest/file?${q}`, {
    method: "POST",
    body: fd,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || `Ingest failed (${res.status})`);
  }
  return res.json();
}

export async function searchCases(
  query: string,
  topK: number,
): Promise<SearchResponse> {
  const res = await fetch(`${API_BASE}/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, top_k: topK }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || `Search failed (${res.status})`);
  }
  return res.json();
}

export type StreamEvent =
  | { type: "chunk"; text: string }
  | { type: "done" }
  | { type: "error"; text: string };

/**
 * POST /search/stream and yield SSE events as they arrive.
 * Uses fetch + ReadableStream (works in all modern browsers, no EventSource needed).
 */
export async function* streamSummary(
  query: string,
  topK: number,
): AsyncGenerator<StreamEvent> {
  const res = await fetch(`${API_BASE}/search/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, top_k: topK }),
  });
  if (!res.ok || !res.body) {
    yield { type: "error", text: `Stream failed (${res.status})` };
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE lines are separated by \n\n; each line starts with "data: "
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? ""; // keep incomplete last chunk

    for (const part of parts) {
      const line = part.trim();
      if (!line.startsWith("data: ")) continue;
      try {
        const event = JSON.parse(line.slice(6)) as StreamEvent;
        yield event;
        if (event.type === "done") return;
      } catch {
        // malformed SSE line — skip
      }
    }
  }
  yield { type: "done" };
}
