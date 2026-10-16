"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { formatDate, getJSON, streamTrace, type Shortage, type Step, type TraceAnswer } from "@/lib/api";
import { ExposedList, SubstituteList } from "./Lists";
import { PathChips } from "./PathChips";

type Header = { kind: "loading" } | { kind: "missing" } | { kind: "error" } | { kind: "ready"; s: Shortage };

export function Trace() {
  const params = useParams<{ id: string[] }>();
  const shortageId = params.id.map(decodeURIComponent).join("/");
  const h = useSearchParams().get("h") ?? "mercy";

  const [header, setHeader] = useState<{ key: string; value: Header } | null>(null);
  const [run, setRun] = useState({ n: 0, fresh: false });
  const runKey = `${h}|${shortageId}|${run.n}`;
  const [steps, setSteps] = useState<{ key: string; list: Step[] }>({ key: "", list: [] });
  const [answer, setAnswer] = useState<{ key: string; value: TraceAnswer } | null>(null);
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null);

  const headerKey = `${h}|${shortageId}`;
  const head: Header = header?.key === headerKey ? header.value : { kind: "loading" };
  const stepList = steps.key === runKey ? steps.list : [];
  const done = answer?.key === runKey ? answer.value : null;
  const failed = failure?.key === runKey ? failure.message : null;

  useEffect(() => {
    const ctl = new AbortController();
    getJSON<Shortage[]>(`/api/shortages?tenant=${encodeURIComponent(h)}`, ctl.signal)
      .then((rows) => {
        const s = rows.find((r) => r.shortage_id === shortageId);
        setHeader({ key: headerKey, value: s ? { kind: "ready", s } : { kind: "missing" } });
      })
      .catch((e) => {
        if (e.name !== "AbortError") setHeader({ key: headerKey, value: { kind: "error" } });
      });
    return () => ctl.abort();
  }, [h, shortageId, headerKey]);

  useEffect(() => {
    if (head.kind !== "ready") return;
    const ctl = new AbortController();
    streamTrace(
      { tenant: h, shortage_id: shortageId, fresh: run.fresh },
      (e) => {
        if (e.kind === "step") setSteps((p) => ({ key: runKey, list: [...(p.key === runKey ? p.list : []), e.data] }));
        else if (e.kind === "answer") setAnswer({ key: runKey, value: e.data });
        else setFailure({ key: runKey, message: "The trace stopped before it finished. Run it again." });
      },
      ctl.signal,
    ).catch((e) => {
      if (e.name !== "AbortError") setFailure({ key: runKey, message: "Fontrel cannot reach its graph database right now. Run it again." });
    });
    return () => ctl.abort();
  }, [head.kind, h, shortageId, run, runKey]);

  const back = (
    <Link href={`/app?h=${h}`} className="link text-[15px] text-ink-2">
      Back to shortages
    </Link>
  );

  if (head.kind === "missing" || head.kind === "error") {
    return (
      <section className="wrap py-[clamp(48px,7vw,96px)]">
        {back}
        <div className="mt-8 rounded-[20px] bg-panel p-8 text-ink-2">
          {head.kind === "missing"
            ? "This shortage is not on this hospital's formulary, or it is no longer current."
            : "Fontrel cannot reach its graph database right now."}
        </div>
      </section>
    );
  }

  const running = !done && !failed;

  return (
    <section className="wrap py-[clamp(32px,5vw,64px)]">
      {back}
      {head.kind === "loading" ? (
        <div className="mt-8 h-24 w-2/3 animate-pulse rounded-[12px] bg-panel" />
      ) : (
        <div className="mt-8 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="label">
              {head.s.availability} · Updated {formatDate(head.s.updated)} · Synthetic hospital
            </p>
            <h1 className="h2 mt-3">{head.s.shortage}</h1>
            <p className="mt-3 text-ink-2">
              {head.s.company} <span className="ml-2 font-mono text-[13px] text-ink-3">Package NDC {shortageId.split("|")[0]}</span>
            </p>
          </div>
          <button
            onClick={() => setRun((r) => ({ n: r.n + 1, fresh: true }))}
            disabled={running}
            className="self-start rounded-full border-[1.5px] border-clay px-6 py-3 font-medium text-clay hover:bg-clay-tint disabled:cursor-not-allowed disabled:opacity-50 lg:self-auto"
          >
            {running ? "Tracing" : "Run fresh"}
          </button>
        </div>
      )}

      <PathChips steps={stepList} running={running} />

      {failed && (
        <div className="mt-6 rounded-[20px] bg-panel p-6 text-ink-2">
          {failed}{" "}
          <button className="link text-ink" onClick={() => setRun((r) => ({ n: r.n + 1, fresh: false }))}>
            Run again
          </button>
        </div>
      )}
      {done && (
        <p className="label mt-4">
          {done.replayed ? `Saved trace, first run took ${done.elapsed_s.toFixed(2)} s` : `Traced in ${done.elapsed_s.toFixed(2)} s`} · {stepList.length} graph steps
        </p>
      )}
      {(stepList.length > 0 || running) && (
        <div className="mt-12 grid gap-12 lg:grid-cols-2">
          <ExposedList steps={stepList} running={running} shortageLabeler={head.kind === "ready" ? head.s.labeler : undefined} />
          <SubstituteList steps={stepList} running={running} />
        </div>
      )}
    </section>
  );
}
