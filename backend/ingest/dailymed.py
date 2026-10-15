"""DailyMed SPL establishments: which registered site performs which operation for which NDC.

Each SPL header lists establishments (DUNS + name, sometimes address) under the labeler,
and for each one the operations it performs (MANUFACTURE, API MANUFACTURE, ...) with the
product NDCs those operations cover. We keep only that extract, not the full XML.
"""
import json
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor

import time

from .http import RAW, _client

NS = {"v3": "urn:hl7-org:v3"}
URL = "https://dailymed.nlm.nih.gov/dailymed/services/v2/spls/{setid}.xml"
EXTRACT = RAW / "spl_establishments"


def _text(el, path):
    found = el.find(path, NS)
    return (found.text or "").strip() if found is not None else ""


def parse_establishments(xml: str) -> list[dict]:
    root = ET.fromstring(xml)
    out = []
    for ent in root.iterfind(".//v3:author//v3:assignedEntity", NS):
        org = ent.find("v3:assignedOrganization", NS)
        perfs = ent.findall("v3:performance", NS)
        if org is None or not perfs:
            continue
        duns_el = org.find("v3:id[@root='1.3.6.1.4.1.519.1']", NS)
        ops = []
        for p in perfs:
            code = p.find("v3:actDefinition/v3:code", NS)
            ndcs = [c.get("code") for c in p.iterfind(".//v3:manufacturedMaterialKind/v3:code", NS) if c.get("code")]
            if code is not None:
                ops.append({"operation": code.get("displayName", "").upper(), "ndcs": ndcs})
        out.append({
            "duns": duns_el.get("extension") if duns_el is not None else "",
            "name": _text(org, "v3:name"),
            "country": _text(org, "v3:addr/v3:country"),
            "operations": ops,
        })
    return out


def establishments_for(setid: str) -> list[dict]:
    path = EXTRACT / f"{setid}.json"
    if path.exists():
        return json.loads(path.read_text())
    xml = None
    for attempt in range(4):
        r = _client.get(URL.format(setid=setid))
        if r.status_code == 404:
            break
        if r.status_code == 429 or r.status_code >= 500:
            time.sleep(2 ** attempt)
            continue
        r.raise_for_status()
        xml = r.text
        break
    result = parse_establishments(xml) if xml else []
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(result))
    return result


def made_at_rows(products: list[dict], workers: int = 8) -> list[dict]:
    """One row per (product, site, operation) where the SPL names that product's NDC."""
    by_setid: dict[str, set[str]] = {}
    for p in products:
        if p.get("spl_set_id"):
            by_setid.setdefault(p["spl_set_id"], set()).add(p["product_ndc"])
    with ThreadPoolExecutor(workers) as pool:
        results = dict(zip(by_setid, pool.map(establishments_for, by_setid)))
    rows = []
    for setid, ests in results.items():
        wanted = by_setid[setid]
        for e in ests:
            if not e["duns"] and not e["name"]:
                continue
            for op in e["operations"]:
                # NDCs in SPL performance blocks are product NDCs; fall back to all label products if none listed
                targets = {n for n in op["ndcs"] if n in wanted} or (wanted if not op["ndcs"] else set())
                for ndc in targets:
                    rows.append({
                        "product_ndc": ndc, "duns": e["duns"] or f"name:{e['name'].upper()}",
                        "name": e["name"], "country": e["country"],
                        "operation": op["operation"], "setid": setid,
                    })
    return rows
