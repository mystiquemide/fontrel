"""HTTP API. Run: uvicorn fontrel.api:app --port 8000"""
import hashlib
import json
import queue
import threading
from datetime import datetime, timezone
from typing import Literal

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field

from . import agent, graph, tools
from .config import settings

app = FastAPI(title="Fontrel", version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["GET", "POST"], allow_headers=["*"])


def _tenant(tenant_id: str) -> str:
    try:
        known = graph.list_tenants()
    except Exception:
        raise HTTPException(503, "graph database unavailable")
    if tenant_id not in known:
        raise HTTPException(404, f"unknown tenant: {tenant_id}")
    return tenant_id


def _shortage(tenant_id: str, shortage_id: str) -> str:
    if not any(r["shortage_id"] == shortage_id for r in tools.list_formulary_shortages(tenant_id).rows):
        raise HTTPException(404, "shortage not found on this hospital's formulary")
    return shortage_id


@app.get("/api/health")
def health():
    if not graph.ping():
        return JSONResponse({"ok": False, "falkordb": False, "llm_configured": bool(settings.llm_api_key)},
                            status_code=503)
    g = graph.supply()
    counts = dict(g.query("MATCH (n) RETURN labels(n)[0], count(*)").result_set)
    runs = [{"source": r[0], "records": r[1], "at": r[2]} for r in
            g.query("MATCH (m:IngestRun) RETURN m.source, m.records, m.at ORDER BY m.source").result_set]
    return {"ok": True, "falkordb": True, "llm_configured": bool(settings.llm_api_key),
            "model": settings.llm_model, "counts": counts, "ingest": runs, "tenants": graph.list_tenants()}


@app.get("/api/tenants")
def tenants():
    out = []
    for t in graph.list_tenants():
        row = graph.tenant(t).query(
            "MATCH (h:Hospital) OPTIONAL MATCH (h)-[:STOCKS]->(f) RETURN h.name, count(f)").result_set
        out.append({"id": t, "name": row[0][0] if row else t, "formulary_items": row[0][1] if row else 0})
    return out


@app.get("/api/shortages")
def shortages(tenant: str = Query(...)):
    return tools.list_formulary_shortages(_tenant(tenant)).rows


class TraceRequest(BaseModel):
    tenant: str
    shortage_id: str
    fast: bool = False


