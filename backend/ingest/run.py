"""Build the supply graph. Usage: python -m ingest.run [--reset]"""
import sys
from pathlib import Path

import yaml

from fontrel import graph

from . import dailymed, dmf, load, openfda


def terms() -> list[str]:
    return yaml.safe_load((Path(__file__).parent / "drugs.yaml").read_text())["ingredients"]


def main(reset: bool = False) -> None:
    g = graph.supply()
    if reset and g.name in graph.client().list_graphs():
        g.delete()
        g = graph.supply()
    load.ensure_indexes(g)
    t = terms()

    products = openfda.product_rows(t)
    load.load_products(g, products)
    load.stamp_ingest(g, "openfda_ndc", len(products))
    print(f"products: {len(products)}")

    shortages = openfda.shortage_rows(t)
    linked = load.load_shortages(g, shortages)
    load.stamp_ingest(g, "openfda_shortages", len(shortages))
    print(f"shortages: {len(shortages)} current, {linked} linked to a product")

    made_at = dailymed.made_at_rows(products)
    load.load_made_at(g, made_at)
    load.stamp_ingest(g, "dailymed_spl", len(made_at))
    print(f"made_at rows: {len(made_at)}")

    suppliers = dmf.dmf_rows(t)
    load.load_candidate_suppliers(g, suppliers, dmf.WEIGHT)
    load.stamp_ingest(g, "fda_dmf_list", len(suppliers))
    print(f"candidate supplier rows: {len(suppliers)}")

    pairs = load.equivalence_pairs(products)
    load.load_equivalence(g, pairs)
    load.stamp_ingest(g, "equivalence", len(pairs))
    print(f"equivalence pairs: {len(pairs)}")


if __name__ == "__main__":
    main(reset="--reset" in sys.argv)
