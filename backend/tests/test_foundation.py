import pytest

from fontrel import graph
from fontrel.config import settings


def test_falkordb_ping():
    assert graph.ping(), "FalkorDB not reachable, run: docker compose up -d"


def test_cypher_roundtrip():
    g = graph.client().select_graph("fontrel_selftest")
    try:
        res = g.query("CREATE (n:Probe {v: $v}) RETURN n.v", {"v": 7})
        assert res.result_set == [[7]]
    finally:
        g.delete()


def test_tenant_id_validation():
    with pytest.raises(ValueError):
        graph.tenant("bad id; DROP")
    assert graph.tenant("mercy").name == settings.tenant_prefix + "mercy"


def test_llm_settings_present():
    assert settings.llm_base_url.startswith("https://")
    assert settings.llm_model and settings.llm_model_fast
