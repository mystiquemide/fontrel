"""Synthetic tenants: isolation, seeded memory, and a real cascade in Mercy's formulary."""
from fontrel import graph


def tq(tenant, cypher, params=None):
    return graph.tenant(tenant).query(cypher, params or {}).result_set


def formulary(tenant):
    return [r[0] for r in tq(tenant, "MATCH (f:FormularyItem) RETURN f.product_ndc")]


def test_two_tenants_listed():
    assert {"mercy", "lakeside"} <= set(graph.list_tenants())


def test_tenant_isolation():
    # Mercy's memory exists only in Mercy's graph, and tenant graphs hold no supply data
    assert tq("mercy", "MATCH (d:Decision) RETURN count(d)")[0][0] == 3
    assert tq("lakeside", "MATCH (d:Decision) RETURN count(d)")[0][0] == 0
    assert tq("lakeside", "MATCH (h:Hospital) RETURN collect(h.id)")[0][0] == ["lakeside"]
    for t in ("mercy", "lakeside"):
        assert tq(t, "MATCH (n:Product) RETURN count(n)")[0][0] == 0


def test_decisions_point_at_formulary_items():
    rows = tq("mercy", "MATCH (d:Decision)-[:CHOSE]->(f:FormularyItem) RETURN count(d)")
    assert rows[0][0] == 3


def test_mercy_has_hidden_site_cascade():
    """A Mercy product in shortage shares a manufacturing site with a Mercy product that is not."""
    rows = graph.supply().query("""
        MATCH (:Shortage)-[:AFFECTS]->(p:Product)-[:MADE_AT {operation:'MANUFACTURE'}]->(s:Site)
              <-[:MADE_AT {operation:'MANUFACTURE'}]-(o:Product)
        WHERE p.product_ndc IN $f AND o.product_ndc IN $f AND o.labeler <> p.labeler
          AND NOT (o)<-[:AFFECTS]-(:Shortage)
        RETURN DISTINCT s.name, o.labeler""", {"f": formulary("mercy")}).result_set
    assert rows, "expected at least one exposed product with no shortage notice"


def test_synthetic_flags():
    assert tq("mercy", "MATCH (n) WHERE n:Episode OR n:Decision OR n:Hospital RETURN collect(DISTINCT n.synthetic)")[0][0] == [True]
