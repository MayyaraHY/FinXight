"""
Deterministic bilan validator — runs before any LLM call.

Golden rule: Python calculates, the LLM only explains.
Every function here is pure (no DB, no I/O), unit-testable, and returns a list
of DetectedIssue dataclasses. The LLM receives these pre-computed facts and is
forbidden from inventing new ones.

Sign convention (critical — do not break):
  signed_balance(account) = debit - credit
  → Credit-natured accounts (class 1, 7, passifs) arrive as NEGATIVE numbers.
  → Debit-natured accounts (class 2 assets, 6 charges) arrive as POSITIVE numbers.
  A negative balance on a class-7 account is NORMAL and must NEVER be flagged.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field, asdict
from decimal import Decimal
from pathlib import Path
from typing import Dict, List, Optional, Any

from app.services.balance import signed_balance

logger = logging.getLogger(__name__)

BALANCE_TOLERANCE = Decimal("1.0")


# ---------------------------------------------------------------------------
# Result type
# ---------------------------------------------------------------------------

@dataclass
class DetectedIssue:
    severity: str           # "error" | "warning" | "info"
    account: Optional[str]  # PCGT code, or None for structural issues
    message: str            # French — shown to the accountant
    expected: Optional[str] = None
    actual: Optional[str] = None
    balance: Optional[float] = None  # raw numeric balance, used by downstream checks

    def to_dict(self) -> dict:
        d = asdict(self)
        d.pop("balance", None)  # internal field — not serialised to JSON/DB
        return d


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _extract_rule_prefixes(rules_data: dict) -> List[str]:
    """
    Flatten every account entry from every bilan rule section into a list of
    bare prefixes (no sign, no side annotation).

    Mirrors the stripping done in AccountingRulesLoader.get_account_category:
      "(422 DR)" → "422"
      "-109"     → "109"
      "532 CR"   → "532"
    """
    prefixes: List[str] = []
    _SKIP = frozenset({"label", "note", "_source", "_remarque", "_validation"})

    def walk(obj):
        if not isinstance(obj, dict):
            return
        for field_name in ("comptes_valeurs_brutes", "comptes_amortissements_provisions",
                           "comptes_valeurs_nettes", "comptes_affectation"):
            for entry in obj.get(field_name, []):
                clean = str(entry).replace("(", "").replace(")", "").replace("-", "").strip()
                if " " in clean:
                    clean = clean.split()[0]
                if clean:
                    prefixes.append(clean)
        for k, v in obj.items():
            if k not in _SKIP:
                walk(v)

    walk(rules_data)
    return prefixes


def _is_mapped(account_code: str, prefixes: List[str]) -> bool:
    """True when at least one rule prefix matches the account code."""
    return any(account_code.startswith(p) for p in prefixes)


def _bal(acc) -> Decimal:
    """Convenience wrapper — returns Decimal."""
    v = signed_balance(acc)
    return v if isinstance(v, Decimal) else Decimal(str(v))


# ---------------------------------------------------------------------------
# Check functions
# ---------------------------------------------------------------------------

def find_unmapped_accounts(
    accounts: list,
    rules_data: dict,
) -> List[DetectedIssue]:
    """
    Return one issue per account that matches no bilan rule prefix.
    An unmapped account contributes to the imbalance silently — making it
    visible is the single most important check.
    """
    prefixes = _extract_rule_prefixes(rules_data)
    issues: List[DetectedIssue] = []

    for acc in accounts:
        code = acc.account_code
        bal  = _bal(acc)
        if abs(bal) < BALANCE_TOLERANCE:
            continue  # zero balance — irrelevant
        if not _is_mapped(code, prefixes):
            issues.append(DetectedIssue(
                severity="error",
                account=code,
                message=(
                    f"Compte {code} ({acc.label or '—'}) non mappé dans les règles du bilan. "
                    f"Solde : {float(bal):,.3f} DT. Ce montant ne figure ni à l'actif ni au passif."
                ),
                expected="Présent dans une section du bilan",
                actual=f"Absent de toutes les règles — solde {float(bal):.3f} DT ignoré",
                balance=float(bal),
            ))

    return issues


def check_negative_net_immobilisations(bilan_result: dict) -> List[DetectedIssue]:
    """
    Walk the bilan tree and flag any section whose net amount is negative.
    A negative net immobilisation means depreciation > gross value, which
    indicates a data or rules error (e.g. wrong sign on amortissement).
    """
    issues: List[DetectedIssue] = []

    def walk(node: Any, path: str = "") -> None:
        if not isinstance(node, dict):
            return
        amount = node.get("amount")
        label  = node.get("label", path.split(".")[-1] if path else "?")
        if amount is not None and float(amount) < -BALANCE_TOLERANCE:
            # Only flag immobilisation sections (path contains typical keywords)
            if any(kw in path for kw in ("immob", "actif", "stock", "placement")):
                issues.append(DetectedIssue(
                    severity="error",
                    account=None,
                    message=(
                        f"Section « {label} » affiche une valeur nette négative "
                        f"({float(amount):,.3f} DT). Cause probable : amortissements "
                        f"supérieurs à la valeur brute, ou signe erroné."
                    ),
                    expected="Montant net ≥ 0",
                    actual=f"{float(amount):,.3f} DT",
                ))
        for k, v in node.items():
            if k not in ("label", "amount", "brut", "amort", "net",
                         "used_accounts", "breakdown", "note"):
                walk(v, f"{path}.{k}" if path else k)

    walk(bilan_result)
    return issues


def check_difference_matches_account(
    difference: float,
    unmapped_issues: List[DetectedIssue],
) -> List[DetectedIssue]:
    """
    If the bilan difference equals (within tolerance) the balance of a specific
    unmapped account, point to it explicitly — the root cause is then unambiguous.
    """
    issues: List[DetectedIssue] = []
    for issue in unmapped_issues:
        bal = issue.balance
        if bal is None:
            continue
        if abs(abs(difference) - abs(bal)) < float(BALANCE_TOLERANCE):
            issues.append(DetectedIssue(
                severity="error",
                account=issue.account,
                message=(
                    f"Le déséquilibre de {difference:,.3f} DT correspond exactement au solde "
                    f"du compte non mappé {issue.account}. C'est très probablement la cause directe."
                ),
                expected=f"Compte {issue.account} présent dans les règles du bilan",
                actual=f"Absent → {difference:,.3f} DT non comptabilisé",
            ))
    return issues


def check_sign_anomalies(accounts: list) -> List[DetectedIssue]:
    """
    Detect accounts whose balance sign contradicts their accounting nature.

    Convention:
      Debit accounts (assets, charges) → expected positive balance.
      Credit accounts (liabilities, products) → expected negative balance.

    NEVER flag:
      - Class 6 (charges) with positive balance — that is normal.
      - Class 7 (products) with negative balance — that is normal.
      - Amortissement accounts (28x, 29x, 39x, 49x, 59x) — always credit.
      - Class 1, 4, 5 which are often ambiguous.

    Only flag high-confidence anomalies:
      - Class 2 non-amortissement asset accounts with a credit balance.
    """
    issues: List[DetectedIssue] = []
    AMORTISSEMENT_PREFIXES = ("28", "29", "39", "49", "59")

    for acc in accounts:
        code = acc.account_code
        bal  = _bal(acc)
        if abs(bal) < BALANCE_TOLERANCE:
            continue

        # Class 7: credit (negative) is NORMAL — never flag
        if code.startswith("7"):
            continue
        # Class 6: debit (positive) is normal
        if code.startswith("6"):
            continue
        # Class 1, 4, 5: ambiguous — skip
        if code.startswith(("1", "4", "5")):
            continue
        # Amortissement accounts (2x starting with amort prefix): credit = normal
        if any(code.startswith(p) for p in AMORTISSEMENT_PREFIXES):
            continue

        # Class 2 non-amortissement asset: should be debit (positive)
        if code.startswith("2") and bal < -BALANCE_TOLERANCE:
            issues.append(DetectedIssue(
                severity="warning",
                account=code,
                message=(
                    f"Compte {code} ({acc.label or '—'}) est une immobilisation (classe 2) "
                    f"mais présente un solde créditeur de {float(bal):,.3f} DT. "
                    f"Vérifier si ce compte est un amortissement ou si le signe est erroné."
                ),
                expected="Solde débiteur (positif) pour un actif",
                actual=f"Solde créditeur {float(bal):,.3f} DT",
            ))

    return issues


def check_closure(accounts: list) -> List[DetectedIssue]:
    """
    Detect missing year-end closure: classes 6 and 7 have balances
    but accounts 131 (bénéfice) and 135 (perte) are both zero.
    """
    class6_total = sum(_bal(a) for a in accounts if a.account_code.startswith("6"))
    class7_total = sum(_bal(a) for a in accounts if a.account_code.startswith("7"))
    result_131   = sum(_bal(a) for a in accounts if a.account_code.startswith("131"))
    result_135   = sum(_bal(a) for a in accounts if a.account_code.startswith("135"))
    result_net   = result_131 + result_135

    has_activity = abs(class6_total) > BALANCE_TOLERANCE or abs(class7_total) > BALANCE_TOLERANCE
    result_empty = abs(result_net) < BALANCE_TOLERANCE

    if has_activity and result_empty:
        net = float(class7_total + class6_total)
        return [DetectedIssue(
            severity="warning",
            account="131/135",
            message=(
                f"Clôture manquante : classes 6 ({float(class6_total):,.3f} DT) et "
                f"7 ({float(class7_total):,.3f} DT) ont des soldes mais 131/135 = 0. "
                f"Résultat non viré. Résultat théorique : {net:,.3f} DT."
            ),
            expected="131 ou 135 non nul quand classes 6/7 ont des soldes",
            actual="131 = 135 = 0",
        )]
    return []


def check_netting_violations(accounts: list) -> List[DetectedIssue]:
    """
    Detect compensation actif/passif interdite par NC 01 §21.
    Example: 409 (fournisseurs débiteurs — actif) and 401 (fournisseurs — passif)
    both non-zero suggests they are being offset instead of presented gross.
    """
    issues: List[DetectedIssue] = []

    pairs = [
        ("409", "401", "Fournisseurs débiteurs (409) vs Fournisseurs (401)"),
        ("419", "411", "Clients créditeurs (419) vs Clients (411)"),
    ]
    for debit_prefix, credit_prefix, label in pairs:
        debit_bal = sum(
            _bal(a) for a in accounts if a.account_code.startswith(debit_prefix)
        )
        credit_bal = sum(
            _bal(a) for a in accounts if a.account_code.startswith(credit_prefix)
        )
        # Violation: both sides have non-trivial balances of the expected sign
        if debit_bal > BALANCE_TOLERANCE and credit_bal < -BALANCE_TOLERANCE:
            issues.append(DetectedIssue(
                severity="warning",
                account=f"{debit_prefix}/{credit_prefix}",
                message=(
                    f"Compensation potentielle NC01 §21 — {label} : "
                    f"{debit_prefix} solde {float(debit_bal):,.3f} DT (actif), "
                    f"{credit_prefix} solde {float(credit_bal):,.3f} DT (passif). "
                    f"Présenter les deux postes séparément."
                ),
                expected="Présentation nette interdite",
                actual=f"{debit_prefix}={float(debit_bal):,.3f}, {credit_prefix}={float(credit_bal):,.3f}",
            ))

    return issues


# ---------------------------------------------------------------------------
# Orchestrator
# ---------------------------------------------------------------------------

def run_all_checks(
    accounts: list,
    bilan_result: dict,
    totals: dict,
    rules_data: dict,
) -> List[DetectedIssue]:
    """
    Run every check and return the combined list, ordered by severity.
    This is the single entry point called from bilan_service.calculate_and_save.
    """
    issues: List[DetectedIssue] = []

    unmapped = find_unmapped_accounts(accounts, rules_data)
    issues.extend(unmapped)

    difference = float(totals.get("difference", 0))
    issues.extend(check_difference_matches_account(difference, unmapped))
    issues.extend(check_negative_net_immobilisations(bilan_result))
    issues.extend(check_sign_anomalies(accounts))
    issues.extend(check_closure(accounts))
    issues.extend(check_netting_violations(accounts))

    # Sort: errors first, then warnings, then info
    order = {"error": 0, "warning": 1, "info": 2}
    issues.sort(key=lambda i: order.get(i.severity, 9))

    logger.info(
        "bilan_validator: %d issue(s) — %d error(s), %d warning(s)",
        len(issues),
        sum(1 for i in issues if i.severity == "error"),
        sum(1 for i in issues if i.severity == "warning"),
    )
    return issues
