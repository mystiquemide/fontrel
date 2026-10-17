"""Remove decisions made through the app, keeping the synthetic seed. Saved traces stay valid
because the hospital's memory returns to the seeded version. Usage: python -m ingest.reset_demo"""
from fontrel import graph


def reset(tenant_id: str) -> int:
    g = graph.tenant(tenant_id)
    removed = g.query("""MATCH (d:Decision) WHERE d.synthetic = false
        DETACH DELETE d RETURN count(d)""").result_set[0][0]
    g.query("MATCH (e:Episode) WHERE e.synthetic IS NULL AND NOT (e)<-[:IN]-(:Decision) DETACH DELETE e")
    g.query("""MATCH (f:FormularyItem {added_by_decision: true})
        WHERE NOT (f)<-[:CHOSE]-(:Decision) AND NOT (f)<-[:FOR]-(:Episode) DETACH DELETE f""")
    return removed


def main() -> None:
    for t in graph.list_tenants():
        print(f"tenant {t}: removed {reset(t)} decisions made in the app")


if __name__ == "__main__":
    main()
