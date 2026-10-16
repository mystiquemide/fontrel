"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { NavShell } from "./NavShell";
import { getJSON, type Tenant } from "@/lib/api";

const NAV = [
  { href: "/app", label: "Shortages" },
  { href: "/app/memory", label: "Memory" },
  { href: "/app/sources", label: "Sources" },
];

export function AppHeader() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [tenants, setTenants] = useState<Tenant[] | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const current = params.get("h") ?? "mercy";

  useEffect(() => {
    const ctl = new AbortController();
    getJSON<Tenant[]>("/api/tenants", ctl.signal)
      .then((t) => {
        setTenants(t);
        setError(false);
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(true);
      });
    return () => ctl.abort();
  }, [attempt]);

  function choose(id: string) {
    // a trace belongs to one hospital's formulary, so switching hospital goes to that hospital's list
    if (pathname.startsWith("/app/trace")) return router.push(`/app?h=${id}`);
    const next = new URLSearchParams(params);
    next.set("h", id);
    router.push(`${pathname}?${next.toString()}`);
  }

  const active = (href: string) =>
    href === "/app" ? pathname === "/app" || pathname.startsWith("/app/trace") : pathname.startsWith(href);

  return (
    <NavShell
      items={NAV.map((n) => ({
        key: n.href,
        label: n.label,
        active: active(n.href),
        node: (cls) => (
          <Link href={`${n.href}?h=${current}`} className={cls} aria-current={active(n.href) ? "page" : undefined}>
            {n.label}
          </Link>
        ),
      }))}
      right={
        <>
          <span className="label hidden lg:inline">Synthetic hospital</span>
          {error ? (
            <span className="text-[14px] text-ink-2">
              Can&rsquo;t load hospitals.{" "}
              <button className="link py-1.5 text-ink" onClick={() => setAttempt((a) => a + 1)}>
                Try again
              </button>
            </span>
          ) : tenants === null ? (
            <span className="label">Loading</span>
          ) : (
            <label className="relative min-w-0">
              <span className="sr-only">Hospital</span>
              <select
                value={current}
                onChange={(e) => choose(e.target.value)}
                className="w-full max-w-[210px] appearance-none truncate rounded-full border-[1.5px] border-line bg-canvas py-2.5 pl-4 pr-9 text-[15px] hover:border-clay focus:border-clay focus:outline-none md:max-w-none"
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
        </>
      }
    />
  );
}
