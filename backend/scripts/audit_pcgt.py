"""
PCGT reference audit — run before trusting any validation output.

The whole pipeline's accuracy ceiling is the completeness of
plan_comptables_tunisiens.json: the LLM can only ever suggest a code that exists
in the candidate list, so a missing code reproduces the very "225" problem we are
fixing. This script makes the reference file a first-class deliverable instead of
a checkbox.

It prints:
  * the number of flattened account codes per class (1–7),
  * the total number of codes,
  * a spot-check of a curated list of codes that MUST exist,

and exits non-zero if any spot-check code is missing, so it can gate CI / a
pre-build step.

Run:  python backend/scripts/audit_pcgt.py
"""

import io
import sys
from collections import Counter
from pathlib import Path

# Windows consoles default to cp1252, which cannot encode the accented PCGT
# labels we print. Force UTF-8 so the audit runs identically on every platform.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
else:  # pragma: no cover - older interpreters
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

# Allow running as a plain script: make `app` importable.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.pcgt_loader import PCGTLoader  # noqa: E402

# Codes that must resolve. Includes the tricky ones behind the "225" incident:
# 225 is NOT a real PCGT code; 2234 ("Constructions" sub-account) is the kind of
# real, deeper code an accountant might expect a suggestion to land on.
MUST_EXIST = [
    "101",   # Capital social
    "211",   # Immobilisations incorporelles
    "2234",  # deep construction sub-account (the "225" near-miss target)
    "401",   # Fournisseurs
    "411",   # Clients
    "532",   # Banques (TN code — note: 512 is the French PCG code, not PCGT)
    "601",   # Achats stockés
    "701",   # Ventes de produits finis
]


def main() -> int:
    loader = PCGTLoader()
    accounts = loader.all_accounts()

    per_class = Counter(acc.klass for acc in accounts)

    print("=" * 56)
    print("PCGT AUDIT")
    print("=" * 56)
    print(f"Total flattened codes: {len(accounts)}")
    print("\nAccounts per class:")
    for klass in sorted(per_class):
        print(f"  classe {klass}: {per_class[klass]:>4} codes")

    print("\nSpot-check (must-exist codes):")
    missing = []
    for code in MUST_EXIST:
        acc = loader.get(code)
        exists = acc is not None or loader.code_exists(code)
        mark = "✓" if exists else "✗ MISSING"
        label = acc.label if acc else ("(prefix match)" if exists else "—")
        print(f"  {mark:>9}  {code:<6} {label}")
        if not exists:
            missing.append(code)

    print("=" * 56)
    if missing:
        print(f"FAIL: {len(missing)} must-exist code(s) missing: {missing}")
        print("Enrich plan_comptables_tunisiens.json before proceeding.")
        return 1

    print("OK: all spot-check codes resolve.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
