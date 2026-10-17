"use client";

import { useState } from "react";
import type { Step, TraceAnswer } from "@/lib/api";

const TOOL_NAMES: Record<string, string> = {
  get_shortage: "Read the shortage notice",
  find_site_exposure: "Find products made at the same plant",
  find_ingredient_exposure: "Find products with the same ingredient",
  find_substitutes: "Find candidate alternatives",
  rank_source_concentration: "Rank plants by dependence",
  exposure_clusters: "Group connected plants",
  recall_memory: "Recall your past decisions",
};

function showParams(params: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(params).map(([k, v]) => [k, Array.isArray(v) && v.length > 5 ? `[${v.length} values]` : v]),
  );
}

function StepRow({ step }: { step: Step }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="border-t border-line py-4 motion-safe:animate-[chip_400ms_ease-out]">
      <div className="flex items-baseline gap-3">
        <span className="font-mono text-[13px] text-clay-deep">{String(step.n).padStart(2, "0")}</span>
        <div className="min-w-0 flex-1">
          <p className="font-medium leading-snug">{TOOL_NAMES[step.tool] ?? step.tool}</p>
          <p className="mt-0.5 font-mono text-[13px] text-ink-3">
            {step.tool} · {step.rows} {step.rows === 1 ? "row" : "rows"} · {step.ms} ms
          </p>
          <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="link mt-1 inline-block py-1.5 text-[14px] text-ink-2">
            {open ? "Hide query" : "Show query"}
          </button>
          {open &&
            step.queries.map((q, i) => (
              <div key={i} className="mt-3 overflow-x-auto rounded-[6px] bg-canvas p-3">
                <p className="label">Graph {q.graph}</p>
                <pre className="mt-2 whitespace-pre-wrap break-words font-mono text-[12px] leading-relaxed text-ink">{q.cypher.trim()}</pre>
                <pre className="mt-2 whitespace-pre-wrap break-words font-mono text-[12px] text-ink-3">
                  {JSON.stringify(showParams(q.params))}
                </pre>
              </div>
            ))}
        </div>
      </div>
    </li>
  );
}

export function Reasoning({ steps, answer, running, stale }: { steps: Step[]; answer: TraceAnswer | null; running: boolean; stale?: boolean }) {
  const summary = answer?.answer.summary as string | undefined;
  const model = answer?.model.replace(/^openai\//, "");
  return (
    <aside id="how" className="scroll-mt-24 rounded-[20px] bg-panel p-6 md:p-8 lg:sticky lg:top-6">
      <h2 className="font-display text-[28px] leading-tight">How Fontrel got here</h2>
      <p className="mt-2 text-[15px] text-ink-2">Every answer comes from these graph queries. Open any one to see the Cypher.</p>
      <ol className="mt-6">
        {steps.map((s) => (
          <StepRow key={s.n} step={s} />
        ))}
        {running && <li className="border-t border-line py-4 text-ink-3 motion-safe:animate-pulse">Running the next query</li>}
      </ol>

      <div className="mt-4 border-t border-line pt-6">
        <p className="label">Agent summary</p>
        {!answer ? (
          <p className="mt-3 text-ink-3">{running ? "Written once the graph steps finish." : "No summary for this run. Run a fresh trace to try again."}</p>
        ) : answer.degraded ? (
          <p className="mt-3 text-ink-2">No written summary this time. The lists come straight from the graph.</p>
        ) : (
          <>
            <p className="mt-3 font-display text-[21px] leading-snug">{summary}</p>
            <p className="mt-3 text-[14px] text-ink-3">Written by the AI model from the query results above. Check any claim against the lists before you act on it.</p>
          </>
        )}
        {answer && stale && (
          <p className="mt-3 text-[14px] text-ink-2">This summary was written before your latest decision. Run a fresh trace to include it.</p>
        )}
        {answer && (
          <p className="mt-4 font-mono text-[13px] text-ink-3">
            {answer.degraded ? "Graph only" : `Model ${model}`} · {answer.elapsed_s.toFixed(2)} s
          </p>
        )}
      </div>
    </aside>
  );
}
