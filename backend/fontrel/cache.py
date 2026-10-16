"""Saved traces, stored in the tenant's own graph.

A trace is replayed only when it was a full (non-degraded) run on the same model and the
hospital's memory has not changed since. Any new decision changes the memory version, so the
next trace runs fresh and can cite that decision."""
import hashlib
import json
from datetime import datetime, timezone

from . import graph


def memory_version(tenant_id: str) -> str:
    row = graph.tenant(tenant_id).query(
        "MATCH (d:Decision) RETURN count(d), max(d.at), collect(d.action)").result_set[0]
    return hashlib.sha1(json.dumps(row, default=str).encode()).hexdigest()[:12]


def _key(shortage_id: str, model: str) -> str:
    return "trace-" + hashlib.sha1(f"{shortage_id}|{model}".encode()).hexdigest()[:16]


def get(tenant_id: str, shortage_id: str, model: str) -> dict | None:
    rows = graph.tenant(tenant_id).query(
        "MATCH (t:Trace {id: $id}) RETURN t.payload, t.created, t.memory_version",
        {"id": _key(shortage_id, model)}).result_set
    if not rows or rows[0][2] != memory_version(tenant_id):
        return None
    out = json.loads(rows[0][0])
    out["replayed"], out["cached_at"] = True, rows[0][1]
    return out


def put(tenant_id: str, trace: dict) -> None:
    if trace.get("degraded"):
        return  # never cache a fallback answer
    graph.tenant(tenant_id).query("""
        MERGE (t:Trace {id: $id})
        SET t.shortage_id = $sid, t.model = $model, t.created = $created,
            t.memory_version = $mv, t.payload = $payload""", {
        "id": _key(trace["shortage_id"], trace["model"]), "sid": trace["shortage_id"],
        "model": trace["model"], "created": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "mv": memory_version(tenant_id), "payload": json.dumps(trace, default=str)})
