"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getJSON, traceHref } from "@/lib/api";
import { ShelvesBand } from "./ShelvesBand";

type Anchor = { shortage_id: string; product_ndc: string; shortage: string; company: string; cross_company_exposed: number };
type GNode = { id: string; label: string; kind: string; labeler?: string; role?: string; status?: string; in_shortage?: boolean };
type GEdge = { source: string; target: string; type: string; setid?: string };
type Case = { anchor: Anchor; nodes: GNode[]; edges: GEdge[] };

const TENANT = "mercy";

function title(s: string) {
  return s.replace(/\w\S*/g, (w) => {
    const letters = w.replace(/[^A-Za-z]/g, "");
    return letters.length <= 3 && letters === letters.toUpperCase() ? w : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
  });
}

function company(s = "") {
  return s.split(/ dba /i)[0];
}

function labelUrl(setid?: string) {
  return setid ? `https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=${setid}` : null;
}

function useCase() {
  const [state, setState] = useState<{ data?: Case; failed?: boolean } | null>(null);
  useEffect(() => {
    const ctl = new AbortController();
    getJSON<Anchor>(`/api/anchor?tenant=${TENANT}`, ctl.signal)
      .then((anchor) =>
        getJSON<{ nodes: GNode[]; edges: GEdge[] }>(
          `/api/graph/subgraph?tenant=${TENANT}&shortage_id=${encodeURIComponent(anchor.shortage_id)}`,
          ctl.signal,
        ).then((g) => setState({ data: { anchor, ...g } })),
      )
      .catch((e) => {
        if (e.name !== "AbortError") setState({ failed: true });
      });
    return () => ctl.abort();
  }, []);
  return state;
}

function derive(c: Case) {
  const product = c.nodes.find((n) => n.role === "short");
  const site = c.nodes.find((n) => n.kind === "site");
  const exposed = c.nodes.filter((n) => n.role === "exposed");
  const others = exposed.filter((n) => n.labeler !== product?.labeler);
  const seen = new Set<string>();
  const hidden = others.filter((n) => !n.in_shortage && !seen.has(n.labeler ?? "") && seen.add(n.labeler ?? ""));
  const subs = c.nodes.filter((n) => n.role === "substitute");
  const setid = (id: string) => c.edges.find((e) => e.source === id && e.type === "MADE_AT")?.setid;
  const pool = others.length ? others : exposed;
  const distinct = [...new Map(pool.map((n) => [`${n.label.toLowerCase()}|${n.labeler}`, n])).values()];
  return { product, site, exposed: distinct, hidden: hidden.slice(0, 2), subs, setid };
}

function Chip({ label, title: t, sub, tone = "ink" }: { label: string; title: string; sub?: string; tone?: "ink" | "exposed" }) {
  return (
    <div className={`rounded-[12px] border-[1.5px] p-3.5 ${tone === "exposed" ? "border-exposed bg-exposed-tint" : "border-ink/70 bg-canvas"}`}>
      <p className={`label ${tone === "exposed" ? "!text-exposed" : ""}`}>{label}</p>
      <p className="mt-1 text-[15px] font-medium leading-snug">{t}</p>
      {sub && <p className="mt-0.5 font-mono text-[12px] text-ink-3">{sub}</p>}
    </div>
  );
}

const STATUS = {
  independent: { text: "Independent plant", dot: "bg-clear", color: "text-clear" },
  unknown: { text: "No site on file", dot: "bg-unknown", color: "text-ink-3" },
  shares_site: { text: "Shares the plant", dot: "bg-exposed", color: "text-exposed" },
} as const;

