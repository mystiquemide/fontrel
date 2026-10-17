"""Write ingest rows into the supply graph. All writes are idempotent MERGEs."""
import re
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
    """Products from this load replace what the graph held: a product that left the source is
    removed, and each product's ingredient links are rewritten, so a changed ingredient never lingers.
    Called only after the source was fully downloaded."""
    g.query("MATCH (p:Product) WHERE NOT p.product_ndc IN $ndcs DETACH DELETE p",
            {"ndcs": [r["product_ndc"] for r in rows]})
    q = """
    UNWIND $rows AS r
    MERGE (p:Product {product_ndc: r.product_ndc})
    WITH p, r
    OPTIONAL MATCH (p)-[old:CONTAINS|LABELED_BY]->()
    DELETE old
    WITH DISTINCT p, r
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
    # a shortage that is no longer on the current list is removed, so a resolved one never lingers
    g.query("MATCH (s:Shortage) WHERE NOT s.id IN $ids DETACH DELETE s", {"ids": [r["id"] for r in rows]})
    return linked


def stamp_ingest(g: Graph, source: str, records: int, fetched: str | None = None) -> None:
    """at is when the graph was built from the source; fetched is when the source files were downloaded."""
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    g.query(
        "MERGE (m:IngestRun {source: $source}) SET m.at = $at, m.records = $records, m.fetched = $fetched",
        {"source": source, "at": now, "records": records, "fetched": fetched or now},
    )


def load_made_at(g: Graph, rows: list[dict], product_ndcs: list[str]) -> None:
    """Plant links are rewritten for every product in this load, including products whose label
    now lists no plant, so a plant that left a label never lingers."""
    g.query("""MATCH (p:Product)-[m:MADE_AT|MANUFACTURED_AT]->(:Site) WHERE p.product_ndc IN $ndcs
               DELETE m""", {"ndcs": product_ndcs})
    q = """
    UNWIND $rows AS r
    MATCH (p:Product {product_ndc: r.product_ndc})
    MERGE (s:Site {name_norm: r.duns})
    SET s.name = r.name, s.duns = r.duns, s.country = r.country
    MERGE (p)-[m:MADE_AT {operation: r.operation}]->(s)
    SET m.setid = r.setid, m.source = 'SPL'
    """
    for b in _batched(rows):
        g.query(q, {"rows": b})
    # Plain projection of manufacturing-only links, so graph algorithms (which filter by
    # relationship type, not property) ignore packing, relabeling and testing sites.
    g.query("""MATCH (p:Product)-[m:MADE_AT {operation:'MANUFACTURE'}]->(s:Site)
               MERGE (p)-[:MANUFACTURED_AT]->(s)""")
    g.query("MATCH (s:Site) WHERE NOT (s)<-[:MADE_AT]-() DETACH DELETE s")


def load_candidate_suppliers(g: Graph, rows: list[dict], weight: float) -> None:
    """Supplier links are rebuilt from scratch on each load. Suppliers left with no link are removed."""
    g.query("MATCH ()-[c:CANDIDATE_SUPPLIER]->() DELETE c")
    """Link DMF holders to every ingredient whose name contains the matched term as a whole word."""
    from .openfda import word_match
    names = [r[0] for r in g.query("MATCH (i:Ingredient) RETURN i.name").result_set]
    for r in rows:
        r["ingredients"] = [n for n in names if word_match(r["term"], n)]
    q = """
    UNWIND $rows AS r
    MERGE (s:Supplier {name_norm: r.holder_norm})
    SET s.name = r.holder
    WITH s, r
    UNWIND r.ingredients AS iname
    MATCH (i:Ingredient {name: iname})
    MERGE (s)-[c:CANDIDATE_SUPPLIER {dmf: r.dmf}]->(i)
    SET c.subject = r.subject, c.weight = $weight, c.source = 'FDA DMF list'
    """
    for b in _batched(rows):
        g.query(q, {"rows": b, "weight": weight})
    g.query("MATCH (s:Supplier) WHERE NOT (s)-[:CANDIDATE_SUPPLIER]->() DETACH DELETE s")
    g.query("MATCH (i:Ingredient) WHERE NOT ()-[:CONTAINS]->(i) AND NOT ()-[:CANDIDATE_SUPPLIER]->(i) DETACH DELETE i")


def _strength(s: str) -> str:
    """Normalise a label strength for comparison: '30 mg/1 g' and '30mg/g' compare equal."""
    return re.sub(r"/1(?=[a-z])", "/", (s or "").replace(" ", "").lower())


def strength_signature(p: dict) -> tuple | None:
    """Every active ingredient with its own strength, order-independent. None if any strength is missing,
    because a product we cannot fully compare must never be paired."""
    sig = []
    for i in p["ingredients"]:
        st = _strength(i.get("strength", ""))
        if not st:
            return None
        sig.append((i["name"], st))
    return tuple(sorted(sig))


def equivalence_pairs(products: list[dict]) -> list[dict]:
    """Same active ingredients at the same strength each, same dosage form and route, different labeler."""
    groups: dict[tuple, list[dict]] = {}
    for p in products:
        if not p["ingredients"]:
            continue
        sig = strength_signature(p)
        if sig is None:
            continue
        key = (sig, p["dosage_form"].upper(), p["route"].upper())
        groups.setdefault(key, []).append(p)
    pairs = []
    for members in groups.values():
        for i, a in enumerate(members):
            for b in members[i + 1:]:
                if a["labeler"] != b["labeler"]:
                    pairs.append({"a": a["product_ndc"], "b": b["product_ndc"]})
    return pairs


def load_equivalence(g: Graph, pairs: list[dict]) -> None:
    g.query("MATCH ()-[e:EQUIVALENT_TO]->() DELETE e")  # rebuilt from scratch so a fixed rule leaves no stale pairs
    q = """
    UNWIND $rows AS r
    MATCH (a:Product {product_ndc: r.a}), (b:Product {product_ndc: r.b})
    MERGE (a)-[e:EQUIVALENT_TO]->(b)
    SET e.basis = 'same ingredients and strength of each, same form and route'
    """
    for b in _batched(pairs):
        g.query(q, {"rows": b})
