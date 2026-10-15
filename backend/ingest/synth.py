"""Synthetic hospital tenants. Formularies use real NDCs from the supply graph; stock levels,
usage and past decisions are synthetic and labeled as such. Usage: python -m ingest.synth"""
import random

from fontrel import graph

EUGIA_DUNS = "650498244"



def _pick(cypher, params=None):
    return [r[0] for r in graph.supply().query(cypher, params or {}).result_set]


def mercy_ndcs(rng: random.Random) -> list[str]:
    eugia_site = _pick("""MATCH (p:Product)-[:MADE_AT {operation:'MANUFACTURE'}]->(:Site {duns:$d})
        RETURN DISTINCT p.product_ndc ORDER BY p.product_ndc""", {"d": EUGIA_DUNS})
    alternatives = _pick("""MATCH (p:Product)-[:MADE_AT {operation:'MANUFACTURE'}]->(:Site {duns:$d})
        MATCH (p)-[:EQUIVALENT_TO]-(alt:Product)-[:MADE_AT {operation:'MANUFACTURE'}]->(s:Site)
        WHERE s.duns <> $d RETURN DISTINCT alt.product_ndc ORDER BY alt.product_ndc""", {"d": EUGIA_DUNS})
    anchor_alts = _pick("""MATCH (p:Product)-[:MADE_AT {operation:'MANUFACTURE'}]->(:Site {duns:$d})
        WHERE toUpper(p.generic_name) CONTAINS 'BUPIVACAINE' OR toUpper(p.generic_name) CONTAINS 'ROPIVACAINE'
        MATCH (p)-[:EQUIVALENT_TO]-(alt:Product)-[:MADE_AT {operation:'MANUFACTURE'}]->(s:Site)
        WHERE s.duns <> $d RETURN DISTINCT alt.product_ndc ORDER BY alt.product_ndc""", {"d": EUGIA_DUNS})
    in_shortage = _pick("""MATCH (:Shortage)-[:AFFECTS]->(p:Product)-[:MADE_AT {operation:'MANUFACTURE'}]->(:Site)
        RETURN DISTINCT p.product_ndc ORDER BY p.product_ndc""")
    rest = [a for a in alternatives if a not in anchor_alts]
    chosen = list(dict.fromkeys(eugia_site + anchor_alts + rng.sample(rest, min(30, len(rest)))))
    pool = [n for n in in_shortage if n not in chosen]
    chosen += rng.sample(pool, min(150 - len(chosen), len(pool)))
    return chosen[:150]


def lakeside_ndcs(rng: random.Random) -> list[str]:
    pool = _pick("""MATCH (p:Product)-[:MADE_AT {operation:'MANUFACTURE'}]->(:Site)
        WHERE p.dosage_form CONTAINS 'INJECTION' RETURN DISTINCT p.product_ndc ORDER BY p.product_ndc""")
    return rng.sample(pool, min(80, len(pool)))


def write_formulary(tenant_id: str, name: str, ndcs: list[str], rng: random.Random) -> None:
    g = graph.tenant(tenant_id)
    if g.name in graph.client().list_graphs():
        g.delete()
        g = graph.tenant(tenant_id)
    info = {r[0]: r[1:] for r in graph.supply().query(
        "MATCH (p:Product) WHERE p.product_ndc IN $n RETURN p.product_ndc, p.generic_name, p.labeler",
        {"n": ndcs}).result_set}
    items = [{
        "product_ndc": n, "generic_name": info[n][0], "labeler": info[n][1],
        "on_hand_days": rng.randint(3, 60), "monthly_use": rng.randint(20, 900),
        "critical": rng.random() < 0.3,
    } for n in ndcs if n in info]
    g.query("CREATE INDEX FOR (f:FormularyItem) ON (f.product_ndc)")
    g.query("""MERGE (h:Hospital {id: $id}) SET h.name = $name, h.synthetic = true
        WITH h UNWIND $items AS it
        MERGE (f:FormularyItem {product_ndc: it.product_ndc})
        SET f.generic_name = it.generic_name, f.labeler = it.labeler, f.on_hand_days = it.on_hand_days,
            f.monthly_use = it.monthly_use, f.critical = it.critical
        MERGE (h)-[:STOCKS]->(f)""", {"id": tenant_id, "name": name, "items": items})


def first(cypher, params=None):
    rows = graph.supply().query(cypher, params or {}).result_set
    if not rows:
        raise RuntimeError(f"seed lookup found nothing: {cypher[:80]}")
    return rows[0][0]


