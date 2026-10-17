"""Checks against the live supply graph. Run `python -m ingest.run` first."""
from fontrel import graph
from ingest.openfda import matches, product_ndc_from_package


def q(cypher, params=None):
    return graph.supply().query(cypher, params or {}).result_set


def test_product_ndc_from_package():
    assert product_ndc_from_package("0054-0374-25") == "0054-0374"


def test_matches_curated_terms():
    assert matches(["Bupivacaine Hydrochloride"], ["BUPIVACAINE", "LIDOCAINE"]) == ["BUPIVACAINE"]
    assert matches(["WATER"], ["BUPIVACAINE"]) == []


def test_supply_graph_populated():
    counts = dict(q("MATCH (n) RETURN labels(n)[0], count(*)"))
    assert counts.get("Product", 0) > 1000
    assert counts.get("Shortage", 0) > 100
    assert counts.get("Ingredient", 0) > 20


def test_shortages_link_to_real_products():
    linked, total = q("MATCH (s:Shortage) OPTIONAL MATCH (s)-[:AFFECTS]->(p:Product) RETURN count(p), count(s)")[0]
    assert linked / total > 0.9


def test_ingest_metadata():
    runs = dict(q("MATCH (m:IngestRun) RETURN m.source, m.at"))
    assert {"openfda_ndc", "openfda_shortages"} <= runs.keys()
    assert all(at.startswith("20") for at in runs.values())


def test_shortage_ids_unique():
    dupes = q("MATCH (s:Shortage) WITH s.id AS id, count(*) AS c WHERE c > 1 RETURN count(id)")[0][0]
    assert dupes == 0


def test_word_match_is_whole_word():
    from ingest.openfda import word_match
    assert word_match("EPINEPHRINE", "EPINEPHRINE BITARTRATE")
    assert not word_match("EPINEPHRINE", "NOREPINEPHRINE BITARTRATE")


def test_reload_removes_facts_the_source_dropped():
    from fontrel import graph
    from ingest import load
    g = graph.client().select_graph("test_reconcile")
    try:
        g.delete()
    except Exception:
        pass

    def product(ndc, ings, labeler="Co"):
        return {"product_ndc": ndc, "generic_name": ndc, "brand_name": "", "dosage_form": "INJECTION", "route": "IV",
                "application_number": "", "spl_set_id": "", "labeler": labeler, "terms": [],
                "ingredients": [{"name": n, "strength": "1 mg/mL"} for n in ings]}
    site = lambda ndc, duns: {"product_ndc": ndc, "duns": duns, "name": duns, "country": "", "operation": "MANUFACTURE", "setid": "s"}

    load.load_products(g, [product("A", ["X"]), product("B", ["Y"])])
    load.load_made_at(g, [site("A", "111"), site("B", "222")], ["A", "B"])
    # second load: A changed ingredient and lost its plant, B left the source
    load.load_products(g, [product("A", ["Z"], labeler="NewCo")])
    load.load_made_at(g, [], ["A"])
    q = lambda c: g.query(c).result_set
    assert q("MATCH (p:Product) RETURN collect(p.product_ndc)") == [[["A"]]]
    assert q("MATCH (:Product {product_ndc:'A'})-[:CONTAINS]->(i) RETURN collect(i.name)") == [[["Z"]]]
    assert q("MATCH (:Product {product_ndc:'A'})-[:LABELED_BY]->(l) RETURN collect(l.name)") == [[["NewCo"]]]
    assert q("MATCH (:Product)-[m:MADE_AT|MANUFACTURED_AT]->() RETURN count(m)") == [[0]]
    assert q("MATCH (s:Site) RETURN count(s)") == [[0]]
    g.delete()
