"""Build the supply graph. Usage: python -m ingest.run [--refresh] [--reset]

--refresh downloads every source again instead of reusing data/raw.
--reset deletes the supply graph first."""
import sys
from pathlib import Path

import yaml

from fontrel import graph

from . import dailymed, dmf, http, load, openfda


def terms() -> list[str]:
    return yaml.safe_load((Path(__file__).parent / "drugs.yaml").read_text())["ingredients"]


def main(reset: bool = False, refresh: bool = False) -> None:
    http.REFRESH = refresh
    g = graph.supply()
    if reset and g.name in graph.client().list_graphs():
        g.delete()
        g = graph.supply()
    load.ensure_indexes(g)
    t = terms()

    products = openfda.product_rows(t)
    load.load_products(g, products)
    load.stamp_ingest(g, "openfda_ndc", len(products), http.fetched_at("ndc"))
    print(f"products: {len(products)}")

    shortages = openfda.shortage_rows(t)
    linked = load.load_shortages(g, shortages)
    load.stamp_ingest(g, "openfda_shortages", len(shortages), http.fetched_at("shortages"))
    print(f"shortages: {len(shortages)} current, {linked} linked to a product")

    made_at = dailymed.made_at_rows(products)
    load.load_made_at(g, made_at, [p["product_ndc"] for p in products])
    load.stamp_ingest(g, "dailymed_spl", len(made_at), http.fetched_at("dailymed"))
    print(f"made_at rows: {len(made_at)}")

    try:
        suppliers = dmf.dmf_rows(t)
    except Exception as e:
        # fda.gov sits behind a bot filter that blocks some server IPs. Supplier counts are a side
        # feature, so keep whatever the graph already has and finish the rest of the load.
        print(f"skipped the FDA Drug Master File list ({type(e).__name__}: {e}). "
              f"Download it in a browser from {dmf.URL} and run: python -m ingest.dmf_file <path>")
    else:
        load.load_candidate_suppliers(g, suppliers, dmf.WEIGHT)
        load.stamp_ingest(g, "fda_dmf_list", len(suppliers), http.fetched_at("dmf"))
        print(f"candidate supplier rows: {len(suppliers)}")

    pairs = load.equivalence_pairs(products)
    load.load_equivalence(g, pairs)
    load.stamp_ingest(g, "equivalence", len(pairs), http.fetched_at("ndc"))
    print(f"equivalence pairs: {len(pairs)}")


if __name__ == "__main__":
    main(reset="--reset" in sys.argv, refresh="--refresh" in sys.argv)
