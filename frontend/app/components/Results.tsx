"use client";

import type { SearchResult } from "@/lib/api";

type RetrievalMeta = {
  effectiveTopK: number;
  indexChunkCount: number;
  returned: number;
};

type Props = {
  results: SearchResult[];
  lastQuery: string | null;
  requestedTopK: number;
  retrievalMeta: RetrievalMeta | null;
};

function metaLine(m: SearchResult["metadata"]): string {
  const source = m.source != null ? String(m.source) : "unknown";
  const section = m.section != null ? String(m.section) : "";
  return section ? `${source} · ${section}` : source;
}

function RelevanceBadge({ score }: { score: number | null }) {
  if (score == null) return null;
  const pct = Math.round(score * 100);
  const label = pct >= 75 ? "High match" : pct >= 50 ? "Good match" : "Partial";
  const color =
    pct >= 75
      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
      : pct >= 50
        ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
        : "bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-400";
  const barColor =
    pct >= 75
      ? "bg-emerald-500"
      : pct >= 50
        ? "bg-amber-500"
        : "bg-stone-400";

  return (
    <div className="flex items-center gap-2">
      <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${color}`}>
        {label}
      </span>
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-stone-200 dark:bg-stone-700">
        <div
          className={`h-full rounded-full ${barColor} transition-all`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs tabular-nums text-stone-400 dark:text-stone-500">
        {pct}%
      </span>
    </div>
  );
}

export function Results({
  results,
  lastQuery,
  requestedTopK,
  retrievalMeta,
}: Props) {
  if (!lastQuery && results.length === 0) {
    return (
      <section className="rounded-xl border border-dashed border-stone-200 bg-stone-50/60 p-8 dark:border-stone-700 dark:bg-stone-900/30">
        <div className="flex flex-col items-center gap-2 text-center">
          <svg
            className="h-8 w-8 text-stone-300 dark:text-stone-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 15.803 7.5 7.5 0 0 0 15.803 15.803z"
            />
          </svg>
          <p className="text-sm text-stone-500 dark:text-stone-400">
            Search results will appear here — ranked by semantic similarity.
          </p>
        </div>
      </section>
    );
  }

  if (results.length === 0 && lastQuery) {
    return (
      <section className="rounded-xl border border-stone-200 bg-white p-6 shadow-sm dark:border-stone-700 dark:bg-stone-900">
        <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100">
          Results
        </h2>
        <p className="mt-2 text-sm text-stone-500 dark:text-stone-400">
          No matches for that query. Try different wording or ingest more case
          text first.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-stone-200 bg-white shadow-sm dark:border-stone-700 dark:bg-stone-900">
      {/* Header */}
      <div className="border-b border-stone-100 px-6 py-4 dark:border-stone-800">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100">
            Results
            <span className="ml-2 rounded-full bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-600 dark:bg-stone-800 dark:text-stone-400">
              {results.length}
            </span>
          </h2>
          <div className="text-right text-sm text-stone-500 dark:text-stone-400">
            {lastQuery ? (
              <p>
                for{" "}
                <span className="font-medium text-stone-800 dark:text-stone-200">
                  &ldquo;{lastQuery}&rdquo;
                </span>
              </p>
            ) : null}
            {retrievalMeta && retrievalMeta.indexChunkCount > 0 ? (
              <p className="mt-1 text-xs text-stone-400 dark:text-stone-500">
                Top K requested: {requestedTopK}
                {retrievalMeta.effectiveTopK < requestedTopK ? (
                  <>
                    {" "}
                    · retrieved {retrievalMeta.returned} (capped by{" "}
                    {retrievalMeta.indexChunkCount} chunk
                    {retrievalMeta.indexChunkCount === 1 ? "" : "s"} in index)
                  </>
                ) : (
                  <> · retrieved {retrievalMeta.returned}</>
                )}
              </p>
            ) : null}
          </div>
        </div>
      </div>

      {/* Result list */}
      <ol className="divide-y divide-stone-100 dark:divide-stone-800">
        {results.map((r, i) => (
          <li key={`${i}-${r.snippet.slice(0, 40)}`} className="p-5">
            {/* Top row: rank + source badge + relevance */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-teal-700 text-[11px] font-bold text-white">
                  {i + 1}
                </span>
                <span className="rounded-md bg-teal-50 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-teal-800 dark:bg-teal-900/30 dark:text-teal-300">
                  {metaLine(r.metadata)}
                </span>
              </div>
              <RelevanceBadge score={r.score} />
            </div>

            {/* Snippet text */}
            <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-stone-700 dark:text-stone-300">
              {r.snippet}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}
