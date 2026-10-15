"""Day-1 gate: real shared manufacturing sites from DailyMed SPL establishment data."""
from pathlib import Path

from fontrel import graph
from ingest.dailymed import parse_establishments


def q(cypher, params=None):
    return graph.supply().query(cypher, params or {}).result_set


SAMPLE = """<document xmlns="urn:hl7-org:v3"><author><assignedEntity><representedOrganization>
<name>Labeler Inc.</name><assignedEntity><assignedOrganization><assignedEntity>
<assignedOrganization><id extension="123456789" root="1.3.6.1.4.1.519.1"/><name>Plant A</name></assignedOrganization>
<performance><actDefinition><code code="C43360" displayName="MANUFACTURE"/><product><manufacturedProduct>
<manufacturedMaterialKind><code code="1111-2222"/></manufacturedMaterialKind></manufacturedProduct></product>
</actDefinition></performance></assignedEntity></assignedOrganization></assignedEntity>
</representedOrganization></assignedEntity></author></document>"""


def test_parse_establishments():
    [e] = parse_establishments(SAMPLE)
    assert e["duns"] == "123456789" and e["name"] == "Plant A"
    assert e["operations"] == [{"operation": "MANUFACTURE", "ndcs": ["1111-2222"]}]


def test_made_at_has_setid():
    missing = q("MATCH ()-[m:MADE_AT]->() WHERE m.setid IS NULL OR m.setid = '' RETURN count(m)")[0][0]
    total = q("MATCH ()-[m:MADE_AT]->() RETURN count(m)")[0][0]
    assert total > 1000 and missing == 0


def test_gate_shortage_shares_site_across_labelers():
    rows = q("""
    MATCH (:Shortage)-[:AFFECTS]->(p:Product)-[:MADE_AT {operation:'MANUFACTURE'}]->(s:Site)
          <-[:MADE_AT {operation:'MANUFACTURE'}]-(o:Product)
    WHERE o.labeler <> p.labeler
    RETURN count(DISTINCT s)""")
    assert rows[0][0] >= 3


def test_known_case_hikma_portugal_cefazolin():
    labelers = {r[0] for r in q("""
    MATCH (p:Product)-[:MADE_AT]->(s:Site)
    WHERE toUpper(p.generic_name) CONTAINS 'CEFAZOLIN' AND toUpper(s.name) STARTS WITH 'HIKMA FARMACEUTICA'
    RETURN DISTINCT p.labeler""")}
    assert {"Civica, Inc.", "Hikma Pharmaceuticals USA Inc."} <= labelers
