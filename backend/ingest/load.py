"""Write ingest rows into the supply graph. All writes are idempotent MERGEs."""
from datetime import datetime, timezone

from falkordb import Graph

BATCH = 500


def _batched(rows, n=BATCH):
    for i in range(0, len(rows), n):
        yield rows[i:i + n]


def ensure_indexes(g: Graph) -> None:
    for label, prop in [
        ("Product", "product_ndc"), ("Ingredient", "name"), ("Labeler", "name"),
        ("Shortage", "id"), ("Site", "name_norm"), ("Supplier", "name_norm"),
    ]:
        try:
            g.query(f"CREATE INDEX FOR (n:{label}) ON (n.{prop})")
        except Exception as e:  # index already exists
            if "already indexed" not in str(e).lower():
                raise


def load_products(g: Graph, rows: list[dict]) -> None:
    q = """
    UNWIND $rows AS r
    MERGE (p:Product {product_ndc: r.product_ndc})
    SET p.generic_name = r.generic_name, p.brand_name = r.brand_name,
        p.dosage_form = r.dosage_form, p.route = r.route,
        p.application_number = r.application_number, p.spl_set_id = r.spl_set_id,
        p.labeler = r.labeler, p.terms = r.terms
    MERGE (l:Labeler {name: r.labeler})
    MERGE (p)-[:LABELED_BY]->(l)
    WITH p, r
    UNWIND r.ingredients AS ing
    MERGE (i:Ingredient {name: ing.name})
    MERGE (p)-[c:CONTAINS]->(i)
    SET c.strength = ing.strength
    """
    for b in _batched(rows):
        g.query(q, {"rows": b})


def load_shortages(g: Graph, rows: list[dict]) -> int:
    """Create Shortage nodes. AFFECTS links only to products present in the graph."""
    q = """
    UNWIND $rows AS r
    MERGE (s:Shortage {id: r.id})
    SET s.package_ndc = r.package_ndc, s.generic_name = r.generic_name, s.company = r.company,
        s.status = r.status, s.reason = r.reason, s.availability = r.availability,
        s.posted = r.posted, s.updated = r.updated, s.category = r.category,
        s.presentation = r.presentation
    WITH s, r
    MATCH (p:Product {product_ndc: r.product_ndc})
    MERGE (s)-[:AFFECTS]->(p)
    RETURN count(*)
    """
    linked = 0
    for b in _batched(rows):
        linked += g.query(q, {"rows": b}).result_set[0][0]
    return linked


def stamp_ingest(g: Graph, source: str, records: int) -> None:
    g.query(
        "MERGE (m:IngestRun {source: $source}) SET m.at = $at, m.records = $records",
        {"source": source, "at": datetime.now(timezone.utc).isoformat(timespec="seconds"), "records": records},
    )
