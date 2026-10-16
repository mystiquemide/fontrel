export type Tenant = { id: string; name: string; formulary_items: number };

export type Shortage = {
  shortage_id: string;
  shortage: string;
  company: string;
  availability: string;
  reason: string;
  updated: string;
  product_ndc: string;
  product: string;
  labeler: string;
};

export async function getJSON<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(path, { signal });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

export type Step = {
  n: number;
  tool: string;
  rows: number;
  ms: number;
  queries: { graph: string; cypher: string; params: Record<string, unknown> }[];
  note: string;
  data: Record<string, unknown>[];
};

export type TraceAnswer = {
  tenant: string;
  shortage_id: string;
  model: string;
  degraded: boolean;
  degraded_reason?: string;
  answer: Record<string, unknown>;
  elapsed_s: number;
  replayed?: boolean;
  cached_at?: string;
};

export type TraceEvent =
  | { kind: "step"; data: Step }
  | { kind: "answer"; data: TraceAnswer }
  | { kind: "error"; data: { error: string } };

export async function streamTrace(
  body: { tenant: string; shortage_id: string; fresh?: boolean },
  onEvent: (e: TraceEvent) => void,
  signal: AbortSignal,
) {
  const res = await fetch("/api/trace", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) throw new Error(`${res.status}`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const block = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const kind = block.match(/^event: (\w+)/m)?.[1];
      const data = block.match(/^data: (.*)$/m)?.[1];
      if (kind && data) onEvent({ kind, data: JSON.parse(data) } as TraceEvent);
    }
  }
}

export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatDate(mdy: string) {
  const [m, d, y] = mdy.split("/").map(Number);
  return m && d && y ? `${MONTHS[m - 1]} ${d}, ${y}` : mdy;
}

export function traceHref(shortageId: string, h: string) {
  return `/app/trace/${encodeURIComponent(shortageId)}?h=${h}`;
}

export type ExposedRow = {
  product_ndc: string;
  product: string;
  labeler: string;
  via_site: string;
  exposed_label_setid: string;
  already_in_shortage: boolean;
};

export function sortExposed(rows: ExposedRow[], shortageLabeler?: string) {
  const unique = [...new Map(rows.map((r) => [r.product_ndc, r])).values()];
  return unique.sort(
    (a, b) =>
      Number(a.labeler === shortageLabeler) - Number(b.labeler === shortageLabeler) ||
      Number(a.already_in_shortage) - Number(b.already_in_shortage) ||
      a.labeler.localeCompare(b.labeler) ||
      a.product.localeCompare(b.product),
  );
}
