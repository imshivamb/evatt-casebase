"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { streamSummary } from "@/lib/api";

type Props = {
  query: string | null;
  topK: number;
  trigger: number; // increment to re-run after a search
};

type Phase = "idle" | "streaming" | "done" | "error";

/**
 * Keeps latest query/topK in a ref so the effect can depend only on `trigger`
 * (avoids stale closures and accidental re-streams when editing Top K).
 */
export function StreamingSummary({ query, topK, trigger }: Props) {
  const [text, setText] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const abortRef = useRef(false);
  const streamArgsRef = useRef({ query: "", topK: 5 });
  streamArgsRef.current = {
    query: (query ?? "").trim(),
    topK,
  };

  useEffect(() => {
    if (trigger <= 0) return;
    const { query: q, topK: k } = streamArgsRef.current;
    if (!q) return;

    abortRef.current = false;
    setText("");
    setPhase("streaming");

    void (async () => {
      try {
        for await (const event of streamSummary(q, k)) {
          if (abortRef.current) break;
          if (event.type === "chunk") {
            setText((prev) => prev + event.text);
          } else if (event.type === "error") {
            setText(event.text);
            setPhase("error");
            return;
          } else if (event.type === "done") {
            break;
          }
        }
        if (!abortRef.current) {
          setPhase("done");
        }
      } catch (e) {
        if (!abortRef.current) {
          setText(e instanceof Error ? e.message : "Stream failed");
          setPhase("error");
        }
      }
    })();

    return () => {
      abortRef.current = true;
    };
  }, [trigger]);

  if (!query || (phase === "idle" && trigger === 0)) return null;

  return (
    <section className="rounded-xl border border-stone-200 bg-white shadow-sm dark:border-stone-700 dark:bg-stone-900">
      {/* Header */}
      <div className="border-b border-stone-100 px-6 py-4 dark:border-stone-800">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-violet-700 text-white">
            <svg
              className="h-3.5 w-3.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2.5}
                d="M13 10V3L4 14h7v7l9-11h-7z"
              />
            </svg>
          </span>
          <h2 className="text-base font-semibold tracking-tight text-stone-900 dark:text-stone-100">
            AI Summary
          </h2>
          <span className="ml-auto flex items-center gap-1.5">
            {phase === "streaming" && (
              <span className="flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-700 dark:bg-violet-900/30 dark:text-violet-300">
                <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-violet-500" />
                Generating…
              </span>
            )}
            {phase === "done" && (
              <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-medium text-stone-500 dark:bg-stone-800 dark:text-stone-400">
                gpt-5.4-mini · grounded
              </span>
            )}
            {phase === "error" && text !== "OPENAI_API_KEY_MISSING" && (
              <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-600 dark:bg-red-900/30 dark:text-red-400">
                error
              </span>
            )}
            {text === "OPENAI_API_KEY_MISSING" && (
              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-600 dark:bg-amber-900/30 dark:text-amber-400">
                key required
              </span>
            )}
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="px-6 py-5">
        {text === "OPENAI_API_KEY_MISSING" ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
            <p className="font-medium">AI Summary is currently disabled.</p>
            <p className="mt-1 text-amber-700 dark:text-amber-400">
              To enable streaming AI summaries, add your OpenAI API key to{" "}
              <code className="rounded bg-amber-100 px-1 py-0.5 font-mono text-xs dark:bg-amber-900/50">
                backend/.env
              </code>{" "}
              and restart the backend. The core retrieval features below still work without it!
            </p>
          </div>
        ) : text ? (
          <div className="text-sm leading-relaxed text-stone-700 dark:text-stone-300 [&_a]:font-medium [&_a]:text-violet-600 hover:[&_a]:underline [&_li]:mt-1 [&_ol]:mb-4 [&_ol]:list-decimal [&_ol]:pl-5 last:[&_ol]:mb-0 [&_p]:mb-4 last:[&_p]:mb-0 [&_strong]:font-semibold [&_ul]:mb-4 [&_ul]:list-disc [&_ul]:pl-5 last:[&_ul]:mb-0 dark:[&_a]:text-violet-400">
            <ReactMarkdown>
              {text + (phase === "streaming" ? " |" : "")}
            </ReactMarkdown>
          </div>
        ) : (
          <div className="flex gap-1.5">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="h-2 w-2 animate-bounce rounded-full bg-stone-300 dark:bg-stone-600"
                style={{ animationDelay: `${i * 120}ms` }}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
