"use client";

import { useEffect, useState } from "react";
import { getJSON, MONTHS } from "@/lib/api";

type Ingest = { source: string; records: number; at: string };

const SOURCES: Record<string, { name: string; unit: string; href: string }> = {
  openfda_shortages: { name: "openFDA drug shortages", unit: "current records", href: "https://open.fda.gov/apis/drug/drugshortages/" },
  openfda_ndc: { name: "openFDA NDC directory", unit: "products", href: "https://open.fda.gov/apis/drug/ndc/" },
  dailymed_spl: { name: "DailyMed labels", unit: "plant links", href: "https://dailymed.nlm.nih.gov/dailymed/" },
  fda_dmf_list: { name: "FDA Drug Master Files", unit: "supplier records", href: "https://www.fda.gov/drugs/drug-master-files-dmfs/list-drug-master-files-dmfs" },
  equivalence: { name: "Equivalent products", unit: "pairs, computed from the NDC directory", href: "" },
};
const ORDER = ["openfda_shortages", "openfda_ndc", "dailymed_spl", "fda_dmf_list", "equivalence"];

function day(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

export function DataSources() {
  const [state, setState] = useState<{ rows?: Ingest[]; failed?: boolean } | null>(null);

  useEffect(() => {
    const ctl = new AbortController();
    getJSON<{ ingest: Ingest[] }>("/api/health", ctl.signal)
      .then((h) => setState({ rows: h.ingest }))
      .catch((e) => {
        if (e.name !== "AbortError") setState({ failed: true });
      });
    return () => ctl.abort();
  }, []);

  const rows = ORDER.map((k) => state?.rows?.find((r) => r.source === k)).filter((r): r is Ingest => Boolean(r));

  return (
    <section id="sources" className="scroll-mt-20 bg-panel py-[clamp(48px,7vw,96px)]">
      <div className="wrap">
        <h2 className="h2 max-w-[20ch]">
          Every answer <span className="em">links to its source.</span>
        </h2>
        <div className="mt-12">
          {!state ? (
            Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="border-t border-line py-5">
                <div className="h-5 w-1/2 animate-pulse rounded-[6px] bg-canvas/70" />
              </div>
            ))
          ) : state.failed ? (
            <p className="border-t border-line py-6 text-ink-2">Live record counts are unavailable right now. The sources are openFDA, DailyMed and the FDA Drug Master File list.</p>
          ) : (
            <ul>
              {rows.map((r) => {
                const s = SOURCES[r.source];
                return (
                  <li key={r.source} className="grid gap-1 border-t border-line py-5 md:grid-cols-[1.3fr_1.4fr_1fr] md:items-baseline md:gap-6">
                    <p className="font-medium">
                      {s.href ? (
                        <a className="link" href={s.href} target="_blank" rel="noreferrer">
                          {s.name}
                        </a>
                      ) : (
                        s.name
                      )}
                    </p>
                    <p className="text-ink-2">
                      <span className="font-display text-[24px] text-ink">{r.records.toLocaleString("en-US")}</span> {s.unit}
                    </p>
                    <p className="font-mono text-[13px] text-ink-3">Loaded {day(r.at)}</p>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="mt-8 border-t border-line pt-6 text-[15px] text-ink-2">
          <p>Hospital formularies and decisions in this app are synthetic.</p>
          <p className="mt-1">Suppliers from the Drug Master File list are registrations, not confirmed supply.</p>
        </div>
      </div>
    </section>
  );
}
