from fontrel import graph
from ingest.load import equivalence_pairs


def q(cypher, params=None):
    return graph.supply().query(cypher, params or {}).result_set


def test_candidate_weight_below_spl():
    # DMF edges are weak evidence: weight set, and strictly below the implicit 1.0 of SPL MADE_AT edges
    max_w = q("MATCH ()-[c:CANDIDATE_SUPPLIER]->() RETURN max(c.weight)")[0][0]
    assert max_w is not None and max_w < 1.0
    assert q("MATCH ()-[m:MADE_AT]->() WHERE m.source <> 'SPL' RETURN count(m)")[0][0] == 0


def test_candidate_edges_cite_dmf():
    assert q("MATCH ()-[c:CANDIDATE_SUPPLIER]->() WHERE c.dmf IS NULL OR c.dmf = '' RETURN count(c)")[0][0] == 0
    assert q("MATCH ()-[c:CANDIDATE_SUPPLIER]->() RETURN count(c)")[0][0] > 100


def test_no_norepinephrine_false_match():
    bad = q("""MATCH ()-[c:CANDIDATE_SUPPLIER]->(i:Ingredient)
    WHERE i.name STARTS WITH 'NOREPINEPHRINE' AND NOT c.subject CONTAINS 'NOREPINEPHRINE' RETURN count(c)""")
    assert bad[0][0] == 0


def test_equivalence_pairs_cross_labeler_only():
    prods = [
        {"product_ndc": "1", "labeler": "A", "dosage_form": "INJECTION", "route": "IV",
         "ingredients": [{"name": "X", "strength": "1 mg/mL"}]},
        {"product_ndc": "2", "labeler": "B", "dosage_form": "INJECTION", "route": "IV",
         "ingredients": [{"name": "X", "strength": "1mg/mL"}]},
        {"product_ndc": "3", "labeler": "A", "dosage_form": "INJECTION", "route": "IV",
         "ingredients": [{"name": "X", "strength": "1 mg/mL"}]},
        {"product_ndc": "4", "labeler": "C", "dosage_form": "TABLET", "route": "ORAL",
         "ingredients": [{"name": "X", "strength": "1 mg/mL"}]},
    ]
    pairs = {(p["a"], p["b"]) for p in equivalence_pairs(prods)}
    assert pairs == {("1", "2"), ("2", "3")}


def test_equivalence_loaded():
    assert q("MATCH ()-[e:EQUIVALENT_TO]->() RETURN count(e)")[0][0] > 1000


def test_dmf_alias_for_fda_misspelling():
    from ingest.dmf import ALIASES
    from ingest.openfda import word_match
    assert any(word_match(a, "LISDEXAETAMINE DIMESYLATE") for a in ALIASES["LISDEXAMFETAMINE"])
    n = q("""MATCH (:Supplier)-[:CANDIDATE_SUPPLIER]->(i:Ingredient)
             WHERE i.name STARTS WITH 'LISDEXAMFETAMINE' RETURN count(*)""")[0][0]
    assert n > 0


def test_equivalence_compares_every_ingredient_strength():
    from ingest.load import equivalence_pairs

    def prod(ndc, labeler, ings):
        return {"product_ndc": ndc, "labeler": labeler, "dosage_form": "CREAM", "route": "RECTAL",
                "ingredients": [{"name": n, "strength": st} for n, st in ings]}
    # real FDA pair from the audit: same lidocaine, different hydrocortisone strength
    a = prod("59088-771", "PureTek", [("LIDOCAINE HYDROCHLORIDE", "30 mg/g"), ("HYDROCORTISONE ACETATE", "10 mg/g")])
    b = prod("13925-165", "Seton", [("LIDOCAINE HYDROCHLORIDE", "30 mg/g"), ("HYDROCORTISONE ACETATE", "5 mg/g")])
    same = prod("1-1", "Other", [("HYDROCORTISONE ACETATE", "10 mg/1 g"), ("LIDOCAINE HYDROCHLORIDE", "30mg/g")])
    blank = prod("2-2", "NoStrength", [("LIDOCAINE HYDROCHLORIDE", ""), ("HYDROCORTISONE ACETATE", "10 mg/g")])
    pairs = {frozenset(p.values()) for p in equivalence_pairs([a, b, same, blank])}
    assert pairs == {frozenset({"59088-771", "1-1"})}
