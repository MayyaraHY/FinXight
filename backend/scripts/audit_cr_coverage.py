"""
One-off coverage audit (not runtime). For every class-6/7 account in
core/plan_comptables_tunisiens.json, check whether the CR prefix index captures
it — in BOTH permanent and intermittent inventory modes. Prints the orphans so
cr_rules.json can be completed, each addition citing the maquette.

Run:  python scripts/audit_cr_coverage.py
"""
import json
import sys
from pathlib import Path

APP = Path(__file__).resolve().parent.parent / "app"
CORE = APP / "core"


def leaf_codes(plan: dict) -> dict:
    """Flatten the plan comptable into {code: label} for classes 6 and 7,
    including sub_accounts (the most specific codes)."""
    out = {}
    for cls in ("classe_6", "classe_7"):
        cats = plan.get(cls, {}).get("categories", {})
        for cat in cats.values():
            for code, val in cat.get("accounts", {}).items():
                if isinstance(val, dict):
                    label = val.get("label", "")
                    subs = val.get("sub_accounts", {})
                    if subs:
                        for sc, sl in subs.items():
                            out[sc] = sl
                    else:
                        out[code] = label
                else:
                    out[code] = val
    return out


def build_index(rules, mode):
    idx = []
    for rule in rules:
        if rule["type"] not in ("computed", "stock_variation"):
            continue
        if "comptes_permanent" in rule:
            codes = rule.get("comptes_permanent" if mode == "permanent"
                             else "comptes_intermittent", [])
        else:
            codes = rule.get("comptes", [])
        for e in codes:
            idx.append((e.lstrip("-"), rule["line_id"]))
    idx.sort(key=lambda x: len(x[0]), reverse=True)
    return idx


def line_for(code, idx):
    for prefix, line_id in idx:
        if code.startswith(prefix):
            return line_id
    return None


# Gross stockable purchases legitimately have NO line in permanent inventory:
# under that method only the stock-variation accounts (603x) feed achats consommés.
# A balance on these in permanent mode is itself an error the mode-contradiction
# warning catches, so they are expected orphans here, not a coverage gap.
EXPECTED_PERMANENT_ORPHAN_PREFIXES = ("601", "602", "604", "607")


def is_expected_permanent_orphan(code: str) -> bool:
    return code.startswith(EXPECTED_PERMANENT_ORPHAN_PREFIXES)


def main():
    plan = json.loads((CORE / "plan_comptables_tunisiens.json")
                      .read_text(encoding="utf-8"))["plan_comptable_tunisien"]
    rules = json.loads((CORE / "cr_rules.json")
                       .read_text(encoding="utf-8"))["compte_resultat_tunisien"]["lines"]

    codes = leaf_codes(plan)
    unexpected = False
    for mode in ("permanent", "intermittent"):
        idx = build_index(rules, mode)
        orphans = {c: lbl for c, lbl in sorted(codes.items())
                   if line_for(c, idx) is None}
        print(f"\n=== mode={mode}: {len(orphans)} orphan(s) / {len(codes)} comptes ===")
        for c, lbl in orphans.items():
            ok = mode == "permanent" and is_expected_permanent_orphan(c)
            tag = "  (attendu: achat brut, inventaire permanent)" if ok else "  <-- LACUNE"
            print(f"  {c:8} {lbl}{tag}")
            if not ok:
                unexpected = True

    print("\nRésultat:", "LACUNE(S) DÉTECTÉE(S)" if unexpected else "OK (couverture complète)")
    return 1 if unexpected else 0


if __name__ == "__main__":
    sys.exit(main())
