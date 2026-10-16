import { Mark } from "./Logo";

const CREDITS = [
  { name: "National Cancer Institute", href: "https://images.unsplash.com/photo-1580281657529-557a6abb6387" },
  { name: "Árpád Czapp", href: "https://images.unsplash.com/photo-1642055514517-7b52288890ec" },
  { name: "Diana Polekhina", href: "https://images.unsplash.com/photo-1611690828749-66c846dbd1b4" },
];

export function Footer() {
  return (
    <footer className="mt-auto border-t border-line">
      <div className="wrap flex flex-col gap-6 py-10 text-[14px] text-ink-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <Mark size={24} />
          <span>Built for Graph Hacks on FalkorDB, 2026.</span>
          <a className="link" href="https://github.com/mystiquemide/graph-hack">
            GitHub
          </a>
        </div>
        <p>
          Photos on Unsplash by{" "}
          {CREDITS.map((c, i) => (
            <span key={c.name}>
              <a className="link" href={c.href}>
                {c.name}
              </a>
              {i < CREDITS.length - 2 ? ", " : i === CREDITS.length - 2 ? " and " : "."}
            </span>
          ))}
        </p>
      </div>
    </footer>
  );
}
