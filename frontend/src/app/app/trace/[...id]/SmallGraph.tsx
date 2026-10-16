"use client";

import { useEffect, useState } from "react";
import { getJSON } from "@/lib/api";

type GNode = { id: string; label: string; kind: "shortage" | "product" | "site"; labeler?: string; role?: string; status?: string };
type GEdge = { source: string; target: string; type: string };
type Graph = { nodes: GNode[]; edges: GEdge[] };

const COLOR = {
  ink: "#2A2B2F",
  ink2: "#515151",
  line: "#D1C9BF",
  exposed: "#9F2A1F",
  clear: "#4C9A62",
  unknown: "#666666",
  canvas: "#FEF9EF",
};

function title(s: string) {
  return s.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

function cut(s: string, n: number) {
  if (s.length <= n) return s;
  const head = s.slice(0, n);
  const space = head.lastIndexOf(" ");
  return (space > n / 2 ? head.slice(0, space) : head).replace(/[,.\s]+$/, "");
}

function company(s = "") {
  return s.split(/ dba /i)[0].replace(/,? (Inc|LLC|Limited|Ltd|Corporation|Private Limited|L\.?P)\.?$/i, "").replace(/ Private$/, "");
}

function nodeColor(n: GNode) {
  if (n.role === "exposed") return COLOR.exposed;
  if (n.role === "substitute") return n.status === "independent" ? COLOR.clear : n.status === "shares_site" ? COLOR.exposed : COLOR.unknown;
  if (n.kind === "site") return COLOR.ink2;
  return COLOR.ink;
}

const ROW = 38;
const W = 1120;

function layout(g: Graph) {
  const unique = [...new Map(g.nodes.map((n) => [n.id, n])).values()];
  const subs = unique.filter((n) => n.role === "substitute");
  const exposed = unique.filter((n) => n.role === "exposed");
  const sites = unique.filter((n) => n.kind === "site");
  const shortage = unique.find((n) => n.kind === "shortage");
  const product = unique.find((n) => n.role === "short");
  const rows = Math.max(subs.length, exposed.length, sites.length * 2, 4);
  const H = rows * ROW + 40;
  const mid = H / 2;
  const pos = new Map<string, { x: number; y: number; n: GNode; side: "left" | "right" | "below" | "above" }>();
  const column = (list: GNode[], x: number, side: "left" | "right") =>
    list.forEach((n, i) => pos.set(n.id, { x, y: mid + (i - (list.length - 1) / 2) * ROW, n, side }));
  column(subs, 330, "left");
  column(exposed, 800, "right");
  sites.forEach((n, i) => pos.set(n.id, { x: 640, y: mid + (i - (sites.length - 1) / 2) * ROW * 2, n, side: "above" }));
  if (product) pos.set(product.id, { x: 480, y: mid, n: product, side: "below" });
  if (shortage) pos.set(shortage.id, { x: 480, y: Math.max(40, mid - 130), n: shortage, side: "above" });
  return { pos, H, counts: { subs: subs.length, exposed: exposed.length } };
}

export function SmallGraph({
  tenant,
  shortageId,
  totals,
}: {
  tenant: string;
  shortageId: string;
  totals: { exposed?: number; subs?: number };
}) {
  const key = `${tenant}|${shortageId}`;
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ key: string; graph?: Graph; failed?: boolean } | null>(null);
  const [open, setOpen] = useState(true);
  const fetchKey = `${key}|${attempt}`;

  useEffect(() => {
    const ctl = new AbortController();
    getJSON<Graph>(`/api/graph/subgraph?tenant=${encodeURIComponent(tenant)}&shortage_id=${encodeURIComponent(shortageId)}`, ctl.signal)
      .then((graph) => setResult({ key: fetchKey, graph }))
      .catch((e) => {
        if (e.name !== "AbortError") setResult({ key: fetchKey, failed: true });
      });
    return () => ctl.abort();
  }, [tenant, shortageId, fetchKey]);

  const state = result?.key === fetchKey ? result : null;
  const g = state?.graph;
  const lay = g ? layout(g) : null;

  return (
    <section className="mt-16">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <h2 className="font-display text-[28px] leading-tight">The graph behind this answer</h2>
        <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="link inline-block py-1.5 text-[15px] text-ink-2">
          {open ? "Hide graph" : "Show graph"}
        </button>
      </div>
      {open && (
        <div className="mt-6 rounded-[20px] bg-panel p-4 md:p-8">
          {!state ? (
            <p className="py-10 text-center text-ink-3 motion-safe:animate-pulse">Loading the graph</p>
          ) : state.failed || !lay ? (
            <p className="py-6 text-ink-2">
              The graph did not load. Check your connection, then{" "}
              <button className="link text-ink" onClick={() => setAttempt((a) => a + 1)}>
                try again
              </button>
            </p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <svg viewBox={`0 0 ${W} ${lay.H}`} className="min-w-[760px]" role="img" aria-label="Supply graph for this shortage">
                  {g!.edges.map((e, i) => {
                    const a = lay.pos.get(e.source);
                    const b = lay.pos.get(e.target);
                    if (!a || !b) return null;
                    const mx = (a.x + b.x) / 2;
                    const stroke = e.type === "MADE_AT" && b.n.role === "exposed" ? COLOR.exposed : e.type === "MADE_AT" && a.n.role === "exposed" ? COLOR.exposed : COLOR.line;
                    return (
                      <path
                        key={i}
                        d={`M${a.x} ${a.y} C${mx} ${a.y} ${mx} ${b.y} ${b.x} ${b.y}`}
                        fill="none"
                        stroke={stroke}
                        strokeOpacity={stroke === COLOR.line ? 1 : 0.45}
                        strokeWidth={1.5}
                      />
                    );
                  })}
                  {[...lay.pos.values()].map(({ x, y, n, side }) => {
                    const c = nodeColor(n);
                    const big = n.kind !== "product" || n.role === "short";
                    const name =
                      n.role === "substitute"
                        ? `${cut(company(n.labeler), 24)}, ${n.id}`
                        : n.kind === "product"
                          ? `${cut(title(n.label), n.role === "short" ? 40 : 24)}, ${cut(company(n.labeler), 22)}`
                          : cut(n.kind === "site" ? title(n.label) : n.label, 40);
                    const tx = side === "left" ? x - 14 : side === "right" ? x + 14 : x;
                    const ty = side === "below" ? y + 28 : side === "above" ? y - 18 : y + 4.5;
                    const anchor = side === "left" ? "end" : side === "right" ? "start" : "middle";
                    return (
                      <g key={n.id}>
                        <title>{`${n.kind === "product" ? `${title(n.label)}, ${n.labeler} (NDC ${n.id})` : n.label}`}</title>
                        {n.kind === "site" ? (
                          <rect x={x - 11} y={y - 11} width={22} height={22} rx={4} fill={COLOR.canvas} stroke={c} strokeWidth={2} />
                        ) : (
                          <circle cx={x} cy={y} r={big ? 10 : 6.5} fill={n.kind === "shortage" ? COLOR.canvas : c} stroke={c} strokeWidth={2} />
                        )}
                        <text x={tx} y={ty} textAnchor={anchor} fontSize={big ? 14 : 12.5} fill={big ? COLOR.ink : COLOR.ink2} fontFamily="var(--font-instrument)">
                          {name}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              </div>
              <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 font-mono text-[12px] uppercase tracking-[0.08em] text-ink-2">
                <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full border-2 border-ink" />Shortage</span>
                <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-[2px] border-2 border-ink-2" />Plant</span>
                <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-exposed" />Exposed</span>
                <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-clear" />No shared plant on record</span>
                <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-unknown" />Plant overlap unknown</span>
              </div>
              <p className="mt-3 text-[14px] text-ink-3">
                Showing {lay.counts.exposed}
                {totals.exposed ? ` of ${totals.exposed}` : ""} exposed products and {lay.counts.subs}
                {totals.subs ? ` of ${totals.subs}` : ""} candidates, from FalkorDB. The full lists are above.
              </p>
            </>
          )}
        </div>
      )}
    </section>
  );
}
