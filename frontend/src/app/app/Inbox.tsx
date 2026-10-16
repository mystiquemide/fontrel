"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { formatDate, getJSON, traceHref, type Shortage, type Tenant } from "@/lib/api";

type Result =
  | { kind: "error"; message: string }
  | { kind: "ready"; tenant: Tenant; shortages: Shortage[] };
type State = Result | { kind: "loading" };
type Sort = "recent" | "drug" | "status";

const STATUS_ORDER: Record<string, number> = { Unavailable: 0, "Limited Availability": 1, Available: 2 };

function dateKey(mdy: string) {
  const [m, d, y] = mdy.split("/");
  return `${y}${m}${d}`;
}

function title(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

const COLS = "grid grid-cols-1 gap-1 md:grid-cols-[2.2fr_1.4fr_1fr_0.8fr_auto] md:gap-6";

export function Inbox() {
  const h = useSearchParams().get("h") ?? "mercy";
  const [attempt, setAttempt] = useState(0);
  const key = `${h}:${attempt}`;
  const [result, setResult] = useState<{ key: string; value: Result } | null>(null);
  const state: State = useMemo(() => (result?.key === key ? result.value : { kind: "loading" }), [result, key]);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("recent");

  useEffect(() => {
    const ctl = new AbortController();
    Promise.all([
      getJSON<Tenant[]>("/api/tenants", ctl.signal),
      getJSON<Shortage[]>(`/api/shortages?tenant=${encodeURIComponent(h)}`, ctl.signal),
    ])
      .then(([tenants, shortages]) => {
        const tenant = tenants.find((t) => t.id === h);
        setResult({
          key,
          value: tenant
            ? { kind: "ready", tenant, shortages }
            : { kind: "error", message: "This hospital is not on file. Pick one from the menu above." },
        });
      })
      .catch(async (e) => {
        if (e.name === "AbortError") return;
        const dbDown = await fetch("/api/health").then((r) => r.status === 503, () => false);
        setResult({
          key,
          value: {
            kind: "error",
            message: dbDown
              ? "Fontrel cannot reach its graph database right now. Try again."
              : "Fontrel cannot reach its shortage service right now. Try again.",
          },
        });
      });
    return () => ctl.abort();
  }, [h, key]);

  const rows = useMemo(() => {
    if (state.kind !== "ready") return [];
    const q = query.trim().toLowerCase();
    const filtered = q
      ? state.shortages.filter((s) => `${s.shortage} ${s.company} ${s.product_ndc}`.toLowerCase().includes(q))
      : state.shortages;
    return [...filtered].sort((a, b) => {
      if (sort === "drug") return a.shortage.localeCompare(b.shortage);
      if (sort === "status")
        return (STATUS_ORDER[a.availability] ?? 3) - (STATUS_ORDER[b.availability] ?? 3) || dateKey(b.updated).localeCompare(dateKey(a.updated));
      return dateKey(b.updated).localeCompare(dateKey(a.updated));
    });
  }, [state, query, sort]);

  return (
    <section className="wrap py-[clamp(48px,7vw,96px)]">
      {state.kind === "error" ? (
        <div className="rounded-[20px] bg-panel p-8">
          <p className="text-ink-2">{state.message}</p>
          <button
            onClick={() => setAttempt((a) => a + 1)}
            className="mt-4 rounded-full bg-clay px-6 py-3.5 font-medium text-canvas hover:bg-ink"
          >
            Try again
          </button>
        </div>
      ) : (
        <>
          {state.kind === "ready" ? (
            <>
              <p className="label">Synthetic hospital · {state.tenant.formulary_items} formulary items</p>
              <h1 className="h1 mt-4">
                {state.shortages.length} current FDA shortage records{" "}
                <span className="em">touch your formulary.</span>
              </h1>
              <p className="mt-4 text-[19px] text-ink-2">{state.tenant.name}</p>
            </>
          ) : (
            <>
              <p className="label">Loading shortages</p>
              <div className="mt-4 h-[clamp(48px,5vw,80px)] w-3/4 animate-pulse rounded-[12px] bg-panel" />
            </>
          )}

          <div className="mt-12 flex flex-col gap-3 md:flex-row md:items-center">
            <label className="flex-1">
              <span className="sr-only">Search drug, company or NDC</span>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                disabled={state.kind !== "ready"}
                placeholder="Search drug, company or NDC"
                className="w-full rounded-[6px] border-[1.5px] border-line bg-canvas px-4 py-3 text-[16px] placeholder:text-ink-3 focus:border-clay focus:outline-none"
              />
            </label>
            <label className="flex items-center gap-3">
              <span className="label">Sort</span>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as Sort)}
                disabled={state.kind !== "ready"}
                className="rounded-full border-[1.5px] border-line bg-canvas px-4 py-2.5 text-[15px] hover:border-clay focus:border-clay focus:outline-none"
              >
                <option value="recent">Most recent</option>
                <option value="status">Least available first</option>
                <option value="drug">Drug A to Z</option>
              </select>
            </label>
          </div>

          <div className={`${COLS} mt-8 hidden pb-3 md:grid`}>
            {["Drug", "Company", "Status", "Updated"].map((c) => (
              <span key={c} className="label">{c}</span>
            ))}
            <span className="sr-only">Action</span>
          </div>

          {state.kind === "loading" && (
            <ul aria-hidden="true">
              {Array.from({ length: 6 }, (_, i) => (
                <li key={i} className="border-t border-line py-4">
                  <div className="h-5 w-2/3 animate-pulse rounded-[6px] bg-panel" />
                </li>
              ))}
            </ul>
          )}

          {state.kind === "ready" && state.shortages.length === 0 && (
            <p className="border-t border-line py-8 text-ink-2">No current FDA shortages touch this formulary.</p>
          )}

          {state.kind === "ready" && state.shortages.length > 0 && rows.length === 0 && (
            <p className="border-t border-line py-8 text-ink-2">
              Nothing matches &ldquo;{query}&rdquo;.{" "}
              <button className="link" onClick={() => setQuery("")}>Clear search</button>
            </p>
          )}

          {state.kind === "ready" && rows.length > 0 && (
            <>
              <ul>
                {rows.map((s) => (
                  <li key={s.shortage_id} className={`${COLS} group relative border-t border-line py-4 hover:bg-clay-tint`}>
                    <div>
                      <p className="font-medium">{s.shortage}</p>
                      <p className="font-mono text-[13px] text-ink-3">Package NDC {s.shortage_id.split("|")[0]}</p>
                    </div>
                    <p className="text-ink-2">{s.company}</p>
                    <p className="font-mono text-[12px] uppercase tracking-[0.08em] text-ink-2 md:pt-1">
                      {title(s.availability)}
                    </p>
                    <p className="text-[14px] text-ink-3 md:pt-0.5">{formatDate(s.updated)}</p>
                    <Link
                      href={traceHref(s.shortage_id, h)}
                      className="mt-2 self-start rounded-full border-[1.5px] border-clay px-4 py-1.5 text-[14px] font-medium text-clay-deep after:absolute after:inset-0 group-hover:bg-clay group-hover:text-canvas md:mt-0"
                    >
                      Trace
                    </Link>
                  </li>
                ))}
              </ul>
              <p className="label mt-6 border-t border-line pt-6">
                Showing {rows.length} of {state.shortages.length} · Source: openFDA drug shortages
              </p>
            </>
          )}
        </>
      )}
    </section>
  );
}
