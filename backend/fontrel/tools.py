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
    """Q3. Equivalent products, each compared with the shortage product's recorded manufacturing sites:
    shares_site   - made at a site the shortage product is also made at
    independent   - both products have recorded manufacturing sites and none overlap
    unknown       - either product has no manufacturing site on file, so overlap cannot be ruled out
    Rows also carry this hospital's last decision on each candidate, which moves rejected ones down."""
    run = _Run("find_substitutes")
    formulary = set(formulary_ndcs(tenant_id))
    rows = run.q(graph.supply(), """
        MATCH (s:Shortage {id: $sid})-[:AFFECTS]->(p:Product)-[:EQUIVALENT_TO]-(alt:Product)
        OPTIONAL MATCH (p)-[:MANUFACTURED_AT]->(bad:Site)<-[:MANUFACTURED_AT]-(alt)
        OPTIONAL MATCH (alt)-[am:MADE_AT {operation: 'MANUFACTURE'}]->(own:Site)
        OPTIONAL MATCH (alt)<-[:AFFECTS]-(altsh:Shortage)
        OPTIONAL MATCH (alt)-[ac:CONTAINS]->(ai:Ingredient)
        RETURN DISTINCT alt.product_ndc AS product_ndc, alt.generic_name AS product, alt.labeler AS labeler,
               alt.dosage_form AS dosage_form, alt.route AS route, alt.spl_set_id AS label_setid,
               collect(DISTINCT {name: ai.name, strength: ac.strength}) AS ingredients,
               collect(DISTINCT bad.name) AS shared_sites,
               collect(DISTINCT {site: own.name, setid: am.setid}) AS own_sites,
               count(DISTINCT altsh) > 0 AS in_shortage""", {"sid": shortage_id})
    src = run.q(graph.supply(), """
        MATCH (s:Shortage {id: $sid})-[:AFFECTS]->(p:Product)
        OPTIONAL MATCH (p)-[:MANUFACTURED_AT]->(site:Site)
        RETURN count(DISTINCT site) AS source_sites""", {"sid": shortage_id})
    source_known = bool(src and src[0]["source_sites"])
    prior = {r["substitute_ndc"]: r for r in run.q(graph.tenant(tenant_id), """
        MATCH (d:Decision)
        WITH d.substitute_ndc AS substitute_ndc, d ORDER BY d.at DESC
        WITH substitute_ndc, collect(d)[0] AS last
        RETURN substitute_ndc, last.action AS action, last.reason AS reason, last.outcome AS outcome,
               last.outcome_days AS outcome_days, last.at AS at""", {})}
    order = {"independent": 0, "unknown": 1, "shares_site": 2}
    for r in rows:
        r["own_sites"] = [o for o in r["own_sites"] if o.get("site")]
        if r["shared_sites"]:
            r["status"] = "shares_site"
        elif r["own_sites"] and source_known:
            r["status"] = "independent"
        else:
            r["status"] = "unknown"
        r["source_sites_known"] = source_known
        r["on_formulary"] = r["product_ndc"] in formulary
        r["prior_decision"] = prior.get(r["product_ndc"])
    rejected = lambda r: bool(r["prior_decision"] and r["prior_decision"]["action"] == "rejected")
    approved = lambda r: bool(r["prior_decision"] and r["prior_decision"]["action"] == "approved")
    rows.sort(key=lambda r: (order[r["status"]], rejected(r), r["in_shortage"], not r["on_formulary"],
                             not approved(r), r["labeler"]))
    note = "" if source_known else "the shortage product has no manufacturing site on file, so no candidate can be shown as independent"
    return run.done(rows, note)


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
               d.synthetic AS synthetic, d.by AS by, d.at AS at
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


# --- page summaries (not exposed to the LLM) --------------------------------------------

def ingredient_summary() -> ToolResult:
    """Each curated ingredient with its product count, current shortage count and
    candidate supplier count (FDA DMF holders)."""
    run = _Run("ingredient_summary")
    counts = run.q(graph.supply(), """
        MATCH (p:Product) UNWIND p.terms AS term
        OPTIONAL MATCH (p)<-[:AFFECTS]-(s:Shortage)
        RETURN term AS ingredient, count(DISTINCT p) AS products, count(DISTINCT s) AS shortages""", {})
    suppliers = run.q(graph.supply(), """
        MATCH (p:Product)-[:CONTAINS]->(:Ingredient)<-[:CANDIDATE_SUPPLIER]-(sup:Supplier)
        UNWIND p.terms AS term
        RETURN term AS ingredient, count(DISTINCT sup) AS candidate_suppliers""", {})
    by_term = {r["ingredient"]: r["candidate_suppliers"] for r in suppliers}
    rows = [{**r, "candidate_suppliers": by_term.get(r["ingredient"], 0)} for r in counts]
    rows.sort(key=lambda r: (-r["shortages"], r["ingredient"]))
    return run.done(rows)


def anchor_shortage(tenant_id: str, preferred_ndc: str = "55150-172") -> ToolResult:
    """The shortage used to show a real case: the preferred product if it is still a current
    shortage on this formulary, otherwise the one with the most exposed products from other
    companies made at the same plant."""
    run = _Run("anchor_shortage")
    rows = run.q(graph.supply(), """
        MATCH (s:Shortage)-[:AFFECTS]->(p:Product)-[:MANUFACTURED_AT]->(site:Site)<-[:MANUFACTURED_AT]-(o:Product)
        WHERE p.product_ndc IN $formulary AND o.product_ndc IN $formulary AND o.labeler <> p.labeler
        WITH s, p, count(DISTINCT o) AS cross_company_exposed
        RETURN s.id AS shortage_id, p.product_ndc AS product_ndc, s.generic_name AS shortage,
               s.company AS company, cross_company_exposed
        ORDER BY (p.product_ndc = $preferred) DESC, cross_company_exposed DESC, s.id LIMIT 1""",
                 {"formulary": formulary_ndcs(tenant_id), "preferred": preferred_ndc})
    return run.done(rows, "" if rows else "no shortage on this formulary shares a plant with another company")
