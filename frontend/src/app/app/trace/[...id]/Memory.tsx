import { MONTHS, shortDate, type MemoryRow, type Step } from "@/lib/api";

type Row = MemoryRow;

function month(iso: string) {
  const [y, m] = iso.split("-").map(Number);
  return y && m ? `${MONTHS[m - 1]} ${y}` : iso;
}

function title(s: string) {
  return s.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

export function MemoryList({ steps, running, live }: { steps: Step[]; running: boolean; live: Row[] | null }) {
  const step = steps.find((s) => s.tool === "recall_memory");
  const rows = live ?? (step ? (step.data as Row[]) : null);
  return (
    <section>
      <h2 className="font-display text-[28px] leading-tight">Your hospital&rsquo;s memory</h2>
      <div className="mt-6">
        {!rows ? (
          <p className="border-t border-line py-6 text-ink-3 motion-safe:animate-pulse">
            {running ? "Recalling past decisions for this drug" : "This step did not run."}
          </p>
        ) : rows.length === 0 ? (
          <p className="border-t border-line py-6 text-ink-2">
            No past decisions for this drug yet. When your team approves or rejects a substitute, fontrel uses it on the next trace.
          </p>
        ) : (
          <ul>
            {rows.map((r) => (
              <li key={r.decision} className="grid gap-1 border-t border-line py-4 md:grid-cols-[110px_1fr] md:gap-6">
                <p className="font-mono text-[13px] text-ink-3">{month(r.opened)}</p>
                <div>
                  <p>
                    <span className={`font-mono text-[12px] uppercase tracking-[0.08em] ${r.action === "approved" ? "text-clear" : "text-ink-2"}`}>
                      {r.action}
                    </span>{" "}
                    <span className="font-medium">
                      {title(r.substitute)}, {r.substitute_labeler}
                    </span>{" "}
                    <span className="font-mono text-[13px] text-ink-3">{r.substitute_ndc}</span>
                  </p>
                  {r.reason && <p className="mt-1 text-[15px] text-ink-2">&ldquo;{r.reason}&rdquo;</p>}
                  <p className="mt-1 text-[14px] text-ink-3">
                    {r.outcome === "held" && r.outcome_days ? `Held ${r.outcome_days} days · ` : ""}
                    {r.episode_label}
                    {r.synthetic ? " · Synthetic record" : r.by ? ` · ${r.by}${r.at ? `, ${shortDate(r.at)}` : ""}` : ""}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
