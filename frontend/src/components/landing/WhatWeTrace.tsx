"use client";

import { useEffect, useState } from "react";
import { getJSON } from "@/lib/api";

type Row = { ingredient: string; products: number; shortages: number; candidate_suppliers: number };

function title(s: string) {
  return s.charAt(0) + s.slice(1).toLowerCase();
}

export function WhatWeTrace() {
  const [state, setState] = useState<{ rows?: Row[]; failed?: boolean } | null>(null);
  const [all, setAll] = useState(false);

  useEffect(() => {
    const ctl = new AbortController();
    getJSON<{ count: number; ingredients: Row[] }>("/api/ingredients", ctl.signal)
      .then((d) => setState({ rows: [...d.ingredients].sort((a, b) => b.shortages - a.shortages || a.ingredient.localeCompare(b.ingredient)) }))
      .catch((e) => {
        if (e.name !== "AbortError") setState({ failed: true });
      });
    return () => ctl.abort();
  }, []);

  if (state?.failed) return null;
  const rows = state?.rows ?? [];
  const shown = all ? rows : rows.slice(0, 9);

  return (
    <section id="trace" className="scroll-mt-20 py-[clamp(48px,7vw,96px)]">
      <div className="wrap">
        {!state ? (
          <div className="mx-auto h-14 w-2/3 animate-pulse rounded-[12px] bg-panel" />
        ) : (
          <h2 className="h2 mx-auto max-w-[24ch] text-center">
            {rows.length} ingredients, <span className="em">every</span> current FDA shortage for them.
          </h2>
        )}
        <p className="mx-auto mt-4 max-w-[60ch] text-center text-ink-2">
          The drugs fontrel tracks, with the most current shortages first.
        </p>
        <ul className="mt-12 grid gap-px border-y border-line bg-line md:grid-cols-2 lg:grid-cols-3">
          {!state
            ? Array.from({ length: 9 }, (_, i) => (
                <li key={i} className="bg-canvas p-6">
                  <div className="h-16 animate-pulse rounded-[6px] bg-panel" />
                </li>
              ))
            : shown.map((r) => (
                <li key={r.ingredient} className="bg-canvas px-1 py-6 md:px-6">
                  <p className="font-display text-[28px] leading-tight">{title(r.ingredient)}</p>
                  <p className="mt-2 text-[17px] text-clay">
                    {r.shortages} current {r.shortages === 1 ? "shortage" : "shortages"}
                  </p>
                  <p className="mt-1 font-mono text-[12px] uppercase tracking-[0.08em] text-ink-3">
                    {r.products} products · {r.candidate_suppliers} registered API suppliers
                  </p>
                </li>
              ))}
        </ul>
        {rows.length > 9 && (
          <div className="mt-8 text-center">
            <button
              onClick={() => setAll((a) => !a)}
              aria-expanded={all}
              className="rounded-full border-[1.5px] border-clay px-6 py-3 font-medium text-clay hover:bg-clay-tint"
            >
              {all ? "Show fewer" : `Show all ${rows.length}`}
            </button>
          </div>
        )}
        {state?.rows && (
          <p className="label mt-6 text-center">Shortages from openFDA · Registered suppliers from the FDA Drug Master File list</p>
        )}
      </div>
    </section>
  );
}
