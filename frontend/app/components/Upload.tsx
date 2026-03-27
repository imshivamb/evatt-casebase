"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchSamples, fetchStats, ingestFile, ingestText, resetIndex, type SampleFile } from "@/lib/api";

type Props = {
  onIngested?: (message: string) => void;
};

export function Upload({ onIngested }: Props) {
  const [text, setText] = useState("");
  const [source, setSource] = useState("case_upload");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"text" | "file">("text");
  const [chunkCount, setChunkCount] = useState<number | null>(null);

  const refreshCount = useCallback(() => {
    fetchStats()
      .then((s) => setChunkCount(s.chunk_count))
      .catch(() => setChunkCount(null));
  }, []);

  // Load count on mount
  useEffect(() => { refreshCount(); }, [refreshCount]);

  const runIngest = useCallback(async () => {
    setError(null);
    setStatus(null);
    setBusy(true);
    try {
      const payload = await ingestText(text, source || "case_upload");
      const n =
        typeof payload === "object" &&
        payload !== null &&
        "ingested_chunks" in payload
          ? String((payload as { ingested_chunks: number }).ingested_chunks)
          : "?";
      const msg = `Success: Ingested ${n} chunks from "${source || "case_upload"}"`;
      setStatus(msg);
      onIngested?.(msg);
      refreshCount();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ingest failed");
    } finally {
      setBusy(false);
    }
  }, [text, source, onIngested]);

  const loadSamples = useCallback(async () => {
    setError(null);
    setStatus(null);
    setBusy(true);
    try {
      // Fetch all sample files from the backend's data/ directory
      const samples: SampleFile[] = await fetchSamples();
      if (samples.length === 0) {
        setError("No sample files found in data/ folder.");
        return;
      }
      let totalChunks = 0;
      for (const sample of samples) {
        const payload = await ingestText(sample.text, sample.name);
        if (
          typeof payload === "object" &&
          payload !== null &&
          "ingested_chunks" in payload
        ) {
          totalChunks += (payload as { ingested_chunks: number }).ingested_chunks;
        }
      }
      // Show the first sample in the textarea for reference
      setText(samples[0].text);
      setSource(samples[0].name);
      const msg = `Success: Loaded ${samples.length} sample files (${totalChunks} chunks total)`;
      setStatus(msg);
      onIngested?.(msg);
      refreshCount();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load samples");
    } finally {
      setBusy(false);
    }
  }, [onIngested]);

  const onPickFile = useCallback(
    async (f: File | null) => {
      if (!f) return;
      setError(null);
      setStatus(null);
      setBusy(true);
      try {
        const label = source.trim() || f.name.replace(/\.[^.]+$/, "") || "file";
        const payload = await ingestFile(f, label);
        const n =
          typeof payload === "object" &&
          payload !== null &&
          "ingested_chunks" in payload
            ? String((payload as { ingested_chunks: number }).ingested_chunks)
            : "?";
        const msg = `Success: Ingested ${n} chunks from "${f.name}"`;
        setStatus(msg);
        onIngested?.(msg);
        refreshCount();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Ingest failed");
      } finally {
        setBusy(false);
      }
    },
    [source, onIngested],
  );

  return (
    <section className="rounded-xl border border-stone-200 bg-white shadow-sm dark:border-stone-700 dark:bg-stone-900">
      {/* Section header */}
      <div className="border-b border-stone-100 px-6 py-4 dark:border-stone-800">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-teal-700 text-[11px] font-bold text-white">
            1
          </span>
          <h2 className="text-base font-semibold tracking-tight text-stone-900 dark:text-stone-100">
            Ingest
          </h2>
          <div className="ml-auto flex items-center gap-2">
            {chunkCount !== null && (
              <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-medium text-stone-500 dark:bg-stone-800 dark:text-stone-400">
                {chunkCount} chunks indexed
              </span>
            )}
            <button
              type="button"
              onClick={() => {
                if (!confirm("Clear the entire vector index? This cannot be undone.")) return;
                setBusy(true);
                setStatus(null);
                setError(null);
                resetIndex()
                  .then(() => { setStatus("Success: Index cleared."); refreshCount(); })
                  .catch((e: unknown) => setError(e instanceof Error ? e.message : "Reset failed"))
                  .finally(() => setBusy(false));
              }}
              disabled={busy}
              className="rounded-md border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-600 transition hover:bg-red-100 disabled:opacity-50 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-400"
            >
              Clear index
            </button>
          </div>
        </div>
      </div>

      <div className="p-6">
        {/* Quick load banner — reads from data/ folder via GET /samples */}
        <div className="mb-4 flex items-center justify-between rounded-lg border border-teal-100 bg-teal-50/60 px-4 py-2.5 dark:border-teal-900/40 dark:bg-teal-900/20">
          <p className="text-xs text-teal-800 dark:text-teal-300">
            New here? Load the built-in sample judgments from{" "}
            <code className="font-mono">data/</code> to try search instantly.
          </p>
          <button
            type="button"
            onClick={() => void loadSamples()}
            disabled={busy}
            className="ml-3 shrink-0 rounded-md bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "Loading…" : "Load sample cases"}
          </button>
        </div>

        {/* Mode tabs */}
        <div className="mb-4 flex rounded-lg border border-stone-200 p-1 dark:border-stone-700">
          {(["text", "file"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`flex-1 rounded-md py-1.5 text-xs font-medium transition ${
                mode === m
                  ? "bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900"
                  : "text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200"
              }`}
            >
              {m === "text" ? "Paste text" : "Upload .txt / .pdf"}
            </button>
          ))}
        </div>

        {/* Source label */}
        <label className="block text-xs font-medium uppercase tracking-wide text-stone-500 dark:text-stone-400">
          Case / source label
          <input
            type="text"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            className="mt-1 w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm font-normal normal-case tracking-normal text-stone-900 outline-none ring-teal-600/30 focus:ring-2 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100"
            placeholder="e.g. smith_v_jones_2023"
          />
        </label>

        {/* Paste mode */}
        {mode === "text" && (
          <>
            <label className="mt-4 block text-xs font-medium uppercase tracking-wide text-stone-500 dark:text-stone-400">
              Case text
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={7}
                className="mt-1 w-full resize-y rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 font-mono text-sm font-normal normal-case tracking-normal text-stone-900 outline-none ring-teal-600/30 focus:ring-2 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100"
                placeholder="Paste judgment or case summary text…"
              />
            </label>
            <div className="mt-3">
              <button
                type="button"
                onClick={() => void runIngest()}
                disabled={busy || !text.trim()}
                className="rounded-lg bg-teal-700 px-5 py-2 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? "Ingesting…" : "Ingest text"}
              </button>
            </div>
          </>
        )}

        {/* File upload mode */}
        {mode === "file" && (
          <div className="mt-4">
            <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-stone-200 bg-stone-50 py-10 text-center transition hover:border-teal-400 hover:bg-teal-50/40 dark:border-stone-700 dark:bg-stone-950 dark:hover:border-teal-600">
              <input
                type="file"
                accept=".txt,.text,.pdf,text/plain,application/pdf"
                className="sr-only"
                disabled={busy}
                onChange={(e) => void onPickFile(e.target.files?.[0] ?? null)}
              />
              <svg
                className="h-7 w-7 text-stone-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5"
                />
              </svg>
              <span className="text-sm text-stone-600 dark:text-stone-400">
                {busy ? "Uploading…" : "Click to select a .txt or .pdf file"}
              </span>
            </label>
          </div>
        )}

        {/* Status / error */}
        {status ? (
          <p className="mt-3 text-sm font-medium text-teal-800 dark:text-teal-300">
            {status}
          </p>
        ) : null}
        {error ? (
          <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>
        ) : null}
      </div>
    </section>
  );
}