@app.post("/api/trace")
def trace(req: TraceRequest):
    """Server-sent events: one `step` event per tool call, then one `answer` event."""
    tenant = _tenant(req.tenant)
    sid = _shortage(tenant, req.shortage_id)
    model = settings.llm_model_fast if req.fast else settings.llm_model
    events: queue.Queue = queue.Queue()

    def work():
        try:
            out = agent.run_trace(tenant, sid, model, on_step=lambda s: events.put(("step", s)))
            events.put(("answer", {k: v for k, v in out.items() if k != "steps"}))
        except Exception as e:  # graph down mid-trace and similar
            events.put(("error", {"error": f"{type(e).__name__}: {e}"}))
        events.put(None)

    threading.Thread(target=work, daemon=True).start()

    def stream():
        while (item := events.get()) is not None:
            kind, data = item
            yield f"event: {kind}\ndata: {json.dumps(data, default=str)}\n\n"

    return StreamingResponse(stream(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.get("/api/graph/subgraph")
def subgraph(tenant: str = Query(...), shortage_id: str = Query(...), limit: int = 25):
    """Small graph for the canvas: the shortage, its product, sites, exposed products, top substitutes."""
    tenant = _tenant(tenant)
    sid = _shortage(tenant, shortage_id)
    nodes, edges = {}, []

    def node(id_, label, kind, **extra):
        if id_ not in nodes and len(nodes) < limit:
            nodes[id_] = {"id": id_, "label": label, "kind": kind, **extra}
        return id_ in nodes

    def edge(a, b, rel, **extra):
        if a in nodes and b in nodes:
            edges.append({"source": a, "target": b, "type": rel, **extra})

    info = tools.get_shortage(sid).rows[0]
    node(sid, info["shortage"], "shortage")
    node(info["product_ndc"], info["product"], "product", labeler=info["labeler"], role="short")
    edge(sid, info["product_ndc"], "AFFECTS")
    for s in info["sites"]:
        node("site:" + s["duns"], s["site"], "site")
        edge(info["product_ndc"], "site:" + s["duns"], "MADE_AT", setid=s["setid"])
    for r in tools.find_substitutes(tenant, sid).rows[:5]:
        if node(r["product_ndc"], r["product"], "product", labeler=r["labeler"], role="substitute",
                status=r["status"]):
            edge(info["product_ndc"], r["product_ndc"], "EQUIVALENT_TO")
    for r in tools.find_site_exposure(tenant, sid).rows:
        if r["labeler"] == info["labeler"] and len(nodes) > limit // 2:
            continue  # keep room for other companies, they are the hidden risk
        if node(r["product_ndc"], r["product"], "product", labeler=r["labeler"], role="exposed"):
            edge(r["product_ndc"], "site:" + r["duns"], "MADE_AT", setid=r["exposed_label_setid"])
    return {"nodes": list(nodes.values()), "edges": edges}


class DecisionRequest(BaseModel):
    tenant: str
    shortage_id: str
    substitute_ndc: str
    action: Literal["approved", "rejected"]
    reason: str = Field("", max_length=500)
    by: str = Field("Pharmacist", max_length=80)


@app.post("/api/decisions")
def decide(req: DecisionRequest):
    """Human decision on a proposed substitute. The only write path into a tenant graph.
    Idempotent: the same shortage and substitute updates one Decision instead of adding another."""
    tenant = _tenant(req.tenant)
    sid = _shortage(tenant, req.shortage_id)
    info = tools.get_shortage(sid).rows[0]
    valid = {r["product_ndc"]: r for r in tools.find_substitutes(tenant, sid).rows}
    if req.substitute_ndc not in valid:
        raise HTTPException(422, "substitute is not an equivalent of the shortage product")
    sub = valid[req.substitute_ndc]
    ep_id = "ep-" + hashlib.sha1(sid.encode()).hexdigest()[:10]
    dec_id = f"dec-{ep_id[3:]}-{req.substitute_ndc}"
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    graph.tenant(tenant).query("""
        MATCH (f:FormularyItem {product_ndc: $product_ndc})
        MERGE (e:Episode {id: $ep_id})
        ON CREATE SET e.opened = $now, e.status = 'open'
        SET e.product_ndc = $product_ndc, e.shortage_id = $sid, e.shortage_label = $label
        MERGE (e)-[:FOR]->(f)
        MERGE (s:FormularyItem {product_ndc: $sub_ndc})
        ON CREATE SET s.generic_name = $sub_name, s.labeler = $sub_labeler, s.added_by_decision = true
        MERGE (d:Decision {id: $dec_id})
        SET d.substitute_ndc = $sub_ndc, d.action = $action, d.reason = $reason, d.by = $by, d.at = $now,
            d.status_at_decision = $status, d.synthetic = false
        MERGE (d)-[:IN]->(e)
        MERGE (d)-[:CHOSE]->(s)""", {
        "product_ndc": info["product_ndc"], "ep_id": ep_id, "now": now, "sid": sid,
        "label": f"{info['shortage']} ({info['company']})", "sub_ndc": req.substitute_ndc,
        "sub_name": sub["product"], "sub_labeler": sub["labeler"], "dec_id": dec_id, "action": req.action,
        "reason": req.reason, "by": req.by, "status": sub["status"]})
    return {"decision": dec_id, "episode": ep_id, "action": req.action, "substitute_ndc": req.substitute_ndc,
            "status_at_decision": sub["status"], "at": now}


@app.get("/api/memory")
def memory(tenant: str = Query(...)):
    rows = graph.tenant(_tenant(tenant)).query("""
        MATCH (e:Episode) OPTIONAL MATCH (d:Decision)-[:IN]->(e)
        OPTIONAL MATCH (d)-[:CHOSE]->(s:FormularyItem)
        RETURN e.id, e.shortage_label, e.opened, e.closed, e.status, coalesce(e.synthetic, false),
               collect(CASE WHEN d IS NULL THEN NULL ELSE {decision: d.id, action: d.action,
                   substitute_ndc: d.substitute_ndc, substitute: s.generic_name, labeler: s.labeler,
                   reason: d.reason, by: d.by, at: d.at, outcome: d.outcome, outcome_days: d.outcome_days} END)
        ORDER BY e.opened DESC""").result_set
    keys = ["episode", "label", "opened", "closed", "status", "synthetic", "decisions"]
    return [dict(zip(keys, r)) for r in rows]
