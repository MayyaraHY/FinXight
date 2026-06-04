"""
Standalone verification for the account-validation pipeline (no pytest needed).

Covers the plan's unit checks:
  * pcgt_loader candidate generation + code_exists
  * fuzzy matcher confidence bands
  * validator statuses (valid / label_mismatch / class_mismatch / invalid_code)
  * HAPPY PATH — a clean file (every code + official label) yields zero
    false positives (this guards the fuzzy thresholds against over-flagging)

The LLM path is NOT exercised here (it requires a live Groq key and is covered by
the graceful-degradation integration check); all cases below resolve via
rule/fuzzy.

Run:  python backend/scripts/test_validation.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

from app.core.pcgt_loader import PCGTLoader  # noqa: E402
from app.services.account_matcher import fuzzy_match  # noqa: E402
from app.services.account_validator import validate_account, validate_accounts_batch  # noqa: E402
from app.services.preparation_service import normalize_string  # noqa: E402

failures: list[str] = []


def check(name: str, cond: bool, detail: str = "") -> None:
    status = "PASS" if cond else "FAIL"
    print(f"  [{status}] {name}" + (f" — {detail}" if detail else ""))
    if not cond:
        failures.append(name)


loader = PCGTLoader()

print("PCGT loader:")
cand_225 = loader.get_candidates("225")
check("225 not in PCGT", cand_225.code_exists is False)
check("225 has class-2 candidates", len(cand_225.candidates) > 0, f"{len(cand_225.candidates)} candidates")
check("401 exists", loader.get_candidates("401").code_exists is True)

print("\nFuzzy matcher:")
cands = loader.get_candidates("532").candidates
r_clean = fuzzy_match(normalize_string("Banques"), cands)
check("clean label scores high", r_clean.confidence == "high" and not r_clean.needs_llm, f"score={r_clean.score}")
r_garbage = fuzzy_match(normalize_string("zzz qqq nonsense"), cands)
check("garbage label needs_llm", r_garbage.needs_llm is True, f"score={r_garbage.score}")

print("\nValidator statuses:")
check("valid", validate_account("532", "Banques")["status"] == "valid")
check("valid (no label)", validate_account("401", None)["status"] == "valid")
lm = validate_account("532", "Comptes bancaires")
check("label_mismatch", lm["status"] == "label_mismatch", lm["status"])
cm = validate_account("601", "Ventes de produits finis")
check("class_mismatch (not label_mismatch)", cm["status"] == "class_mismatch", cm["status"])
ic = validate_account("225", "Terrains nus")
check("invalid_code with suggestion", ic["status"] == "invalid_code" and ic["suggested_code"] is not None, f"sugg={ic['suggested_code']}")

print("\nHappy path — zero false positives (clean file of real PCGT codes+labels):")
clean_rows = [
    {"account_code": a.code, "label": a.label}
    for a in loader.all_accounts()
]
report = validate_accounts_batch(clean_rows)
s = report["summary"]
print(f"  summary: {s}")
check("all valid", s["valid"] == s["total"], f"{s['valid']}/{s['total']}")
check("zero warnings", s["warnings"] == 0)
check("zero errors", s["errors"] == 0)

print("\n" + ("ALL CHECKS PASSED" if not failures else f"FAILED: {failures}"))
sys.exit(1 if failures else 0)
