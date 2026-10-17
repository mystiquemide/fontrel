import Image from "next/image";

const PARTS = [
  { name: "FalkorDB", role: "Graph database. Every path, ranking and memory lives here.", logo: "/logos/falkordb.svg", w: 106, h: 28, href: "https://www.falkordb.com/" },
  { name: "openFDA", role: "Drug shortages and the NDC product directory.", logo: "/logos/openfda.png", w: 414, h: 75, href: "https://open.fda.gov/" },
  { name: "DailyMed", role: "FDA labels, and the manufacturing plants they list.", logo: "/logos/dailymed.png", w: 184, h: 70, href: "https://dailymed.nlm.nih.gov/dailymed/" },
  { name: "Groq", role: "Runs the agent's model, openai/gpt-oss-120b.", logo: "/logos/groq.svg", w: 1982, h: 562, href: "https://groq.com/" },
];

export function BuiltOn() {
  return (
    <section aria-labelledby="built-on" className="py-[clamp(48px,7vw,96px)]">
      <div className="wrap">
        <h2 id="built-on" className="h2 max-w-[20ch]">
          Built on <span className="em">open data and FalkorDB.</span>
        </h2>
        <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PARTS.map((p) => (
            <li key={p.name}>
              <a
                href={p.href}
                target="_blank"
                rel="noreferrer"
                className="group flex h-full flex-col rounded-[16px] border border-line bg-white p-6 transition-colors hover:border-ink/40"
              >
                <span className="flex h-12 items-center">
                  <Image src={p.logo} alt={p.name} width={p.w} height={p.h} unoptimized className="h-8 w-auto max-w-[180px] object-contain object-left" />
                </span>
                <span className="mt-5 text-ink-2">{p.role}</span>
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
