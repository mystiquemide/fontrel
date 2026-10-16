"""Graph tools against the live supply and tenant graphs."""
import ast
import re
from pathlib import Path

from fontrel import tools

ANCHOR_NDC = "55150-249"  # Eugia bupivacaine, current shortage, seeded in Mercy memory


def anchor_shortage():
    rows = tools.list_formulary_shortages("mercy").rows
    return next(r["shortage_id"] for r in rows if r["product_ndc"] == ANCHOR_NDC)


def test_every_tool_reports_its_cypher():
    sid = anchor_shortage()
    for result in [tools.get_shortage(sid), tools.find_site_exposure("mercy", sid),
                   tools.find_substitutes("mercy", sid), tools.recall_memory("mercy", sid)]:
        assert result.queries and all(q["cypher"].strip() for q in result.queries)
        assert result.ms < 2000


def test_q1_site_exposure_finds_hidden_cascade():
    rows = tools.find_site_exposure("mercy", anchor_shortage()).rows
    hidden = [r for r in rows if r["labeler"] != "Eugia US LLC" and not r["already_in_shortage"]]
    assert hidden, "expected exposed products from other labelers with no shortage notice"
    assert all(r["exposed_label_setid"] and r["shortage_label_setid"] for r in rows)


def test_q3_three_states_and_ordering():
    rows = tools.find_substitutes("mercy", anchor_shortage()).rows
    statuses = [r["status"] for r in rows]
    assert set(statuses) <= {"independent", "unknown", "shares_site"}
    assert "independent" in statuses
    order = {"independent": 0, "unknown": 1, "shares_site": 2}
    assert [order[s] for s in statuses] == sorted(order[s] for s in statuses)
    for r in rows:
        if r["status"] == "independent":
            assert r["own_sites"] and not r["shared_sites"]
        if r["status"] == "unknown":
            assert not r["own_sites"]


def test_q4_pagerank_ranks_sites():
    rows = tools.rank_source_concentration(5).rows
    assert len(rows) == 5 and rows[0]["pagerank"] >= rows[-1]["pagerank"]
    assert all(r["products"] > 0 for r in rows)


def test_q5_clusters_touch_formulary():
    rows = tools.exposure_clusters("mercy").rows
    assert rows and all(r["formulary_count"] > 0 and r["site_count"] > 1 for r in rows)


def test_q6_memory_recall_and_isolation():
    sid = anchor_shortage()
    mercy = tools.recall_memory("mercy", sid).rows
    assert any(r["action"] == "approved" and r["outcome"] == "held" for r in mercy)
    assert tools.recall_memory("lakeside", sid).rows == []


def test_unknown_shortage_returns_note():
    r = tools.get_shortage("does-not-exist")
    assert r.rows == [] and r.note == "unknown shortage id"


def _cypher_strings():
    tree = ast.parse(Path(tools.__file__).read_text())
    for node in ast.walk(tree):
        if isinstance(node, ast.Call) and getattr(node.func, "attr", "") in ("q", "query"):
            arg = node.args[1] if node.func.attr == "q" else node.args[0]
            if isinstance(arg, ast.Name) and arg.id == "cypher":
                continue  # the helper that forwards an already-checked literal
            yield arg


def test_params_only():
    """No f-strings, concatenation or .format() building Cypher in the tools."""
    for arg in _cypher_strings():
        assert isinstance(arg, ast.Constant) and isinstance(arg.value, str), ast.unparse(arg)


def test_llm_tools_read_only():
    writes = re.compile(r"\b(CREATE|MERGE|SET|DELETE|REMOVE|DROP)\b", re.I)
    for arg in _cypher_strings():
        assert not writes.search(arg.value), arg.value[:80]
    assert set(tools.READ_TOOLS) == {
        "list_formulary_shortages", "get_shortage", "find_site_exposure", "find_ingredient_exposure",
        "find_substitutes", "rank_source_concentration", "exposure_clusters", "recall_memory"}


def test_q3_unknown_when_shortage_product_has_no_plant(monkeypatch):
    from fontrel import tools
    real_q = tools._Run.q

    def fake_q(self, g, cypher, params):
        if "count(DISTINCT site) AS source_sites" in cypher:
            self.queries.append({"graph": "supply", "cypher": cypher, "params": params})
            return [{"source_sites": 0}]
        return real_q(self, g, cypher, params)
    monkeypatch.setattr(tools._Run, "q", fake_q)
    rows = tools.find_substitutes("mercy", anchor_shortage()).rows
    assert rows and all(r["status"] != "independent" for r in rows)