def seed_mercy_memory() -> None:
    """Two closed episodes with decisions, so recall has history. Outcomes are synthetic."""
    g = graph.tenant("mercy")
    formulary = {r[0] for r in g.query("MATCH (f:FormularyItem) RETURN f.product_ndc").result_set}

    def in_formulary(cypher, params):
        for (ndc,) in graph.supply().query(cypher, params).result_set:
            if ndc in formulary:
                return ndc
        raise RuntimeError("no formulary product for seed: " + cypher[:60])

    eugia = {"d": EUGIA_DUNS}
    ropi_eugia = in_formulary("""MATCH (p:Product)-[:MADE_AT {operation:'MANUFACTURE'}]->(:Site {duns:$d})
        WHERE toUpper(p.generic_name) CONTAINS 'ROPIVACAINE' RETURN p.product_ndc ORDER BY p.product_ndc""", eugia)
    ropi_alt = in_formulary("""MATCH (p:Product {product_ndc:$n})-[:EQUIVALENT_TO]-(a:Product)-[:MADE_AT {operation:'MANUFACTURE'}]->(s:Site)
        WHERE s.duns <> $d RETURN a.product_ndc ORDER BY a.product_ndc""", {"n": ropi_eugia, **eugia})
    bupi_pairs = [(a, b) for a, b in graph.supply().query("""
        MATCH (p:Product)-[:MADE_AT {operation:'MANUFACTURE'}]->(:Site {duns:$d})
        WHERE toUpper(p.generic_name) CONTAINS 'BUPIVACAINE'
        MATCH (p)-[:EQUIVALENT_TO]-(a:Product)-[:MADE_AT {operation:'MANUFACTURE'}]->(s:Site) WHERE s.duns <> $d
        RETURN DISTINCT p.product_ndc, a.product_ndc ORDER BY p.product_ndc, a.product_ndc""", eugia).result_set
        if a in formulary and b in formulary]
    if len({b for _, b in bupi_pairs}) < 2:
        raise RuntimeError("need two bupivacaine substitutes in the formulary")
    bupi_eugia = bupi_pairs[0][0]
    bupi_alts = list(dict.fromkeys(b for a, b in bupi_pairs if a == bupi_eugia)) + \
        [b for _, b in bupi_pairs if _ != bupi_eugia]

    episodes = [
        {"id": "ep-2026-04-ropi", "product_ndc": ropi_eugia, "opened": "2026-04-02", "closed": "2026-05-13",
         "shortage_label": "Ropivacaine HCl injection (Eugia US) shortage, April 2026",
         "decisions": [{"id": "dec-2026-04-ropi-1", "substitute_ndc": ropi_alt, "action": "approved",
                        "reason": "Equivalent product with its own manufacturing site", "by": "J. Okafor, PharmD",
                        "at": "2026-04-03", "outcome": "held", "outcome_days": 41}]},
        {"id": "ep-2026-07-bupi", "product_ndc": bupi_eugia, "opened": "2026-07-10", "closed": "2026-08-21",
         "shortage_label": "Bupivacaine HCl injection (Eugia US) shortage, July 2026",
         "decisions": [
             {"id": "dec-2026-07-bupi-1", "substitute_ndc": bupi_alts[0], "action": "approved",
              "reason": "Independent site, wholesaler had allocation", "by": "J. Okafor, PharmD",
              "at": "2026-07-11", "outcome": "held", "outcome_days": 42},
             {"id": "dec-2026-07-bupi-2", "substitute_ndc": bupi_alts[1 % len(bupi_alts)], "action": "rejected",
              "reason": "Wholesaler allocation too small for OR volume", "by": "J. Okafor, PharmD",
              "at": "2026-07-11", "outcome": None, "outcome_days": None},
         ]},
    ]
    g.query("""UNWIND $eps AS e
        MATCH (f:FormularyItem {product_ndc: e.product_ndc})
        MERGE (ep:Episode {id: e.id})
        SET ep.product_ndc = e.product_ndc, ep.opened = e.opened, ep.closed = e.closed, ep.status = 'closed',
            ep.shortage_label = e.shortage_label, ep.synthetic = true
        MERGE (ep)-[:FOR]->(f)
        WITH ep, e UNWIND e.decisions AS d
        MATCH (sub:FormularyItem {product_ndc: d.substitute_ndc})
        MERGE (dec:Decision {id: d.id})
        SET dec.substitute_ndc = d.substitute_ndc, dec.action = d.action, dec.reason = d.reason, dec.by = d.by,
            dec.at = d.at, dec.outcome = d.outcome, dec.outcome_days = d.outcome_days, dec.synthetic = true
        MERGE (dec)-[:IN]->(ep)
        MERGE (dec)-[:CHOSE]->(sub)""", {"eps": episodes})


def main() -> None:
    write_formulary("mercy", "Mercy General Hospital", mercy_ndcs(random.Random(11)), random.Random(12))
    write_formulary("lakeside", "Lakeside Community Hospital", lakeside_ndcs(random.Random(21)), random.Random(22))
    seed_mercy_memory()
    for t in graph.list_tenants():
        n = graph.tenant(t).query("MATCH (f:FormularyItem) RETURN count(f)").result_set[0][0]
        e = graph.tenant(t).query("MATCH (e:Episode) RETURN count(e)").result_set[0][0]
        print(f"tenant {t}: {n} formulary items, {e} episodes")


if __name__ == "__main__":
    main()
