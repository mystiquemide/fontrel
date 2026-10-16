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
