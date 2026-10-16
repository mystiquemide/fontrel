"""HTTP API. LLM calls are forced to fail so these tests cost no quota and exercise degraded mode."""
import json

import pytest
from fastapi.testclient import TestClient

from fontrel import agent, api, graph
from fontrel.llm import LLMUnavailable

c = TestClient(api.app)
ANCHOR_NDC = "55150-249"


def anchor():
    return next(r["shortage_id"] for r in c.get("/api/shortages?tenant=mercy").json() if r["product_ndc"] == ANCHOR_NDC)


@pytest.fixture
def no_llm(monkeypatch):
    def down(*a, **k):
        raise LLMUnavailable("test: model offline")
    monkeypatch.setattr(agent, "chat", down)


@pytest.fixture
def cleanup():
    created = []
    yield created
    g = graph.tenant("mercy")
    for dec_id, ep_id in created:
        g.query("MATCH (d:Decision {id: $d}) DETACH DELETE d", {"d": dec_id})
        g.query("MATCH (e:Episode {id: $e}) WHERE NOT (e)<-[:IN]-() DETACH DELETE e", {"e": ep_id})
    g.query("MATCH (f:FormularyItem {added_by_decision: true}) WHERE NOT (f)<-[:CHOSE]-() DETACH DELETE f")


def test_health_ok():
    r = c.get("/api/health").json()
    assert r["ok"] and r["falkordb"] and r["counts"]["Product"] > 1000
    assert {"mercy", "lakeside"} <= set(r["tenants"])


def test_health_reports_db_down(monkeypatch):
    monkeypatch.setattr(api.graph, "ping", lambda: False)
    r = c.get("/api/health")
    assert r.status_code == 503 and r.json()["falkordb"] is False


def test_tenants_and_shortages():
    ids = {t["id"]: t for t in c.get("/api/tenants").json()}
    assert ids["mercy"]["formulary_items"] >= 150
    assert len(c.get("/api/shortages?tenant=mercy").json()) > 10
    assert c.get("/api/shortages?tenant=nobody").status_code == 404


def test_unknown_shortage_404():
    assert c.post("/api/trace", json={"tenant": "mercy", "shortage_id": "nope"}).status_code == 404
    assert c.get("/api/graph/subgraph", params={"tenant": "mercy", "shortage_id": "nope"}).status_code == 404


def test_trace_streams_steps_then_answer(no_llm):
    r = c.post("/api/trace", json={"tenant": "mercy", "shortage_id": anchor()})
    events = [(b.split("\n")[0][7:], json.loads(b.split("\n")[1][6:]))
              for b in r.text.strip().split("\n\n")]
    kinds = [k for k, _ in events]
    assert kinds[-1] == "answer" and kinds.count("step") >= 4
    final = events[-1][1]
    assert final["degraded"] and final["answer"]["substitutes"]
    step = events[0][1]
    assert step["queries"][0]["cypher"] and "ms" in step


def test_subgraph_is_small_and_connected():
    g = c.get("/api/graph/subgraph", params={"tenant": "mercy", "shortage_id": anchor()}).json()
    assert 3 <= len(g["nodes"]) <= 25
    ids = {n["id"] for n in g["nodes"]}
    assert all(e["source"] in ids and e["target"] in ids for e in g["edges"])
    assert any(n.get("role") == "exposed" and n["labeler"] != "Eugia US LLC" for n in g["nodes"])


def _sub():
    return c.get("/api/graph/subgraph", params={"tenant": "mercy", "shortage_id": anchor()}).json()


def test_decision_idempotent(cleanup):
    sid = anchor()
    sub = next(n["id"] for n in _sub()["nodes"] if n.get("role") == "substitute")
    body = {"tenant": "mercy", "shortage_id": sid, "substitute_ndc": sub, "action": "approved", "reason": "test"}
    first = c.post("/api/decisions", json=body).json()
    cleanup.append((first["decision"], first["episode"]))
    second = c.post("/api/decisions", json={**body, "action": "rejected"}).json()
    assert first["decision"] == second["decision"]
    rows = graph.tenant("mercy").query("MATCH (d:Decision {id: $d}) RETURN count(d), collect(d.action)",
                                       {"d": first["decision"]}).result_set
    assert rows == [[1, ["rejected"]]]
    assert graph.tenant("lakeside").query("MATCH (d:Decision {id: $d}) RETURN count(d)",
                                          {"d": first["decision"]}).result_set == [[0]]


def test_decision_rejects_non_equivalent():
    r = c.post("/api/decisions", json={"tenant": "mercy", "shortage_id": anchor(), "substitute_ndc": "0000-0000",
                                       "action": "approved"})
    assert r.status_code == 422


def test_memory_lists_seeded_episodes():
    eps = c.get("/api/memory?tenant=mercy").json()
    assert {"ep-2026-04-ropi", "ep-2026-07-bupi"} <= {e["episode"] for e in eps}
    assert c.get("/api/memory?tenant=lakeside").json() == []
