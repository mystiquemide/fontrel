"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { getJSON, MONTHS, traceHref, type Shortage, type Tenant } from "@/lib/api";

type Decision = {
  decision: string;
  action: "approved" | "rejected";
  substitute_ndc: string;
  substitute: string | null;
  labeler: string | null;
  reason: string;
  by: string | null;
  at: string | null;
  outcome: string | null;
  outcome_days: number | null;
};
type Episode = {
  episode: string;
  label: string;
  opened: string;
  closed: string | null;
  status: string;
  synthetic: boolean;
  product_ndc: string | null;
  shortage_id: string | null;
  decisions: Decision[];
};
type Data = { tenant: Tenant; episodes: Episode[]; shortages: Shortage[] };

function day(iso: string | null) {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return y && m && d ? `${MONTHS[m - 1]} ${d}, ${y}` : iso;
}

function title(s: string) {
  return s.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

function shortName(name: string) {
  return name.replace(/ (General|Community) Hospital$/, "");
}

export function MemoryPage() {
  const h = useSearchParams().get("h") ?? "mercy";
  const [attempt, setAttempt] = useState(0);
  const key = `${h}:${attempt}`;
  const [result, setResult] = useState<{ key: string; data?: Data; error?: string } | null>(null);
  const state = result?.key === key ? result : null;

  useEffect(() => {
    const ctl = new AbortController();
    const q = encodeURIComponent(h);
    Promise.all([
      getJSON<Tenant[]>("/api/tenants", ctl.signal),
      getJSON<Episode[]>(`/api/memory?tenant=${q}`, ctl.signal),
      getJSON<Shortage[]>(`/api/shortages?tenant=${q}`, ctl.signal),
    ])
      .then(([tenants, episodes, shortages]) => {
        const tenant = tenants.find((t) => t.id === h);
        setResult(tenant ? { key, data: { tenant, episodes, shortages } } : { key, error: "This hospital is not on file. Pick one from the menu above." });
      })
      .catch((e) => {
        if (e.name !== "AbortError") setResult({ key, error: "Fontrel cannot reach its graph database right now. Try again." });
      });
    return () => ctl.abort();
  }, [h, key]);

  if (state?.error) {
    return (
      <section className="wrap py-[clamp(48px,7vw,96px)]">
        <div className="rounded-[20px] bg-panel p-8">
          <p className="text-ink-2">{state.error}</p>
          <button onClick={() => setAttempt((a) => a + 1)} className="mt-4 rounded-full bg-clay px-6 py-3.5 font-medium text-canvas hover:bg-ink">
            Try again
          </button>
        </div>
      </section>
    );
  }

  const data = state?.data;
  const decisions = data?.episodes.reduce((n, e) => n + e.decisions.length, 0) ?? 0;

  function currentTrace(e: Episode) {
    if (!data) return null;
    const live = e.shortage_id ? data.shortages.find((s) => s.shortage_id === e.shortage_id) : undefined;
    if (live) return { href: traceHref(live.shortage_id, h), text: "Open trace" };
    const again = e.product_ndc ? data.shortages.find((s) => s.product_ndc === e.product_ndc) : undefined;
    return again ? { href: traceHref(again.shortage_id, h), text: "This drug is in shortage again. Trace it" } : null;
  }

  return (
    <section className="wrap py-[clamp(48px,7vw,96px)]">
      {!data ? (
        <>
          <p className="label">Loading memory</p>
          <div className="mt-4 h-[clamp(48px,5vw,80px)] w-2/3 animate-pulse rounded-[12px] bg-panel" />
        </>
      ) : (
        <>
          <p className="label">Synthetic hospital · {data.tenant.name}</p>
          <h1 className="h1 mt-4">
            {shortName(data.tenant.name)}&rsquo;s shortage <span className="em">memory.</span>
          </h1>
          <p className="mt-4 text-[19px] text-ink-2">
            {decisions} {decisions === 1 ? "decision" : "decisions"} across {data.episodes.length}{" "}
            {data.episodes.length === 1 ? "shortage" : "shortages"}. Fontrel recalls these on every trace for the same ingredient.
          </p>
        </>
      )}

      <div className="mt-12">
        {!data ? (
          Array.from({ length: 2 }, (_, i) => (
            <div key={i} className="border-t border-line py-8">
              <div className="h-6 w-1/2 animate-pulse rounded-[6px] bg-panel" />
              <div className="mt-4 h-16 w-3/4 animate-pulse rounded-[6px] bg-panel" />
            </div>
          ))
        ) : data.episodes.length === 0 ? (
          <div className="rounded-[20px] bg-panel p-8">
            <p className="font-display text-[28px] leading-tight">No decisions yet.</p>
            <p className="mt-3 max-w-[60ch] text-ink-2">
              When your team approves or rejects a substitute, it appears here and Fontrel uses it on the next trace.
            </p>
            <Link href={`/app?h=${h}`} className="mt-6 inline-block rounded-full bg-clay px-6 py-3.5 font-medium text-canvas hover:bg-ink">
              Open the shortage list
            </Link>
          </div>
        ) : (
          <ol>
            {data.episodes.map((e) => {
              const link = currentTrace(e);
              return (
                <li key={e.episode} className="grid gap-4 border-t border-line py-8 lg:grid-cols-[200px_1fr] lg:gap-10">
                  <div>
                    <p className="font-mono text-[13px] text-ink-3">Opened {day(e.opened)}</p>
                    <p className="mt-1 font-mono text-[13px] text-ink-3">{e.closed ? `Closed ${day(e.closed)}` : "Open"}</p>
                    {e.synthetic && <p className="label mt-3">Synthetic record</p>}
                  </div>
                  <div>
                    <h2 className="font-display text-[28px] leading-tight">{e.label}</h2>
                    <ul className="mt-4">
                      {e.decisions.map((d) => (
                        <li key={d.decision} className="grid gap-1 border-t border-line py-4 md:grid-cols-[110px_1fr] md:gap-6">
                          <p className={`font-mono text-[12px] uppercase tracking-[0.08em] md:pt-1 ${d.action === "approved" ? "text-clear-deep" : "text-ink-2"}`}>
                            {d.action}
                          </p>
                          <div>
                            <p>
                              <span className="font-medium">
                                {title(d.substitute ?? "Substitute")}
                                {d.labeler ? `, ${d.labeler}` : ""}
                              </span>{" "}
                              <span className="font-mono text-[13px] text-ink-3">{d.substitute_ndc}</span>
                            </p>
                            {d.reason && <p className="mt-1 text-[15px] text-ink-2">&ldquo;{d.reason}&rdquo;</p>}
                            <p className="mt-1 text-[14px] text-ink-3">
                              {[d.outcome === "held" && d.outcome_days ? `Held ${d.outcome_days} days` : null, d.by, d.at ? day(d.at) : null]
                                .filter(Boolean)
                                .join(" · ")}
                            </p>
                          </div>
                        </li>
                      ))}
                      {e.decisions.length === 0 && <li className="border-t border-line py-4 text-ink-3">No decisions recorded for this shortage.</li>}
                    </ul>
                    {link && (
                      <Link href={link.href} className="mt-4 inline-block rounded-full border-[1.5px] border-clay px-5 py-2 text-[15px] font-medium text-clay-deep hover:bg-clay-tint">
                        {link.text}
                      </Link>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </section>
  );
}
