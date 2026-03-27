"use client";

import { useCallback, useState } from "react";
import { searchCases, type SearchResponse } from "@/lib/api";

type Props = {
  onResults: (data: SearchResponse) => void;
  /** When the query box is cleared, reset results / summary upstream. */
  onQueryCleared?: () => void;
};

export function Search({ onResults, onQueryCleared }: Props) {
  const [query, setQuery] = useState("");
  const [topK, setTopK] = useState(5);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async () => {
    setError(null);
    setBusy(true);
    const q = query.trim();
    try {
      const data = await searchCases(q, topK);
      onResults(data);
    } catch (e) {
      onResults({
        query: q,
        results: [],
        requested_top_k: topK,
        effective_top_k: 0,
        index_chunk_count: 0,
        returned: 0,
      });
      setError(e instanceof Error ? e.message : "Search failed");
    } finally {
      setBusy(false);
    }
  }, [query, topK, onResults]);

  return (
    <section className="rounded-xl border border-stone-200 bg-white shadow-sm dark:border-stone-700 dark:bg-stone-900">
      {/* Section header */}
      <div className="border-b border-stone-100 px-6 py-4 dark:border-stone-800">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-stone-900 text-[11px] font-bold text-white dark:bg-stone-100 dark:text-stone-900">
            2
          </span>
          <h2 className="text-base font-semibold tracking-tight text-stone-900 dark:text-stone-100">
            Search
          </h2>
          <span className="ml-auto rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-medium text-stone-500 dark:bg-stone-800 dark:text-stone-400">
            semantic · top-K retrieval
          </span>
        </div>
      </div>
      <div className="p-6">
      <p className="mb-4 text-xs text-stone-500 dark:text-stone-400">
        Natural language query over ingested chunks — press <kbd className="rounded border border-stone-200 bg-stone-100 px-1 py-0.5 font-mono text-[10px] dark:border-stone-700 dark:bg-stone-800">Enter</kbd> or click Search.
      </p>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="block min-w-0 flex-1 text-sm font-medium text-stone-700 dark:text-stone-300">
          Query
          <input
            type="search"
            value={query}
            onChange={(e) => {
              const v = e.target.value;
              setQuery(v);
              if (!v.trim()) {
                setError(null);
                onQueryCleared?.();
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") void run();
            }}
            className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-stone-900 outline-none ring-teal-600/30 focus:ring-2 dark:border-stone-600 dark:bg-stone-950 dark:text-stone-100"
            placeholder='e.g. "breach of contract in retail"'
          />
        </label>
        <label className="block w-full text-sm font-medium text-stone-700 sm:w-28 dark:text-stone-300">
          Top K
          <input
            type="number"
            min={1}
            max={20}
            value={topK}
            onChange={(e) => setTopK(Number(e.target.value) || 5)}
            className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-stone-900 outline-none ring-teal-600/30 focus:ring-2 dark:border-stone-600 dark:bg-stone-950 dark:text-stone-100"
          />
        </label>
        <button
          type="button"
          onClick={() => void run()}
          disabled={busy || !query.trim()}
          className="h-[42px] shrink-0 rounded-lg bg-stone-900 px-4 text-sm font-medium text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-white"
        >
          {busy ? "Searching…" : "Search"}
        </button>
      </div>

      {error ? (
        <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>
      ) : null}
      </div>
    </section>
  );
}
