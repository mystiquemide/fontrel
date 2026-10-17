import Link from "next/link";
import { ScrollLink } from "./landing/ScrollLink";
import { Logo } from "./Logo";

const linkClass = "inline-block py-1 text-canvas/75 hover:text-canvas";

function Column({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="font-mono text-[12px] uppercase tracking-[0.08em] text-canvas/50">{title}</p>
      <ul className="mt-4 flex flex-col gap-1.5 text-[15px]">{children}</ul>
    </div>
  );
}

export function Footer() {
  return (
    <footer className="mt-auto bg-ink text-canvas">
      <div className="wrap grid gap-12 py-[clamp(48px,6vw,80px)] lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div className="max-w-[34ch]">
          <Logo size={32} variant="cream" />
          <p className="mt-6 font-display text-[24px] leading-snug">
            See the shortage <span className="italic text-[#F2B896]">behind the shortage.</span>
          </p>
          <p className="mt-4 text-[15px] leading-relaxed text-canvas/70">
            A graph of FDA labels, plants and shortages that helps hospital pharmacy teams review what else a shortage puts at risk.
          </p>
        </div>

        <Column title="Product">
          <li><ScrollLink to="how" className={linkClass}>How it works</ScrollLink></li>
          <li><ScrollLink to="trace" className={linkClass}>What we trace</ScrollLink></li>
          <li><ScrollLink to="sources" className={linkClass}>Data sources</ScrollLink></li>
          <li><ScrollLink to="faq" className={linkClass}>FAQ</ScrollLink></li>
        </Column>

        <Column title="App">
          <li><Link href="/app" className={linkClass}>Shortages</Link></li>
          <li><Link href="/app/memory" className={linkClass}>Decision memory</Link></li>
          <li><Link href="/app/sources" className={linkClass}>Plant ranking</Link></li>
        </Column>

        <Column title="Project">
          <li><a href="https://github.com/mystiquemide/fontrel" className={linkClass}>Source code</a></li>
          <li><a href="https://github.com/mystiquemide/fontrel/blob/main/LICENSE" className={linkClass}>MIT license</a></li>
          <li><a href="https://open.fda.gov/" className={linkClass}>openFDA</a></li>
          <li><a href="https://dailymed.nlm.nih.gov/dailymed/" className={linkClass}>DailyMed</a></li>
        </Column>
      </div>

      <div className="border-t border-canvas/15">
        <div className="wrap flex flex-col gap-3 py-6 text-[13px] text-canvas/55 md:flex-row md:items-center md:justify-between">
          <p>&copy; 2026 Fontrel. Hospital data in this app is synthetic.</p>
          <p>Decision support for pharmacists, not medical advice.</p>
        </div>
      </div>
    </footer>
  );
}
