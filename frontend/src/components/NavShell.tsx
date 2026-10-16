import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "./Logo";

export type NavItem = { key: string; label: string; node: (className: string) => ReactNode; active?: boolean };

/** One header frame for the landing page and the app, so both bars line up exactly. */
export function NavShell({
  items,
  right,
  tone = "light",
  className = "",
}: {
  items: NavItem[];
  right: ReactNode;
  tone?: "light" | "dark";
  className?: string;
}) {
  const dark = tone === "dark";
  const link = (active?: boolean) =>
    dark
      ? active
        ? "text-canvas"
        : "text-canvas/80 hover:text-canvas"
      : active
        ? "text-ink"
        : "text-ink-2 hover:text-clay";
  return (
    <header className={`border-b transition-colors duration-300 ${dark ? "border-transparent bg-transparent text-canvas" : "border-line bg-canvas text-ink"} ${className}`}>
      <div className="wrap flex h-16 items-center gap-6 md:gap-8">
        <Link href="/" aria-label="fontrel home" className="shrink-0">
          <Logo size={28} variant={dark ? "cream" : "clay"} />
        </Link>
        <nav aria-label="Main" className="hidden items-center gap-7 text-[15px] md:flex">
          {items.map((i) => (
            <span key={i.key}>{i.node(`inline-block py-2 ${link(i.active)}`)}</span>
          ))}
        </nav>
        <div className="ml-auto flex min-w-0 items-center gap-3">{right}</div>
      </div>
      {items.length > 0 && (
        <nav aria-label="Main" className={`wrap flex gap-6 overflow-x-auto border-t py-1 text-[15px] md:hidden ${dark ? "border-canvas/20" : "border-line"}`}>
          {items.map((i) => (
            <span key={i.key} className="shrink-0">
              {i.node(`inline-block py-1.5 ${link(i.active)} ${i.active ? "underline decoration-clay underline-offset-4" : ""}`)}
            </span>
          ))}
        </nav>
      )}
    </header>
  );
}
