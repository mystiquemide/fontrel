"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { getJSON, type Tenant } from "@/lib/api";

type Plant = { site: string; duns: string; pagerank: number; products: number; labelers: number; shortages: number };
type Cluster = { cluster: number; site_count: number; sites: string[]; formulary_count: number; formulary_sample: string[] };
type Query = { graph: string; cypher: string; params: Record<string, unknown> };
type Sources = { plants: Plant[]; clusters: Cluster[]; queries: Query[] };

function title(s: string) {
  return s.replace(/\w\S*/g, (w) => {
    const letters = w.replace(/[^A-Za-z]/g, "");
    return letters.length <= 3 && letters === letters.toUpperCase() ? w : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
  });
}

function shortName(name: string) {
  return name.replace(/ (General|Community) Hospital$/, "");
}

function QueryToggle({ q }: { q?: Query }) {
  const [open, setOpen] = useState(false);
  if (!q) return null;
  return (
    <div className="mt-4">
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="link text-[14px] text-ink-2">
        {open ? "Hide query" : "Show query"}
      </button>
      {open && (
        <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-words rounded-[6px] bg-panel p-4 font-mono text-[12px] leading-relaxed">
          {q.cypher.trim()}
        </pre>
      )}
    </div>
  );
}

export function SourcesPage() {
  const h = useSearchParams().get("h") ?? "mercy";
  const [attempt, setAttempt] = useState(0);
  const key = `${h}:${attempt}`;
  const [result, setResult] = useState<{ key: string; data?: { s: Sources; tenant: Tenant }; error?: string } | null>(null);
  const state = result?.key === key ? result : null;

  useEffect(() => {
    const ctl = new AbortController();
    Promise.all([getJSON<Tenant[]>("/api/tenants", ctl.signal), getJSON<Sources>(`/api/sources?tenant=${encodeURIComponent(h)}`, ctl.signal)])
      .then(([tenants, s]) => {
        const tenant = tenants.find((t) => t.id === h);
        setResult(tenant ? { key, data: { s, tenant } } : { key, error: "This hospital is not on file. Pick one from the menu above." });
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
  const plants = data?.s.plants ?? [];
  const top = plants[0]?.pagerank ?? 1;

  return (
    <section className="wrap py-[clamp(48px,7vw,96px)]">
      <p className="label">Manufacturing plants · DailyMed and FalkorDB</p>
      <h1 className="h1 mt-4">
        Where your risk <span className="em">concentrates.</span>
      </h1>
      <p className="mt-4 max-w-[62ch] text-[19px] text-ink-2">
        One plant can make dozens of drugs sold under different company names. These are the plants the most products depend on.
      </p>

      <div className="mt-16">
        <h2 className="h2 !text-[clamp(28px,3vw,40px)]">Plants ranked by dependence</h2>
        <p className="mt-3 max-w-[62ch] text-ink-2">
          PageRank on manufacturing links across the whole supply graph. A plant ranks higher when many products depend on it.
        </p>

        <div className="mt-8 hidden grid-cols-[2.4fr_1.4fr_0.7fr_0.8fr_0.9fr] gap-6 pb-3 md:grid">
          {["Plant", "PageRank", "Products", "Companies", "Shortage notices"].map((c) => (
            <span key={c} className="label">{c}</span>
          ))}
        </div>
        {!data ? (
          Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="border-t border-line py-4">
              <div className="h-5 w-2/3 animate-pulse rounded-[6px] bg-panel" />
            </div>
          ))
        ) : plants.length === 0 ? (
          <p className="border-t border-line py-6 text-ink-2">No manufacturing links are loaded yet.</p>
        ) : (
          <ol>
            {plants.map((p, i) => (
              <li key={p.duns} className="grid grid-cols-1 gap-2 border-t border-line py-4 md:grid-cols-[2.4fr_1.4fr_0.7fr_0.8fr_0.9fr] md:items-center md:gap-6">
                <div className="flex items-baseline gap-3">
                  <span className="font-mono text-[13px] text-clay">{String(i + 1).padStart(2, "0")}</span>
                  <div>
                    <p className="font-medium">{title(p.site)}</p>
                    <p className="font-mono text-[13px] text-ink-3">DUNS {p.duns}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="h-2 rounded-full bg-clay" style={{ width: `${Math.max(4, (p.pagerank / top) * 100)}%` }} aria-hidden="true" />
                  <span className="font-mono text-[13px]">{p.pagerank.toFixed(4)}</span>
                </div>
                <p className="text-[15px] text-ink-2"><span className="md:hidden label mr-2">Products</span>{p.products}</p>
                <p className="text-[15px] text-ink-2"><span className="md:hidden label mr-2">Companies</span>{p.labelers}</p>
                <p className="text-[15px] text-ink-2">
                  <span className="md:hidden label mr-2">Shortage notices</span>
                  {p.shortages}
                </p>
              </li>
            ))}
          </ol>
        )}
        <QueryToggle q={data?.s.queries[0]} />
      </div>

      <div className="mt-20">
        <h2 className="h2 !text-[clamp(28px,3vw,40px)]">
          Plant groups touching {data ? shortName(data.tenant.name) : "your hospital"}
        </h2>
        <p className="mt-3 max-w-[62ch] text-ink-2">
          Connected components: plants linked through the products they share. A problem at one plant can reach every product in its group.
        </p>
        <div className="mt-8">
          {!data ? (
            <div className="h-24 animate-pulse rounded-[20px] bg-panel" />
          ) : data.s.clusters.length === 0 ? (
            <p className="border-t border-line py-6 text-ink-2">None of this formulary&rsquo;s products have plant data on file.</p>
          ) : (
            <ul className="grid gap-4 md:grid-cols-2">
              {data.s.clusters.map((c) => {
                const sites = [...new Set(c.sites)];
                return (
                  <li key={c.cluster} className="rounded-[20px] bg-panel p-6">
                    <p className="font-display text-[40px] leading-none text-clay">{c.formulary_count}</p>
                    <p className="mt-1 text-ink-2">of your formulary products</p>
                    <p className="label mt-5">
                      {sites.length} {sites.length === 1 ? "plant" : "plants"}
                    </p>
                    <p className="mt-1.5 text-[15px] leading-relaxed">{sites.map(title).join(" · ")}</p>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <QueryToggle q={data?.s.queries[1]} />
      </div>
    </section>
  );
}