export function LiveCase() {
  const state = useCase();
  const d = state?.data ? derive(state.data) : null;
  const ready = Boolean(d?.product && d?.site);

  const steps = [
    {
      n: "01",
      title: "Trace the plant",
      text: "Every FDA label lists where the drug is made. Fontrel follows the shortage to that plant.",
      fragment: ready && (
        <div className="flex flex-col gap-2">
          <Chip label="Shortage" title={state!.data!.anchor.shortage} sub="FDA notice" />
          <Chip label="Product" title={`${title(d!.product!.label)}, ${company(d!.product!.labeler)}`} sub={`NDC ${d!.product!.id}`} />
          <Chip label="Plant" title={title(d!.site!.label)} sub={d!.site!.id.replace("site:", "DUNS ")} />
        </div>
      ),
    },
    {
      n: "02",
      title: "Find what else is exposed",
      text: "Other drugs made at the same plant are at risk, even with no shortage notice yet.",
      fragment: ready && (
        <ul>
          {d!.exposed.slice(0, 3).map((n) => (
            <li key={n.id} className="border-t border-line py-2.5 first:border-t-0 first:pt-0">
              <p className="text-[15px] font-medium leading-snug">{title(n.label)}</p>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[13px] text-ink-2">
                {company(n.labeler)}
                <span className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.08em] text-exposed">
                  <span className="h-1.5 w-1.5 rounded-full bg-exposed" aria-hidden="true" />
                  Exposed
                </span>
              </p>
            </li>
          ))}
        </ul>
      ),
    },
    {
      n: "03",
      title: "Choose a safe substitute",
      text: "Equivalents made at a different plant come first. Your team's past decisions are remembered.",
      fragment: ready && (
        <ul>
          {d!.subs.slice(0, 3).map((n) => {
            const s = STATUS[(n.status as keyof typeof STATUS) ?? "unknown"] ?? STATUS.unknown;
            return (
              <li key={n.id} className="border-t border-line py-2.5 first:border-t-0 first:pt-0">
                <p className="text-[15px] font-medium leading-snug">{company(n.labeler)}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[13px] text-ink-2">
                  <span className="font-mono text-[12px] text-ink-3">NDC {n.id}</span>
                  <span className={`inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.08em] ${s.color}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} aria-hidden="true" />
                    {s.text}
                  </span>
                </p>
              </li>
            );
          })}
        </ul>
      ),
    },
  ];

  return (
    <>
      <section id="how" className="scroll-mt-28 md:scroll-mt-20 py-[clamp(48px,7vw,96px)]">
        <div className="wrap">
          <h2 className="h2 text-center">
            How it <span className="em">works</span>
          </h2>
          <ol className="mt-12 grid gap-4 lg:grid-cols-3">
            {steps.map((s) => (
              <li key={s.n} className="flex flex-col rounded-[20px] bg-panel p-8">
                <p className="font-mono text-[13px] text-clay">{s.n}</p>
                <h3 className="mt-3 font-display text-[28px] leading-[1.15]">{s.title}</h3>
                <p className="mt-3 text-ink-2">{s.text}</p>
                {!state ? (
                  <div className="mt-6 h-40 animate-pulse rounded-[12px] bg-canvas/60" aria-hidden="true" />
                ) : (
                  s.fragment && <div className="mt-6 rounded-[12px] bg-canvas p-4 motion-safe:animate-[chip_400ms_ease-out]">{s.fragment}</div>
                )}
              </li>
            ))}
          </ol>
          {ready && (
            <p className="label mt-6 text-center">Live from today&rsquo;s FDA shortage list and a synthetic hospital formulary</p>
          )}
        </div>
      </section>

      <ShelvesBand />

      {ready && d!.hidden.length > 0 && (
        <section id="case" className="scroll-mt-28 md:scroll-mt-20 bg-panel py-[clamp(48px,7vw,96px)]">
          <div className="wrap">
            <h2 className="h2 max-w-[22ch]">
              A real case from <span className="em">today&rsquo;s</span> shortage list.
            </h2>
            <div className="mt-12 grid items-center gap-3 lg:grid-cols-[1fr_auto_1fr_auto_1.1fr]">
              <Chip label="Shortage" title={`${title(d!.product!.label)}, ${company(d!.product!.labeler)}`} sub="FDA shortage notice" />
              <span aria-hidden="true" className="hidden text-ink-3 lg:block">
                <svg width="16" height="16" viewBox="0 0 16 16"><path d="M5 3 L10 8 L5 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
              </span>
              <Chip label="Plant" title={title(d!.site!.label)} sub={d!.site!.id.replace("site:", "DUNS ")} />
              <span aria-hidden="true" className="hidden text-ink-3 lg:block">
                <svg width="16" height="16" viewBox="0 0 16 16"><path d="M5 3 L10 8 L5 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
              </span>
              <div className="flex flex-col gap-3">
                {d!.hidden.map((n) => (
                  <Chip key={n.id} tone="exposed" label="Exposed" title={`${title(n.label)}, ${company(n.labeler)}`} sub={`NDC ${n.id}`} />
                ))}
              </div>
            </div>
            <p className="mt-10 max-w-[60ch] text-[19px] text-ink-2">
              {d!.hidden.length === 1 ? "This product has" : "Neither of these has"} a shortage notice. {d!.hidden.length === 1 ? "It is" : "They are"} made at the same plant, under{" "}
              {d!.hidden.length === 1 ? "another company's name" : "other companies' names"}.
            </p>
            <p className="mt-3 text-[15px] text-ink-3">
              Source:{" "}
              {d!.hidden.map((n, i) => (
                <span key={n.id}>
                  {i > 0 && " · "}
                  {labelUrl(d!.setid(n.id)) ? (
                    <a className="link" href={labelUrl(d!.setid(n.id))!} target="_blank" rel="noreferrer">
                      DailyMed label, {title(n.label)}
                    </a>
                  ) : (
                    `DailyMed, ${title(n.label)}`
                  )}
                </span>
              ))}
            </p>
            <Link
              href={traceHref(state!.data!.anchor.shortage_id, TENANT)}
              className="mt-8 inline-block rounded-full bg-clay px-6 py-3.5 font-medium text-canvas hover:bg-ink"
            >
              Trace it yourself
            </Link>
          </div>
        </section>
      )}
    </>
  );
}
