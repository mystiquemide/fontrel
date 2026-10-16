"use client";

import { useEffect, useState } from "react";
import { getJSON } from "@/lib/api";

type Health = { counts: Record<string, number> };

export function HeroStats() {
  const [state, setState] = useState<{ counts?: Record<string, number>; failed?: boolean } | null>(null);

  useEffect(() => {
    const ctl = new AbortController();
    getJSON<Health>("/api/health", ctl.signal)
      .then((h) => setState({ counts: h.counts }))
      .catch((e) => {
        if (e.name !== "AbortError") setState({ failed: true });
      });
    return () => ctl.abort();
  }, []);

  if (!state) return <div className="h-[76px]" aria-hidden="true" />;
  if (state.failed || !state.counts) return <p className="label !text-canvas/70">Live counts unavailable right now</p>;

  const c = state.counts;
  const stats = [
    { n: c.Product, label: "Products traced", src: "openFDA NDC" },
    { n: c.Shortage, label: "Current FDA shortages", src: "openFDA" },
    { n: c.Site, label: "Manufacturing plants", src: "DailyMed" },
  ];
  return (
    <dl className="grid grid-cols-3 divide-x divide-canvas/25 motion-safe:animate-[chip_400ms_ease-out]">
      {stats.map((s, i) => (
        <div key={s.label} className={i === 0 ? "pr-4" : "px-4"}>
          <dd className="font-display text-[clamp(28px,3vw,40px)] leading-none">{s.n.toLocaleString("en-US")}</dd>
          <dt className="mt-2 text-[14px] leading-snug text-canvas/85">{s.label}</dt>
          <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.08em] text-canvas/60">{s.src}</p>
        </div>
      ))}
    </dl>
  );
}
