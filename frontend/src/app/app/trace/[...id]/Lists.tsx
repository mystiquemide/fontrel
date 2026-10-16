"use client";

import { useState } from "react";
import { sortExposed, type ExposedRow, type MemoryRow, type Step } from "@/lib/api";
import { Decide } from "./Decide";

type Sub = {
  product_ndc: string;
  product: string;
  labeler: string;
  shared_sites: { site: string }[];
  own_sites: { site: string; setid?: string }[];
  in_shortage: boolean;
  status: "independent" | "unknown" | "shares_site";
  on_formulary: boolean;
};

function title(s: string) {
  return s.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

function label(setid?: string) {
  return setid ? `https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=${setid}` : null;
}

function Status({ tone, children }: { tone: "exposed" | "clear" | "unknown" | "ink"; children: React.ReactNode }) {
  const dot = { exposed: "bg-exposed", clear: "bg-clear", unknown: "bg-unknown", ink: "bg-ink-2" }[tone];
  const text = { exposed: "text-exposed", clear: "text-clear-deep", unknown: "text-ink-3", ink: "text-ink-2" }[tone];
  return (
    <span className={`inline-flex items-center gap-2 font-mono text-[12px] uppercase tracking-[0.08em] ${text}`}>
      <span className={`h-2 w-2 rounded-full ${dot}`} aria-hidden="true" />
      {children}
    </span>
  );
}

function More({ shown, total, onClick, noun }: { shown: number; total: number; onClick: () => void; noun: string }) {
  if (total <= shown) return null;
  return (
    <button onClick={onClick} className="mt-4 rounded-full border-[1.5px] border-clay px-5 py-2 text-[15px] font-medium text-clay-deep hover:bg-clay-tint">
      Show all {total} {noun}
    </button>
  );
}

function Pending({ text }: { text: string }) {
  return <p className="border-t border-line py-6 text-ink-3 motion-safe:animate-pulse">{text}</p>;
}

export function ExposedList({ steps, shortageLabeler, running }: { steps: Step[]; shortageLabeler?: string; running: boolean }) {
  const [all, setAll] = useState(false);
  const step = steps.find((s) => s.tool === "find_site_exposure");
  const rows = step ? sortExposed(step.data as ExposedRow[], shortageLabeler) : null;
  const sorted = rows ?? [];
  const hidden = rows?.filter((r) => !r.already_in_shortage).length ?? 0;
  const shown = all ? sorted : sorted.slice(0, 8);

  return (
    <section>
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="font-display text-[28px] leading-tight">What else is exposed</h2>
        {rows && <span className="font-display text-[28px] text-exposed">{rows.length}</span>}
      </div>
      {rows && rows.length > 0 && (
        <p className="mt-2 text-ink-2">
          Made at the same plant and on your formulary. {hidden} {hidden === 1 ? "has" : "have"} no FDA shortage notice yet.
        </p>
      )}
      <div className="mt-6">
        {!rows ? (
          <Pending text={running ? "Checking which formulary products share this plant" : "This step has no results in this run. Run a fresh trace to try again."} />
        ) : rows.length === 0 ? (
          <p className="border-t border-line py-6 text-ink-2">No other product on your formulary is made at this plant.</p>
        ) : (
          <ul>
            {shown.map((r) => (
              <li key={r.product_ndc} className={`border-t border-line px-3 py-4 ${r.already_in_shortage ? "" : "bg-exposed-tint"}`}>
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <p className="font-medium">{title(r.product)}</p>
                  <Status tone="exposed">{r.already_in_shortage ? "Exposed, in shortage" : "Exposed, no notice yet"}</Status>
                </div>
                <p className="mt-1 text-[15px] text-ink-2">
                  {r.labeler} <span className="ml-1 font-mono text-[13px] text-ink-3">NDC {r.product_ndc}</span>
                </p>
                <p className="mt-1 text-[14px] text-ink-3">
                  Same plant: {r.via_site}
                  {label(r.exposed_label_setid) && (
                    <>
                      {" · "}
                      <a className="link" href={label(r.exposed_label_setid)!} target="_blank" rel="noreferrer">
                        FDA label
                      </a>
                    </>
                  )}
                </p>
              </li>
            ))}
          </ul>
        )}
        <More shown={shown.length} total={sorted.length} onClick={() => setAll(true)} noun="exposed products" />
      </div>
    </section>
  );
}

const SUB_LABEL = {
  independent: { tone: "clear", text: "Independent plant", row: "bg-clear-tint" },
  unknown: { tone: "unknown", text: "No site on file", row: "" },
  shares_site: { tone: "exposed", text: "Shares the plant", row: "bg-exposed-tint" },
} as const;

export function SubstituteList({
  steps,
  running,
  decisions,
  onDecide,
}: {
  steps: Step[];
  running: boolean;
  decisions: Map<string, MemoryRow>;
  onDecide: (ndc: string, action: "approved" | "rejected", reason: string, by: string) => Promise<void>;
}) {
  const [all, setAll] = useState(false);
  const step = steps.find((s) => s.tool === "find_substitutes");
  const rows = step ? (step.data as Sub[]) : null;
  const shown = rows ? (all ? rows : rows.slice(0, 6)) : [];
  const independent = rows?.filter((r) => r.status === "independent").length ?? 0;

  return (
    <section>
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="font-display text-[28px] leading-tight">Proposed substitutes</h2>
        {rows && <span className="font-display text-[28px] text-clear-deep">{independent}</span>}
      </div>
      {rows && rows.length > 0 && (
        <p className="mt-2 text-ink-2">
          Same ingredient, strength, form and route, from another company. {independent} made at a plant the shortage does not touch. A pharmacist decides.
        </p>
      )}
      <div className="mt-6">
        {!rows ? (
          <Pending text={running ? "Looking for equivalent products made elsewhere" : "This step has no results in this run. Run a fresh trace to try again."} />
        ) : rows.length === 0 ? (
          <p className="border-t border-line py-6 text-ink-2">The graph has no equivalent product for this drug.</p>
        ) : (
          <ul>
            {shown.map((r) => {
              const s = SUB_LABEL[r.status];
              const sites = r.status === "shares_site" ? r.shared_sites : r.own_sites;
              return (
                <li key={r.product_ndc} className={`border-t border-line px-3 py-4 ${s.row}`}>
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <p className="font-medium">{title(r.product)}</p>
                    <Status tone={s.tone}>{s.text}</Status>
                  </div>
                  <p className="mt-1 text-[15px] text-ink-2">
                    {r.labeler} <span className="ml-1 font-mono text-[13px] text-ink-3">NDC {r.product_ndc}</span>
                  </p>
                  <p className="mt-1 text-[14px] text-ink-3">
                    {sites.length > 0 ? `Plant: ${[...new Set(sites.map((x) => x.site))].join(", ")}` : "DailyMed lists no manufacturing plant"}
                    {" · "}
                    {r.on_formulary ? "On your formulary" : "Not on your formulary"}
                    {r.in_shortage && " · Also in shortage"}
                  </p>
                  <Decide current={decisions.get(r.product_ndc)} onSave={(a, reason, by) => onDecide(r.product_ndc, a, reason, by)} />
                </li>
              );
            })}
          </ul>
        )}
        <More shown={shown.length} total={rows?.length ?? 0} onClick={() => setAll(true)} noun="substitutes" />
      </div>
    </section>
  );
}
