"""openFDA shortages and NDC directory into the supply graph."""
import re
from urllib.parse import quote

from fontrel.config import settings

from .http import cached_get

BASE = "https://api.fda.gov/drug"


def _url(endpoint: str, search: str, limit: int, skip: int) -> str:
    url = f"{BASE}/{endpoint}.json?search={quote(search)}&limit={limit}&skip={skip}"
    if settings.openfda_api_key:
        url += f"&api_key={settings.openfda_api_key}"
    return url


def fetch_all(endpoint: str, search: str, page: int = 1000) -> list[dict]:
    out, skip = [], 0
    while True:
        d = cached_get(_url(endpoint, search, page, skip), kind=endpoint)
        if not d:
            break
        out += d["results"]
        skip += page
        if skip >= d["meta"]["results"]["total"]:
            break
    return out


def matches(names: list[str], terms: list[str]) -> list[str]:
    """Return the curated terms that appear in any of the given ingredient names."""
    up = [n.upper() for n in names]
    return [t for t in terms if any(word_match(t, n) for n in up)]


def word_match(term: str, text: str) -> bool:
    """Whole-word match, so EPINEPHRINE does not match NOREPINEPHRINE."""
    return re.search(rf"(?<![A-Z]){re.escape(term)}(?![A-Z])", text.upper()) is not None


def product_ndc_from_package(package_ndc: str) -> str:
    return "-".join(package_ndc.split("-")[:2])


def shortage_rows(terms: list[str]) -> list[dict]:
    rows = {}
    for r in fetch_all("shortages", "status:Current"):
        ofda = r.get("openfda", {})
        names = (ofda.get("substance_name") or []) + [r.get("generic_name", "")]
        if not matches(names, terms) or not r.get("package_ndc"):
            continue
        sid = f"{r['package_ndc']}|{r.get('initial_posting_date', '')}"
        rows[sid] = {
            "id": sid,
            "package_ndc": r["package_ndc"],
            "product_ndc": product_ndc_from_package(r["package_ndc"]),
            "generic_name": r.get("generic_name", ""),
            "company": r.get("company_name", ""),
            "status": r.get("status", ""),
            "reason": r.get("shortage_reason", ""),
            "availability": r.get("availability", ""),
            "posted": r.get("initial_posting_date", ""),
            "updated": r.get("update_date", ""),
            "category": ", ".join(r.get("therapeutic_category") or []),
            "presentation": r.get("presentation", ""),
        }
    return list(rows.values())


def product_rows(terms: list[str]) -> list[dict]:
    seen, rows = set(), []
    for term in terms:
        for r in fetch_all("ndc", f'active_ingredients.name:"{term}"'):
            if r.get("product_type") != "HUMAN PRESCRIPTION DRUG" or r["product_ndc"] in seen:
                continue
            seen.add(r["product_ndc"])
            ofda = r.get("openfda", {})
            rows.append({
                "product_ndc": r["product_ndc"],
                "generic_name": r.get("generic_name", ""),
                "brand_name": r.get("brand_name", ""),
                "labeler": r.get("labeler_name", ""),
                "dosage_form": r.get("dosage_form", ""),
                "route": ", ".join(r.get("route") or []),
                "application_number": r.get("application_number", ""),
                "spl_set_id": (ofda.get("spl_set_id") or [""])[0],
                "ingredients": [
                    {"name": a["name"].upper(), "strength": a.get("strength", "")}
                    for a in r.get("active_ingredients", [])
                ],
                "terms": matches([a["name"] for a in r.get("active_ingredients", [])], terms),
            })
    return rows
