"use client";

import { useCallback, useState } from "react";
import type { SearchResult, SearchResponse } from "@/lib/api";
import { Results } from "./components/Results";
import { Search } from "./components/Search";
import { StreamingSummary } from "./components/StreamingSummary";
import { Upload } from "./components/Upload";

export default function Home() {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [lastQuery, setLastQuery] = useState<string | null>(null);
  const [topK, setTopK] = useState(5);
  const [ingestMsg, setIngestMsg] = useState<string | null>(null);
  const [streamTrigger, setStreamTrigger] = useState(0);
  const [retrievalMeta, setRetrievalMeta] = useState<{
    effectiveTopK: number;
    indexChunkCount: number;
    returned: number;
  } | null>(null);

  const onResults = useCallback((data: SearchResponse) => {
    setResults(data.results);
    setLastQuery(data.query);
    setTopK(data.requested_top_k);
    setRetrievalMeta({
      effectiveTopK: data.effective_top_k,
      indexChunkCount: data.index_chunk_count,
      returned: data.returned,
    });
    setStreamTrigger((n) => n + 1); // kick off streaming summary (uses latest topK via ref in child)
  }, []);

  const clearSearchSession = useCallback(() => {
    setResults([]);
    setLastQuery(null);
    setRetrievalMeta(null);
    setStreamTrigger(0);
  }, []);

  return (
    <div className="min-h-full bg-stone-50 dark:bg-[#0d0f10]">
      {/* Header */}
      <header className="border-b border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900">
        <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
          {/* Logo row */}
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-700 text-white">
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25"
                />
              </svg>
            </div>
            <span className="text-sm font-semibold tracking-tight text-stone-900 dark:text-stone-100">
              Evatt Casebase
            </span>
            <span className="ml-1 rounded-full border border-teal-200 bg-teal-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-teal-700 dark:border-teal-800 dark:bg-teal-900/30 dark:text-teal-400">
              Prototype
            </span>
          </div>

          {/* Hero */}
          <div className="mt-4">
            <h1 className="text-2xl font-bold tracking-tight text-stone-900 dark:text-stone-50">
              Mini Legal Case Search
            </h1>
            <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
              Semantic retrieval over legal judgments — structured ingestion,
              local embeddings, vector search, AI-generated summaries.
            </p>
          </div>

          {/* Tech pills */}
          <div className="mt-4 flex flex-wrap gap-2">
            {[
              "FastAPI",
              "sentence-transformers",
              "Chroma vector DB",
              "PDF + text ingestion",
              "Streaming AI summary",
            ].map((t) => (
              <span
                key={t}
                className="rounded-full bg-stone-100 px-2.5 py-1 text-[11px] font-medium text-stone-600 dark:bg-stone-800 dark:text-stone-400"
              >
                {t}
              </span>
            ))}
          </div>

          {/* Ingest confirmation */}
          {ingestMsg && (
            <p className="mt-3 text-xs font-medium text-teal-700 dark:text-teal-400">
              {ingestMsg}
            </p>
          )}
        </div>
      </header>

      {/* Main workflow */}
      <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
        <div className="flex items-center gap-4 text-xs text-stone-400 dark:text-stone-600">
          <span className="flex items-center gap-1.5">
            <span className="h-px w-6 bg-stone-300 dark:bg-stone-700" />
            Step 1: Ingest
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-px w-6 bg-stone-300 dark:bg-stone-700" />
            Step 2: Search
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-px w-6 bg-stone-300 dark:bg-stone-700" />
            Step 3: Results + AI summary
          </span>
        </div>

        <Upload onIngested={setIngestMsg} />
        <Search onResults={onResults} onQueryCleared={clearSearchSession} />
        <StreamingSummary
          query={lastQuery}
          topK={topK}
          trigger={streamTrigger}
        />
        <Results
          results={results}
          lastQuery={lastQuery}
          requestedTopK={topK}
          retrievalMeta={retrievalMeta}
        />
      </main>

      <footer className="mx-auto max-w-3xl px-4 pb-8 sm:px-6">
        <p className="text-center text-[11px] text-stone-400 dark:text-stone-600">
          RAG-lite prototype · no auth · local vector index · AI summary via
          gpt-5.4-mini
        </p>
      </footer>
    </div>
  );
}
