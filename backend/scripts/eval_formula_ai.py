"""Evaluate the AI custom-metric formula generator.

Runs a labeled test set through the LIVE generator (Groq) and scores how often
it gets the formula / kind / format / catalog mapping right.

Formulas are compared SEMANTICALLY, not as strings: each expected and predicted
formula is evaluated against many random variable assignments and must agree
numerically. So "a / b" and "(a)/(b)" count as equal, while a wrong formula is
caught even if it looks plausible.

Run from the backend/ directory (needs the .env so GROQ_FORMULA_API_KEY /
GROQ_API_KEY and the service URLs load):

    python scripts/eval_formula_ai.py
    python scripts/eval_formula_ai.py --repeat 3      # stability over 3 runs/case
    python scripts/eval_formula_ai.py --csv out.csv   # also dump per-case rows

NOTE: this calls Groq once per case (× repeat) — it costs tokens / hits the
GROQ_FORMULA_API_KEY rate bucket.
"""

import argparse
import csv
import math
import random
import re
import time

from app.ai import formula_generator
from app.services.custom_metric_service import CustomMetricService

# Variable catalog sent to the generator (key + a human label).
VARIABLES = [{"key": k, "label": v} for k, v in formula_generator.VARIABLE_DEFINITIONS.items()]
ALLOWED = set(formula_generator.VARIABLE_DEFINITIONS.keys())

_TOKEN_OK = re.compile(r"^[\sA-Za-z0-9_().,+\-*/]+$")


# ---------------------------------------------------------------------------
# Gold test set. Add freely. `formula` = a correct reference (any equivalent
# form). `catalog_key` (optional) = the built-in the name should map to.
# Set `oos=True` for out-of-scope metrics that CANNOT be built from the 20
# variables — these are reported for manual review, not auto-graded.
# ---------------------------------------------------------------------------
GOLD = [
    # --- catalog metrics, with name variants / abbreviations / languages ---
    {"name": "ROE", "formula": "resultat_net / capitaux_propres", "kind": "ratio", "catalog_key": "roe"},
    {"name": "Rentabilité des capitaux propres", "formula": "resultat_net / capitaux_propres", "kind": "ratio", "catalog_key": "roe"},
    {"name": "return on equity", "formula": "resultat_net / capitaux_propres", "kind": "ratio", "catalog_key": "roe"},
    {"name": "ROA", "formula": "resultat_net / total_actif", "kind": "ratio", "catalog_key": "roa"},
    {"name": "rentabilité de l'actif", "formula": "resultat_net / total_actif", "kind": "ratio", "catalog_key": "roa"},
    {"name": "Autonomie financière", "formula": "capitaux_propres / total_passif", "kind": "ratio", "catalog_key": "autonomie"},
    {"name": "Endettement", "formula": "dettes / capitaux_propres", "kind": "ratio", "catalog_key": "endettement"},
    {"name": "ratio d'endettement", "formula": "dettes / capitaux_propres", "kind": "ratio", "catalog_key": "endettement"},
    {"name": "gearing", "formula": "dettes / capitaux_propres", "kind": "ratio", "catalog_key": "endettement"},
    {"name": "Taux d'endettement", "formula": "dettes / total_actif", "kind": "ratio", "catalog_key": "taux_endettement"},
    {"name": "Liquidité générale", "formula": "actifs_courants / passifs_courants", "kind": "ratio", "catalog_key": "liquidite_generale"},
    {"name": "current ratio", "formula": "actifs_courants / passifs_courants", "kind": "ratio", "catalog_key": "liquidite_generale"},
    {"name": "Quick ratio", "formula": "(actifs_courants - stocks) / passifs_courants", "kind": "ratio", "catalog_key": "liquidite_reduite"},
    {"name": "Liquidité immédiate", "formula": "liquidites / passifs_courants", "kind": "ratio", "catalog_key": "liquidite_immediate"},
    {"name": "Couverture des immobilisations", "formula": "(capitaux_propres + passifs_non_courants) / actifs_non_courants", "kind": "ratio", "catalog_key": "couverture_immobilisations"},
    {"name": "Rotation des actifs", "formula": "produits_exploitation / total_actif", "kind": "ratio", "catalog_key": "rotation_actifs"},
    {"name": "Marge d'exploitation", "formula": "resultat_exploitation / produits_exploitation", "kind": "ratio", "catalog_key": "marge_exploitation"},
    {"name": "Marge nette", "formula": "resultat_net / produits_exploitation", "kind": "ratio", "catalog_key": "marge_nette"},
    {"name": "Fonds de roulement", "formula": "capitaux_propres + passifs_non_courants - actifs_non_courants", "kind": "kpi", "catalog_key": "fonds_de_roulement"},
    {"name": "BFR", "formula": "stocks + clients - fournisseurs", "kind": "kpi", "catalog_key": "bfr"},
    {"name": "besoin en fonds de roulement", "formula": "stocks + clients - fournisseurs", "kind": "kpi", "catalog_key": "bfr"},
    {"name": "Trésorerie nette", "formula": "(capitaux_propres + passifs_non_courants - actifs_non_courants) - (stocks + clients - fournisseurs)", "kind": "kpi", "catalog_key": "tresorerie_nette"},

    # --- computable but NOT catalog (tests free generation) ---
    {"name": "Part des stocks dans l'actif", "formula": "stocks / total_actif", "kind": "ratio", "catalog_key": None},
    {"name": "Poids des dettes fournisseurs dans le passif", "formula": "fournisseurs / total_passif", "kind": "ratio", "catalog_key": None},
    {"name": "Couverture des intérêts par les liquidités", "formula": "liquidites / concours_bancaires", "kind": "ratio", "catalog_key": None},

    # --- out of scope (cannot be built from the 20 variables) ---
    {"name": "Marge brute", "oos": True},
    {"name": "Rotation des stocks", "oos": True},
    {"name": "Délai moyen de paiement fournisseurs", "oos": True},
    {"name": "Excédent brut d'exploitation", "oos": True},
]


