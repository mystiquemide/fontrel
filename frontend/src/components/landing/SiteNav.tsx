"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Logo } from "../Logo";

export type NavLink = { href: string; label: string };

export function SiteNav({ links }: { links: NavLink[] }) {
  const [solid, setSolid] = useState(false);

  useEffect(() => {
    const onScroll = () => setSolid(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-30 transition-colors duration-300 ${
        solid ? "border-b border-line bg-canvas text-ink" : "border-b border-transparent bg-transparent text-canvas"
      }`}
    >
      <div className="wrap flex h-16 items-center gap-8">
        <Link href="/" aria-label="fontrel home">
          <Logo size={28} variant={solid ? "clay" : "cream"} />
        </Link>
        {links.length > 0 && (
          <nav className="hidden gap-7 text-[15px] lg:flex">
            {links.map((l) => (
              <a key={l.href} href={l.href} className={solid ? "text-ink-2 hover:text-clay" : "text-canvas/85 hover:text-canvas"}>
                {l.label}
              </a>
            ))}
          </nav>
        )}
        <Link
          href="/app"
          className={`ml-auto rounded-full px-5 py-2.5 text-[15px] font-medium transition-colors ${
            solid ? "bg-clay text-canvas hover:bg-ink" : "bg-canvas text-ink hover:bg-clay hover:text-canvas"
          }`}
        >
          Open the app
        </Link>
      </div>
    </header>
  );
}
