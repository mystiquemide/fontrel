"""Read-only graph tools the agent (and the MCP server) can call.

Every tool returns the Cypher it ran, the parameters and the rows, so the UI can show
exactly how each answer was produced. Cypher is always parameterized, never formatted.
The supply graph and tenant graphs are separate, so joins happen here on product NDC.
"""
import time
from dataclasses import asdict, dataclass, field

from . import graph


@dataclass
class ToolResult:
    tool: str
    rows: list[dict]
    queries: list[dict] = field(default_factory=list)
    ms: float = 0.0
    note: str = ""

    def to_dict(self) -> dict:
        return asdict(self)


class _Run:
    """Collects the queries a tool runs, with timing."""

    def __init__(self, tool: str):
        self.tool, self.queries, self.t0 = tool, [], time.perf_counter()

    def q(self, g, cypher: str, params: dict) -> list[dict]:
        res = g.query(cypher, params)
        cols = [h[1] if isinstance(h, (list, tuple)) else h for h in res.header]
        self.queries.append({"graph": g.name, "cypher": " ".join(cypher.split()), "params": params})
        return [dict(zip(cols, row)) for row in res.result_set]

    def done(self, rows, note="") -> ToolResult:
        return ToolResult(self.tool, rows, self.queries, round((time.perf_counter() - self.t0) * 1000, 1), note)


def formulary_ndcs(tenant_id: str) -> list[str]:
    res = graph.tenant(tenant_id).query("MATCH (:Hospital)-[:STOCKS]->(f:FormularyItem) RETURN f.product_ndc")
    return [r[0] for r in res.result_set]


# --- tools -----------------------------------------------------------------------------

def list_formulary_shortages(tenant_id: str) -> ToolResult:
    """Current shortages that affect a product on this hospital's formulary."""
    run = _Run("list_formulary_shortages")
    rows = run.q(graph.supply(), """
        MATCH (s:Shortage)-[:AFFECTS]->(p:Product)
        WHERE p.product_ndc IN $formulary
        RETURN s.id AS shortage_id, s.generic_name AS shortage, s.company AS company,
               s.availability AS availability, s.reason AS reason, s.updated AS updated,
               p.product_ndc AS product_ndc, p.generic_name AS product, p.labeler AS labeler
        ORDER BY s.updated DESC""", {"formulary": formulary_ndcs(tenant_id)})
    return run.done(rows)


def get_shortage(shortage_id: str) -> ToolResult:
    """Shortage record, the product it affects, that product's ingredients and manufacturing sites."""
    run = _Run("get_shortage")
    rows = run.q(graph.supply(), """
        MATCH (s:Shortage {id: $sid})-[:AFFECTS]->(p:Product)
        OPTIONAL MATCH (p)-[:CONTAINS]->(i:Ingredient)
        OPTIONAL MATCH (p)-[m:MADE_AT {operation: 'MANUFACTURE'}]->(site:Site)
        RETURN s.id AS shortage_id, s.generic_name AS shortage, s.company AS company,
               s.reason AS reason, s.availability AS availability, s.updated AS updated,
               p.product_ndc AS product_ndc, p.generic_name AS product, p.labeler AS labeler,
               collect(DISTINCT i.name) AS ingredients,
               collect(DISTINCT {site: site.name, duns: site.duns, setid: m.setid}) AS sites""",
                 {"sid": shortage_id})
    for r in rows:
        r["sites"] = [s for s in r["sites"] if s.get("duns")]
    return run.done(rows, "" if rows else "unknown shortage id")