def _eval(formula: str, env: dict):
    return eval(formula, {"__builtins__": {}}, env)  # noqa: S307 — local test, tokens pre-checked


def _sample() -> float:
    """Random input drawn from positive, negative, and (occasionally) zero — so
    the comparison exercises sign handling and division-by-zero parity, not just
    the happy positive path."""
    return random.choice([
        random.uniform(1.0, 1000.0),
        random.uniform(-1000.0, -1.0),
        0.0,
    ])


def semantic_equal(f1: str, f2: str, trials: int = 40) -> bool:
    """True if the two formulas agree numerically over random inputs (positive,
    negative, zero). Trials where BOTH sides are undefined (e.g. the same
    division by zero) are inconclusive and skipped rather than counted unequal."""
    if not f1 or not f2 or not _TOKEN_OK.match(f1) or not _TOKEN_OK.match(f2):
        return False
    checked = 0
    for _ in range(trials):
        env = {k: _sample() for k in ALLOWED}
        env.update({"abs": abs, "min": min, "max": max})
        try:
            v1 = _eval(f1, env)
        except Exception:
            v1 = None
        try:
            v2 = _eval(f2, env)
        except Exception:
            v2 = None
        if v1 is None and v2 is None:
            continue  # both undefined → inconclusive
        if v1 is None or v2 is None:
            return False
        checked += 1
        if not math.isclose(v1, v2, rel_tol=1e-9, abs_tol=1e-9):
            return False
    return checked > 0


def run_once():
    rows, lat = [], []
    for case in GOLD:
        name = case["name"]
        t0 = time.time()
        try:
            raw = formula_generator.generate_metric_json(name, VARIABLES)
            pred = CustomMetricService._normalize_generated(raw)
            err = None
        except Exception as e:  # noqa: BLE001
            raw, pred, err = {}, {}, str(e)
        dt = time.time() - t0
        lat.append(dt)

        oos = case.get("oos", False)
        row = {
            "name": name,
            "oos": oos,
            "pred_formula": pred.get("formula", ""),
            "pred_kind": pred.get("kind", ""),
            "pred_catalog_key": raw.get("catalog_key"),
            "error": err,
            "latency_s": round(dt, 2),
        }
        if not oos and not err:
            row["formula_ok"] = semantic_equal(case["formula"], pred.get("formula", ""))
            row["kind_ok"] = pred.get("kind") == case["kind"]
            if "catalog_key" in case:
                row["catalog_ok"] = raw.get("catalog_key") == case["catalog_key"]
        rows.append(row)
    return rows, lat


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--repeat", type=int, default=1, help="runs per case (stability)")
    ap.add_argument("--csv", help="write per-case rows to this CSV")
    args = ap.parse_args()

    random.seed(12345)  # reproducible random inputs for semantic comparison
    all_rows = []
    for r in range(args.repeat):
        if args.repeat > 1:
            print(f"\n=== run {r + 1}/{args.repeat} ===")
        rows, lat = run_once()
        all_rows.extend(rows)
        _report(rows, lat)

    if args.csv:
        keys = sorted({k for row in all_rows for k in row})
        with open(args.csv, "w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=keys)
            w.writeheader()
            w.writerows(all_rows)
        print(f"\nWrote {len(all_rows)} rows → {args.csv}")


def _pct(n, d):
    return f"{(100 * n / d):.0f}%" if d else "—"


def _report(rows, lat):
    graded = [r for r in rows if not r["oos"] and r.get("error") is None]
    f_ok = sum(1 for r in graded if r.get("formula_ok"))
    k_ok = sum(1 for r in graded if r.get("kind_ok"))
    cat = [r for r in graded if "catalog_ok" in r]
    c_ok = sum(1 for r in cat if r["catalog_ok"])

    print(f"\nGraded {len(graded)} in-scope cases:")
    print(f"  Formula correct : {f_ok}/{len(graded)}  ({_pct(f_ok, len(graded))})")
    print(f"  Kind correct    : {k_ok}/{len(graded)}  ({_pct(k_ok, len(graded))})")
    print(f"  Catalog mapping : {c_ok}/{len(cat)}  ({_pct(c_ok, len(cat))})")
    print(f"  Avg latency     : {sum(lat) / len(lat):.2f}s  (total {sum(lat):.1f}s)")

    bad = [r for r in graded if not r.get("formula_ok")]
    if bad:
        print("\n  WRONG FORMULAS:")
        for r in bad:
            print(f"   - {r['name']!r}")
            print(f"       predicted: {r['pred_formula']}   (catalog_key={r['pred_catalog_key']})")
    errs = [r for r in rows if r.get("error")]
    if errs:
        print("\n  ERRORS:")
        for r in errs:
            print(f"   - {r['name']!r}: {r['error']}")
    oos = [r for r in rows if r["oos"]]
    if oos:
        print("\n  OUT-OF-SCOPE (manual review — should ideally refuse or stay generic):")
        for r in oos:
            print(f"   - {r['name']!r} → {r['pred_formula']}  (catalog_key={r['pred_catalog_key']})")


if __name__ == "__main__":
    main()
