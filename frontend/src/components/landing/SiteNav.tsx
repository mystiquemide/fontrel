"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { NavShell } from "../NavShell";
import { ScrollLink } from "./ScrollLink";
import type { SectionId } from "./sections";

const LINKS: { to: SectionId; label: string }[] = [
  { to: "how", label: "How it works" },
  { to: "trace", label: "What we trace" },
  { to: "sources", label: "Sources" },
  { to: "faq", label: "FAQ" },
];

export function SiteNav() {
  const [solid, setSolid] = useState(false);

  useEffect(() => {
    const onScroll = () => setSolid(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <NavShell
      className="fixed inset-x-0 top-0 z-30"
      tone={solid ? "light" : "dark"}
      items={LINKS.map((l) => ({
        key: l.to,
        label: l.label,
        node: (cls) => (
          <ScrollLink to={l.to} className={cls}>
            {l.label}
          </ScrollLink>
        ),
      }))}
      right={
        <Link
          href="/app"
          className={`rounded-full px-5 py-2.5 text-[15px] font-medium transition-colors ${
            solid ? "bg-clay text-canvas hover:bg-ink" : "bg-canvas text-ink hover:bg-clay hover:text-canvas"
          }`}
        >
          Open the app
        </Link>
      }
    />
  );
}
