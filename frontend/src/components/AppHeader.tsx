"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Logo } from "./Logo";
import { getJSON, type Tenant } from "@/lib/api";

const NAV = [
  { href: "/app", label: "Shortages" },
  { href: "/app/memory", label: "Memory" },
];

export function AppHeader() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [tenants, setTenants] = useState<Tenant[] | null>(null);
  const [error, setError] = useState(false);
  const current = params.get("h") ?? "mercy";

  useEffect(() => {
    const ctl = new AbortController();
    getJSON<Tenant[]>("/api/tenants", ctl.signal)
      .then(setTenants)
      .catch((e) => {
        if (e.name !== "AbortError") setError(true);
      });
    return () => ctl.abort();
  }, []);

  function choose(id: string) {
    const next = new URLSearchParams(params);
    next.set("h", id);
    router.push(`${pathname}?${next.toString()}`);
  }

  const active = (href: string) =>
    href === "/app" ? pathname === "/app" || pathname.startsWith("/app/trace") : pathname.startsWith(href);

  return (
    <header className="border-b border-line bg-canvas">
      <div className="wrap flex h-16 items-center gap-4 md:gap-8">
        <Link href={`/app?h=${current}`} aria-label="fontrel home">
          <Logo size={28} />
        </Link>
        <nav className="hidden gap-6 text-[15px] md:flex">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={`${n.href}?h=${current}`}
              className={active(n.href) ? "text-ink" : "text-ink-2 hover:text-clay"}
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <span className="label hidden lg:inline">Synthetic hospital</span>
          {error ? (
            <span className="text-[14px] text-exposed">Hospitals unavailable</span>
          ) : tenants === null ? (
            <span className="label">Loading</span>
          ) : (
            <label className="relative min-w-0">
              <span className="sr-only">Hospital</span>
              <select
                value={current}
                onChange={(e) => choose(e.target.value)}
                className="w-full max-w-[210px] truncate appearance-none rounded-full md:max-w-none border-[1.5px] border-line bg-canvas py-2 pl-4 pr-9 text-[15px] hover:border-clay focus:border-clay focus:outline-none"
              >
                {tenants.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              <svg className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                <path d="M2 4.5 L6 8.5 L10 4.5" fill="none" stroke="#515151" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </label>
          )}
        </div>
      </div>
      <nav className="wrap flex gap-6 border-t border-line py-2.5 text-[15px] md:hidden">
        {NAV.map((n) => (
          <Link key={n.href} href={`${n.href}?h=${current}`} className={active(n.href) ? "text-ink underline decoration-clay underline-offset-4" : "text-ink-2"}>
            {n.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
