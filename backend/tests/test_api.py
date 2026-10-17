"""HTTP API. LLM calls are forced to fail so these tests cost no quota and exercise degraded mode."""
import json

import pytest
from fastapi.testclient import TestClient

from fontrel import agent, api, graph
from fontrel.llm import LLMUnavailable

c = TestClient(api.app)
ANCHOR_NDC = "55150-172"


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
    r = c.post("/api/trace", json={"tenant": "mercy", "shortage_id": anchor(), "fresh": True})
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


def _events(resp):
    return [(b.split("\n")[0][7:], json.loads(b.split("\n")[1][6:])) for b in resp.text.strip().split("\n\n")]


def test_replay_flagged(monkeypatch, cleanup):
    from fontrel import cache
    sid = anchor()
    g = graph.tenant("mercy")
    g.query("MATCH (t:Trace) DETACH DELETE t")
    calls = []

    def fake_run(tenant, shortage_id, model, on_step=None):
        calls.append(1)
        step = {"n": 1, "tool": "get_shortage", "rows": 1, "ms": 1.0, "queries": [], "data": []}
        if on_step:
            on_step(step)
        return {"tenant": tenant, "shortage_id": shortage_id, "model": model, "degraded": False,
                "degraded_reason": None, "dropped_ndcs": [], "steps": [step], "complete": True,
                "answer": {"summary": "s", "exposed": [], "substitutes": [], "memory": []}, "elapsed_s": 0.1}
    monkeypatch.setattr(agent, "run_trace", fake_run)
    body = {"tenant": "mercy", "shortage_id": sid}

    first = _events(c.post("/api/trace", json=body))[-1][1]
    second = _events(c.post("/api/trace", json=body))[-1][1]
    assert first["replayed"] is False and second["replayed"] is True and second["cached_at"]
    assert len(calls) == 1

    # a new decision changes memory, so the next trace must run fresh
    sub = next(n["id"] for n in _sub()["nodes"] if n.get("role") == "substitute")
    d = c.post("/api/decisions", json={**body, "substitute_ndc": sub, "action": "approved"}).json()
    cleanup.append((d["decision"], d["episode"]))
    third = _events(c.post("/api/trace", json=body))[-1][1]
    assert third["replayed"] is False and len(calls) == 2

    fresh = _events(c.post("/api/trace", json={**body, "fresh": True}))[-1][1]
    assert fresh["replayed"] is False and len(calls) == 3
    g.query("MATCH (t:Trace) DETACH DELETE t")


def test_degraded_trace_not_cached(no_llm):
    graph.tenant("mercy").query("MATCH (t:Trace) DETACH DELETE t")
    c.post("/api/trace", json={"tenant": "mercy", "shortage_id": anchor()})
    assert graph.tenant("mercy").query("MATCH (t:Trace) RETURN count(t)").result_set == [[0]]


def test_ingredients_summary():
    d = c.get("/api/ingredients").json()
    assert d["count"] >= 30
    rows = d["ingredients"]
    assert all(r["products"] > 0 for r in rows)
    assert [r["shortages"] for r in rows] == sorted((r["shortages"] for r in rows), reverse=True)
    assert any(r["candidate_suppliers"] > 0 for r in rows)


def test_sources_ranked_and_clustered():
    d = c.get("/api/sources?tenant=mercy").json()
    assert len(d["plants"]) == 10 and d["plants"][0]["pagerank"] >= d["plants"][-1]["pagerank"]
    assert d["clusters"] and d["queries"]
    assert c.get("/api/sources?tenant=nobody").status_code == 404


def test_anchor_is_current_and_cross_company():
    a = c.get("/api/anchor?tenant=mercy").json()
    assert a["product_ndc"] == ANCHOR_NDC and a["cross_company_exposed"] > 0
    current = {r["shortage_id"] for r in c.get("/api/shortages?tenant=mercy").json()}
    assert a["shortage_id"] in current


def test_recall_shows_new_decision_in_current_episode(cleanup):
    sid = anchor()
    before = c.get("/api/recall", params={"tenant": "mercy", "shortage_id": sid}).json()
    sub = next(n["id"] for n in _sub()["nodes"] if n.get("role") == "substitute")
    made = c.post("/api/decisions", json={"tenant": "mercy", "shortage_id": sid, "substitute_ndc": sub,
                                          "action": "approved", "by": "Test Pharmacist"}).json()
    cleanup.append((made["decision"], made["episode"]))
    after = c.get("/api/recall", params={"tenant": "mercy", "shortage_id": sid}).json()
    assert after["episode"] == made["episode"] == before["episode"]
    new = [r for r in after["rows"] if r["decision"] == made["decision"]]
    assert len(after["rows"]) == len(before["rows"]) + 1
    assert new and new[0]["by"] == "Test Pharmacist" and new[0]["episode"] == made["episode"]


