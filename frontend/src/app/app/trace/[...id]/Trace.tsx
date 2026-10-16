"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { formatDate, getJSON, postDecision, streamTrace, type MemoryRow, type Recall, type Shortage, type Step, type TraceAnswer } from "@/lib/api";
import { ExposedList, SubstituteList } from "./Lists";
import { Banner } from "./Banner";
import { MemoryList } from "./Memory";
import { PathChips } from "./PathChips";
import { Reasoning } from "./Reasoning";
import { SmallGraph } from "./SmallGraph";

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
  const [recall, setRecall] = useState<{ key: string; value: Recall } | null>(null);
  const live = recall?.key === headerKey ? recall.value : null;

  const loadRecall = useCallback(
    (signal?: AbortSignal) =>
      getJSON<Recall>(`/api/recall?tenant=${encodeURIComponent(h)}&shortage_id=${encodeURIComponent(shortageId)}`, signal).then(
        (value) => setRecall({ key: headerKey, value }),
      ),
    [h, shortageId, headerKey],
  );

  useEffect(() => {
    const ctl = new AbortController();
    loadRecall(ctl.signal).catch(() => {});
    return () => ctl.abort();
  }, [loadRecall]);

  // decisions the server confirmed in this visit, kept even if the history refresh after them fails
  const [saved, setSaved] = useState<{ key: string; rows: Record<string, MemoryRow> }>({ key: "", rows: {} });
  const [historyFailed, setHistoryFailed] = useState<string | null>(null);
  const [decidedInRun, setDecidedInRun] = useState<string | null>(null);

  const decisions = useMemo(() => {
    const m = new Map((live?.rows ?? []).filter((r) => r.episode === live?.episode).map((r) => [r.substitute_ndc, r] as [string, MemoryRow]));
    if (saved.key === headerKey) for (const [ndc, r] of Object.entries(saved.rows)) if (!m.has(ndc) || (m.get(ndc)!.at ?? "") < (r.at ?? "")) m.set(ndc, r);
    return m;
  }, [live, saved, headerKey]);

  async function decide(ndc: string, action: "approved" | "rejected", reason: string, by: string) {
    // a failure here means the decision was not saved, and the form says so
    const res = await postDecision({ tenant: h, shortage_id: shortageId, substitute_ndc: ndc, action, reason, by });
    const row = { episode: res.episode, decision: res.decision, action, substitute_ndc: ndc, reason, by, at: res.at } as MemoryRow;
    setSaved((p) => ({ key: headerKey, rows: { ...(p.key === headerKey ? p.rows : {}), [ndc]: row } }));
    setDecidedInRun(runKey);
    // the decision is saved; a failed history refresh is reported separately and can be retried
    try {
      await loadRecall();
      setHistoryFailed(null);
    } catch {
      setHistoryFailed(headerKey);
    }
  }
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
    let ended = false;
    streamTrace(
      { tenant: h, shortage_id: shortageId, fresh: run.fresh },
      (e) => {
        if (e.kind === "step") setSteps((p) => ({ key: runKey, list: [...(p.key === runKey ? p.list : []), e.data] }));
        else if (e.kind === "answer") {
          ended = true;
          setAnswer({ key: runKey, value: e.data });
        } else {
          ended = true;
          const busy = (e.data as { error: string; message?: string }).message;
          setFailure({ key: runKey, message: busy ?? "The trace stopped before it finished. Run it again." });
        }
      },
      ctl.signal,
    )
      .then(() => {
        // the connection closed without a final answer or error, so leave the running state with a retry
        if (!ended) setFailure({ key: runKey, message: "The trace ended before it finished. The results so far are shown below. Run it again." });
      })
      .catch((e) => {
        if (e.name !== "AbortError") setFailure({ key: runKey, message: "Fontrel cannot reach its graph database right now. Run it again." });
      });
    return () => ctl.abort();
  }, [head.kind, h, shortageId, run, runKey]);

  const back = (
    <Link href={`/app?h=${h}`} className="link inline-block py-1.5 text-[15px] text-ink-2">
      Back to shortages
    </Link>
  );

  if (head.kind === "missing" || head.kind === "error") {
    return (
      <section className="wrap py-[clamp(48px,7vw,96px)]">
        {back}
        <div className="mt-8 rounded-[20px] bg-panel p-8 text-ink-2">
          {head.kind === "missing"
            ? "This shortage is not on this hospital's formulary, or it is no longer current. Pick another one from the shortage list."
            : "Fontrel cannot reach its graph database right now. Reload the page in a moment."}
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
            className="self-start rounded-full border-[1.5px] border-clay px-6 py-3 font-medium text-clay-deep hover:bg-clay-tint disabled:cursor-not-allowed disabled:opacity-50 lg:self-auto"
          >
            {running ? "Tracing" : "Run a fresh trace"}
          </button>
        </div>
      )}

      <PathChips steps={stepList} running={running} />

      <p className="sr-only" role="status" aria-live="polite">
        {running ? `Tracing, ${stepList.length} graph steps so far` : done ? "Trace finished" : failed ? failed : ""}
      </p>

      {stepList.length > 0 && (
        <nav aria-label="On this page" className="mt-6 flex flex-wrap gap-2 text-[15px]">
          {[
            { id: "exposed", label: "Exposed", n: new Set(stepList.find((x) => x.tool === "find_site_exposure")?.data.map((r) => r.product_ndc)).size },
            { id: "candidates", label: "Candidates", n: stepList.find((x) => x.tool === "find_substitutes")?.rows },
            { id: "memory", label: "Past decisions", n: (live?.rows ?? stepList.find((x) => x.tool === "recall_memory")?.data ?? []).length },
            { id: "how", label: "How Fontrel got here" },
          ].map((j) => (
            <a key={j.id} href={`#${j.id}`} onClick={(e) => { e.preventDefault(); document.getElementById(j.id)?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }); }}
              className="rounded-full border-[1.5px] border-line px-4 py-2 hover:border-clay">
              {j.label}
              {typeof j.n === "number" && <span className="ml-1.5 font-mono text-[13px] text-ink-3">{j.n}</span>}
            </a>
          ))}
        </nav>
      )}

      {historyFailed === headerKey && (
        <div role="status" className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[20px] bg-panel p-6 text-ink-2">
          Your decision is saved, but the decision history did not refresh.
          <button className="link py-1.5 text-ink" onClick={() => loadRecall().then(() => setHistoryFailed(null), () => setHistoryFailed(headerKey))}>
            Refresh history
          </button>
        </div>
      )}

      {failed && (
        <div className="mt-6 rounded-[20px] bg-panel p-6 text-ink-2">
          {failed}{" "}
          <button className="link text-ink" onClick={() => setRun((r) => ({ n: r.n + 1, fresh: false }))}>
            Run again
          </button>
        </div>
      )}
      {done && <Banner answer={done} onFresh={() => setRun((r) => ({ n: r.n + 1, fresh: true }))} />}

      {(stepList.length > 0 || running) && (
        <div className="mt-12 grid items-start gap-12 lg:grid-cols-[3fr_2fr]">
          <div className="flex min-w-0 flex-col gap-14">
            <ExposedList steps={stepList} running={running} shortageLabeler={head.kind === "ready" ? head.s.labeler : undefined} />
            <SubstituteList steps={stepList} running={running} decisions={decisions} onDecide={decide} />
            <MemoryList steps={stepList} running={running} live={live?.rows ?? null} />
          </div>
          <Reasoning steps={stepList} answer={done} running={running} stale={decidedInRun === runKey} />
        </div>
      )}
      {head.kind === "ready" && (
        <SmallGraph
          tenant={h}
          shortageId={shortageId}
          totals={{
            exposed: new Set(stepList.find((x) => x.tool === "find_site_exposure")?.data.map((r) => r.product_ndc)).size || undefined,
            subs: stepList.find((x) => x.tool === "find_substitutes")?.rows,
          }}
        />
      )}
    </section>
  );
}
