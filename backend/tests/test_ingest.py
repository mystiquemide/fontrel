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