def test_subgraph_marks_exposed_shortage_status():
    exposed = [n for n in _sub()["nodes"] if n.get("role") == "exposed"]
    assert exposed and all(isinstance(n["in_shortage"], bool) for n in exposed)
    assert any(not n["in_shortage"] and n["labeler"] != "Eugia US LLC" for n in exposed)


def test_incomplete_trace_not_cached_and_reload_invalidates(monkeypatch):
    from fontrel import cache
    sid = anchor()
    g = graph.tenant("mercy")
    g.query("MATCH (t:Trace) DETACH DELETE t")
    base = {"tenant": "mercy", "shortage_id": sid, "model": "m", "degraded": False, "steps": [],
            "answer": {}, "elapsed_s": 0.1}
    cache.put("mercy", {**base, "complete": False})
    assert cache.get("mercy", sid, "m") is None
    cache.put("mercy", {**base, "complete": True})
    assert cache.get("mercy", sid, "m") is not None
    # a data reload changes the supply version, so the saved trace is not replayed
    monkeypatch.setattr(cache, "supply_version", lambda: "reloaded")
    assert cache.get("mercy", sid, "m") is None
    g.query("MATCH (t:Trace) DETACH DELETE t")


def test_second_fresh_trace_for_same_shortage_is_refused(monkeypatch):
    import threading
    from fontrel import api
    sid = anchor()
    gate = threading.Event()

    def slow_run(tenant, shortage_id, model, on_step=None):
        gate.wait(5)
        return {"tenant": tenant, "shortage_id": shortage_id, "model": model, "degraded": True, "steps": [],
                "answer": {}, "elapsed_s": 0}
    monkeypatch.setattr(agent, "run_trace", slow_run)
    api._running.add(("mercy", sid))
    try:
        ev = _events(c.post("/api/trace", json={"tenant": "mercy", "shortage_id": sid, "fresh": True}))
        assert ev[-1][0] == "error" and ev[-1][1]["error"] == "busy"
    finally:
        api._running.discard(("mercy", sid))
        gate.set()


def test_rejecting_a_candidate_moves_it_down_next_time(cleanup):
    from fontrel import tools
    sid = anchor()
    before = tools.find_substitutes("mercy", sid).rows
    top = before[0]
    # peers the hospital already rejected sort among themselves, so compare against the rest
    peers = [r["product_ndc"] for r in before if r["status"] == top["status"] and r["product_ndc"] != top["product_ndc"]
             and not (r["prior_decision"] and r["prior_decision"]["action"] == "rejected")]
    assert peers, "needs a second candidate with the same status"
    d = c.post("/api/decisions", json={"tenant": "mercy", "shortage_id": sid, "substitute_ndc": top["product_ndc"],
                                       "action": "rejected", "reason": "test"}).json()
    cleanup.append((d["decision"], d["episode"]))
    after = [r["product_ndc"] for r in tools.find_substitutes("mercy", sid).rows]
    assert after.index(top["product_ndc"]) > max(after.index(p) for p in peers)
    row = next(r for r in tools.find_substitutes("mercy", sid).rows if r["product_ndc"] == top["product_ndc"])
    assert row["prior_decision"]["action"] == "rejected"


def test_demo_reset_keeps_seed_and_restores_memory_version():
    from fontrel import cache
    from ingest import reset_demo
    before = cache.memory_version("mercy")
    sid = anchor()
    sub = next(r["id"] for r in c.get(f"/api/graph/subgraph?tenant=mercy&shortage_id={sid}").json()["nodes"]
               if r.get("role") == "substitute")
    c.post("/api/decisions", json={"tenant": "mercy", "shortage_id": sid, "substitute_ndc": sub, "action": "rejected"})
    assert cache.memory_version("mercy") != before
    assert reset_demo.reset("mercy") == 1
    assert cache.memory_version("mercy") == before
    assert len(c.get("/api/memory?tenant=mercy").json()) == 2
