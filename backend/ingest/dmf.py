"""FDA Drug Master File list: who is registered to supply each ingredient.

A Type II DMF holder for an ingredient is a *candidate* supplier. The list does not say
which finished product buys from which holder, so these edges are weak evidence and are
weighted below SPL establishment edges.
"""
import io
import re

import openpyxl

from .http import cached_get
from .openfda import word_match

URL = "https://www.fda.gov/media/192069/download?attachment"
WEIGHT = 0.3
# Subjects naming finished products or facilities, not the ingredient itself.
NOT_API = re.compile(r"INJECTION|TABLET|CAPSULE|FACILIT|FILLING|SOLUTION|VIAL|SYRINGE|PATCH|CREAM", re.I)


def norm(name: str) -> str:
    return re.sub(r"[^A-Z0-9]+", " ", name.upper()).strip()


def dmf_rows(terms: list[str]) -> list[dict]:
    data = cached_get(URL, kind="dmf", binary=True)
    ws = openpyxl.load_workbook(io.BytesIO(data), read_only=True).worksheets[0]
    rows = []
    header = None
    for r in ws.iter_rows(values_only=True):
        if header is None:
            if r and r[0] == "DMF#":
                header = r
            continue
        if not r or r[0] is None:
            continue
        num, status, typ, _date, holder, subject = r[:6]
        if status != "A" or typ != "II" or not holder or not subject:
            continue
        subj = str(subject).upper()
        if NOT_API.search(subj):
            continue
        for t in terms:
            if word_match(t, subj):
                rows.append({"dmf": str(num), "holder": str(holder).strip(), "holder_norm": norm(str(holder)),
                             "subject": subj, "term": t})
    return rows
