"""Load the FDA Drug Master File list from a file you downloaded yourself.

fda.gov blocks some server IPs, so python -m ingest.run may skip this step. Download the list in a
browser from ingest.dmf.URL, copy it to the server, then run:

    python -m ingest.dmf_file /path/to/dmf-list.xlsx
"""
import sys
from datetime import datetime, timezone
from pathlib import Path

from fontrel import graph

from . import dmf, load
from .run import terms


def main(path: str) -> None:
    file = Path(path)
    rows = dmf.dmf_rows(terms(), file.read_bytes())
    g = graph.supply()
    load.load_candidate_suppliers(g, rows, dmf.WEIGHT)
    fetched = datetime.fromtimestamp(file.stat().st_mtime, timezone.utc).isoformat(timespec="seconds")
    load.stamp_ingest(g, "fda_dmf_list", len(rows), fetched)
    print(f"candidate supplier rows: {len(rows)}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("usage: python -m ingest.dmf_file /path/to/dmf-list.xlsx")
    main(sys.argv[1])
