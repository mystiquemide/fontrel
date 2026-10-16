"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { getJSON, type Shortage, type Tenant } from "@/lib/api";

type Result =
  | { kind: "error"; message: string }
  | { kind: "ready"; tenant: Tenant; shortages: Shortage[] };
type State = Result | { kind: "loading" };

export function InboxTop() {
  const h = useSearchParams().get("h") ?? "mercy";
  const [attempt, setAttempt] = useState(0);
  const key = `${h}:${attempt}`;
  const [result, setResult] = useState<{ key: string; value: Result } | null>(null);
  const state: State = result?.key === key ? result.value : { kind: "loading" };

  useEffect(() => {
    const ctl = new AbortController();
    Promise.all([
      getJSON<Tenant[]>("/api/tenants", ctl.signal),
      getJSON<Shortage[]>(`/api/shortages?tenant=${encodeURIComponent(h)}`, ctl.signal),
    ])
      .then(([tenants, shortages]) => {
        const tenant = tenants.find((t) => t.id === h);
        setResult({
          key,
          value: tenant
            ? { kind: "ready", tenant, shortages }
            : { kind: "error", message: "This hospital is not on file." },
        });
      })
      .catch((e) => {
        if (e.name !== "AbortError")
          setResult({ key, value: { kind: "error", message: "The shortage service did not answer." } });
      });
    return () => ctl.abort();
  }, [h, key]);

  return (
    <section className="wrap py-[clamp(48px,7vw,96px)]">
      {state.kind === "loading" && <p className="label">Loading shortages</p>}
      {state.kind === "error" && (
        <div className="rounded-[20px] bg-panel p-8">
          <p className="text-ink-2">{state.message}</p>
          <button
            onClick={() => setAttempt((a) => a + 1)}
            className="mt-4 rounded-full bg-clay px-6 py-3.5 font-medium text-canvas hover:bg-ink"
          >
            Try again
          </button>
        </div>
      )}
      {state.kind === "ready" && (
        <>
          <p className="label">Synthetic hospital · {state.tenant.formulary_items} formulary items</p>
          <h1 className="h1 mt-4">
            {state.tenant.name} has{" "}
            <span className="em">
              {state.shortages.length} {state.shortages.length === 1 ? "drug" : "drugs"}
            </span>{" "}
            in shortage.
          </h1>
        </>
      )}
    </section>
  );
}