def find_site_exposure(tenant_id: str, shortage_id: str) -> ToolResult:
    """Q1. Formulary products made at the same manufacturing site as the shortage product."""
    run = _Run("find_site_exposure")
    rows = run.q(graph.supply(), """
        MATCH (s:Shortage {id: $sid})-[:AFFECTS]->(p:Product)-[m1:MADE_AT {operation: 'MANUFACTURE'}]->(site:Site)
              <-[m2:MADE_AT {operation: 'MANUFACTURE'}]-(other:Product)
        WHERE other.product_ndc IN $formulary AND other.product_ndc <> p.product_ndc
        OPTIONAL MATCH (other)<-[:AFFECTS]-(os:Shortage)
        RETURN DISTINCT other.product_ndc AS product_ndc, other.generic_name AS product, other.labeler AS labeler,
               site.name AS via_site, site.duns AS duns, m1.setid AS shortage_label_setid,
               m2.setid AS exposed_label_setid, count(DISTINCT os) > 0 AS already_in_shortage,
               [p.product_ndc, site.name, other.product_ndc] AS path
        ORDER BY already_in_shortage, labeler""", {"sid": shortage_id, "formulary": formulary_ndcs(tenant_id)})
    return run.done(rows)


def find_ingredient_exposure(tenant_id: str, shortage_id: str) -> ToolResult:
    """Q2. Formulary products sharing an ingredient, with how many candidate suppliers that ingredient has.
    Candidate suppliers come from the FDA DMF list and are weaker evidence than manufacturing sites."""
    run = _Run("find_ingredient_exposure")
    rows = run.q(graph.supply(), """
        MATCH (s:Shortage {id: $sid})-[:AFFECTS]->(p:Product)-[:CONTAINS]->(i:Ingredient)
        OPTIONAL MATCH (i)<-[c:CANDIDATE_SUPPLIER]-(sup:Supplier)
        WITH p, i, count(DISTINCT sup) AS supplier_count, collect(DISTINCT c.dmf)[0..5] AS sample_dmfs
        MATCH (i)<-[:CONTAINS]-(other:Product)
        WHERE other.product_ndc IN $formulary AND other.product_ndc <> p.product_ndc
        RETURN i.name AS ingredient, supplier_count, sample_dmfs,
               collect(DISTINCT {product_ndc: other.product_ndc, product: other.generic_name,
                                 labeler: other.labeler}) AS formulary_products""",
                 {"sid": shortage_id, "formulary": formulary_ndcs(tenant_id)})
    return run.done(rows, "candidate suppliers are DMF holders, not confirmed suppliers of these products")


def find_substitutes(tenant_id: str, shortage_id: str) -> ToolResult:
    """Q3. Equivalent products, each classified against the failing manufacturing site:
    shares_site   - made at a site the shortage product is made at
    independent   - has known manufacturing sites and none are shared
    unknown       - no manufacturing site on file, independence cannot be shown"""
    run = _Run("find_substitutes")
    formulary = set(formulary_ndcs(tenant_id))
    rows = run.q(graph.supply(), """
        MATCH (s:Shortage {id: $sid})-[:AFFECTS]->(p:Product)-[:EQUIVALENT_TO]-(alt:Product)
        OPTIONAL MATCH (p)-[:MANUFACTURED_AT]->(bad:Site)<-[:MANUFACTURED_AT]-(alt)
        OPTIONAL MATCH (alt)-[am:MADE_AT {operation: 'MANUFACTURE'}]->(own:Site)
        OPTIONAL MATCH (alt)<-[:AFFECTS]-(altsh:Shortage)
        RETURN DISTINCT alt.product_ndc AS product_ndc, alt.generic_name AS product, alt.labeler AS labeler,
               collect(DISTINCT bad.name) AS shared_sites,
               collect(DISTINCT {site: own.name, setid: am.setid}) AS own_sites,
               count(DISTINCT altsh) > 0 AS in_shortage""", {"sid": shortage_id})
    order = {"independent": 0, "unknown": 1, "shares_site": 2}
    for r in rows:
        r["own_sites"] = [o for o in r["own_sites"] if o.get("site")]
        r["status"] = "shares_site" if r["shared_sites"] else ("independent" if r["own_sites"] else "unknown")
        r["on_formulary"] = r["product_ndc"] in formulary
    rows.sort(key=lambda r: (order[r["status"]], r["in_shortage"], not r["on_formulary"], r["labeler"]))
    return run.done(rows)


