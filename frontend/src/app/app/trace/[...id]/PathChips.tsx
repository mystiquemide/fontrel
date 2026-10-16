import type { Step } from "@/lib/api";

type Chip = { label: string; title: string; sub: string; tone: "ink" | "exposed" | "muted" };

function title(s: string) {
  return s.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

function buildChips(steps: Step[]): (Chip | null)[] {
  const shortage = steps.find((s) => s.tool === "get_shortage")?.data[0] as
    | { product: string; labeler: string; product_ndc: string; sites: { site: string; duns: string }[] }
    | undefined;
  const exposure = steps.find((s) => s.tool === "find_site_exposure");

  const chips: (Chip | null)[] = [null, null, null, null];
  if (!shortage) return chips;
  chips[0] = { label: "Shortage", title: "FDA shortage notice", sub: "openFDA", tone: "ink" };
  chips[1] = { label: "Product", title: `${title(shortage.product)}, ${shortage.labeler}`, sub: `NDC ${shortage.product_ndc}`, tone: "ink" };
  const site = shortage.sites?.[0];
  chips[2] = site
    ? { label: "Plant", title: title(site.site), sub: `DUNS ${site.duns}`, tone: "ink" }
    : { label: "Plant", title: "No plant on file", sub: "DailyMed lists no manufacturing site", tone: "muted" };
  if (!exposure || !site) return chips;

  const rows = exposure.data as { product_ndc: string; product: string; labeler: string; via_site: string }[];
  const products = new Map(rows.map((r) => [r.product_ndc, r]));
  const others = [...products.values()].filter((r) => r.labeler !== shortage.labeler);
  const lead = others[0] ?? [...products.values()][0];
  chips[3] = lead
    ? {
        label: "Also exposed",
        title: `${title(lead.product)}, ${lead.labeler}`,
        sub:
          products.size > 1
            ? `and ${products.size - 1} more on your formulary, ${others.length} from other companies`
            : `NDC ${lead.product_ndc}`,
        tone: "exposed",
      }
    : { label: "Also exposed", title: "Nothing else on your formulary", sub: "No other product shares this plant", tone: "muted" };
  return chips;
}

const TONE = {
  ink: "border-ink/70 bg-canvas",
  exposed: "border-exposed bg-exposed-tint",
  muted: "border-line bg-canvas text-ink-3",
};

export function PathChips({ steps, running }: { steps: Step[]; running: boolean }) {
  const chips = buildChips(steps);
  return (
    <div className="mt-10 rounded-[20px] bg-panel p-6 md:p-8">
      <p className="label">Supply path</p>
      <ol className="mt-5 grid gap-3 lg:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr] lg:items-stretch">
        {chips.map((c, i) => (
          <li key={i} className="contents">
            {i > 0 && (
              <span aria-hidden="true" className="hidden self-center text-ink-3 lg:block">
                <svg width="16" height="16" viewBox="0 0 16 16"><path d="M5 3 L10 8 L5 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
              </span>
            )}
            {c ? (
              <div className={`motion-safe:animate-[chip_400ms_ease-out] rounded-[12px] border-[1.5px] p-4 ${TONE[c.tone]}`}>
                <p className={`label ${c.tone === "exposed" ? "!text-exposed" : ""}`}>{c.label}</p>
                <p className="mt-1.5 font-medium leading-snug">{c.title}</p>
                <p className="mt-1 font-mono text-[13px] text-ink-3">{c.sub}</p>
              </div>
            ) : (
              <div className={`rounded-[12px] border-[1.5px] border-dashed border-line p-4 ${running ? "motion-safe:animate-pulse" : ""}`}>
                <p className="label">{["Shortage", "Product", "Plant", "Also exposed"][i]}</p>
                <p className="mt-1.5 text-ink-3">{running ? "Tracing" : "Not reached"}</p>
              </div>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
