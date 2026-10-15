"""Cached HTTP fetches. Raw responses land under data/raw so reruns are offline."""
import hashlib
import json
import time
from pathlib import Path

import httpx

RAW = Path(__file__).resolve().parents[2] / "data" / "raw"
_client = httpx.Client(timeout=60, follow_redirects=True, headers={"User-Agent": "fontrel-ingest/0.1"})


def cached_get(url: str, *, kind: str, binary: bool = False, retries: int = 4):
    key = hashlib.sha1(url.encode()).hexdigest()[:16]
    path = RAW / kind / (key + (".bin" if binary else ".json" if url.find(".json") > 0 else ".txt"))
    if path.exists():
        data = path.read_bytes()
        return data if binary else (json.loads(data) if path.suffix == ".json" else data.decode())
    path.parent.mkdir(parents=True, exist_ok=True)
    for attempt in range(retries):
        r = _client.get(url)
        if r.status_code == 404:
            return None
        if r.status_code == 429 or r.status_code >= 500:
            time.sleep(2 ** attempt)
            continue
        r.raise_for_status()
        path.write_bytes(r.content)
        return r.content if binary else (r.json() if path.suffix == ".json" else r.text)
    r.raise_for_status()