def rank_source_concentration(limit: int = 10) -> ToolResult:
    """Q4. PageRank over the manufacturing graph. Sites score high when many products depend on
    them and those products have few other sites. Raw product count shown alongside."""
    run = _Run("rank_source_concentration")
    rows = run.q(graph.supply(), """
        CALL algo.pageRank(null, 'MANUFACTURED_AT') YIELD node, score
        WITH node, score WHERE node:Site
        MATCH (node)<-[:MANUFACTURED_AT]-(p:Product)
        OPTIONAL MATCH (p)<-[:AFFECTS]-(sh:Shortage)
        RETURN node.name AS site, node.duns AS duns, score AS pagerank,
               count(DISTINCT p) AS products, count(DISTINCT p.labeler) AS labelers,
               count(DISTINCT sh) AS shortages
        ORDER BY pagerank DESC LIMIT $limit""", {"limit": int(limit)})
    return run.done(rows)


def exposure_clusters(tenant_id: str, limit: int = 5) -> ToolResult:
    """Q5. Weakly connected components of products and sites. Products in one component
    are linked through shared manufacturing sites, directly or indirectly."""
    run = _Run("exposure_clusters")
    rows = run.q(graph.supply(), """
        CALL algo.WCC({nodeLabels: ['Product', 'Site'], relationshipTypes: ['MANUFACTURED_AT']})
        YIELD node, componentId
        WITH componentId, collect(node) AS members
        WITH componentId, [n IN members WHERE n:Site | n.name] AS sites,
             [n IN members WHERE n:Product AND n.product_ndc IN $formulary | n.product_ndc] AS formulary_products
        WHERE size(sites) > 1 AND size(formulary_products) > 0
        RETURN componentId AS cluster, size(sites) AS site_count, sites[0..6] AS sites,
               size(formulary_products) AS formulary_count, formulary_products[0..12] AS formulary_sample
        ORDER BY formulary_count DESC LIMIT $limit""",
                 {"formulary": formulary_ndcs(tenant_id), "limit": int(limit)})
    return run.done(rows)


def recall_memory(tenant_id: str, shortage_id: str) -> ToolResult:
    """Q6. Past episodes at this hospital involving the same ingredients, and what was decided."""
    run = _Run("recall_memory")
    related = run.q(graph.supply(), """
        MATCH (s:Shortage {id: $sid})-[:AFFECTS]->(:Product)-[:CONTAINS]->(i:Ingredient)<-[:CONTAINS]-(r:Product)
        RETURN collect(DISTINCT r.product_ndc) AS ndcs""", {"sid": shortage_id})
    ndcs = related[0]["ndcs"] if related else []
    rows = run.q(graph.tenant(tenant_id), """
        MATCH (e:Episode)-[:FOR]->(f:FormularyItem) WHERE f.product_ndc IN $ndcs
        MATCH (d:Decision)-[:IN]->(e)
        OPTIONAL MATCH (d)-[:CHOSE]->(sub:FormularyItem)
        RETURN e.id AS episode, e.shortage_label AS episode_label, e.opened AS opened, e.closed AS closed,
               d.id AS decision, d.action AS action, d.substitute_ndc AS substitute_ndc,
               sub.generic_name AS substitute, sub.labeler AS substitute_labeler,
               d.reason AS reason, d.outcome AS outcome, d.outcome_days AS outcome_days,
               d.synthetic AS synthetic
        ORDER BY e.opened DESC, d.id""", {"ndcs": ndcs})
    return run.done(rows)


# Tool registry exposed to the LLM. Read-only by construction: no tool here writes.
READ_TOOLS = {
    "list_formulary_shortages": list_formulary_shortages,
    "get_shortage": get_shortage,
    "find_site_exposure": find_site_exposure,
    "find_ingredient_exposure": find_ingredient_exposure,
    "find_substitutes": find_substitutes,
    "rank_source_concentration": rank_source_concentration,
    "exposure_clusters": exposure_clusters,
    "recall_memory": recall_memory,
}
