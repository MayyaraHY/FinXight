"""
Per-line reconciliation between bilan rules and the source-file Rubrique column.

Design invariants (do not break):
  1. The RULES are the authority. When a rule matches, ``category_label`` is
     always the rule's label, regardless of what the Rubrique says.
  2. The Rubrique is used as a placement fallback ONLY when no rule matches.
  3. A ``status`` of "discrepancy" or "unmapped" NEVER changes an amount or
     its placement (when a rule exists).
  4. This module has NO database or I/O dependencies — it is fully unit-testable.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import TYPE_CHECKING, Optional

if TYPE_CHECKING:
    from app.core.accounting_loader import AccountingRulesLoader
    from app.models.account import Account

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Result type
# ---------------------------------------------------------------------------

@dataclass
class ClassificationResult:
    account: "Account"
    category_label: Optional[str]   # which SCE category receives this amount
    node_path: Optional[str]         # dot-path into the rules tree (for debugging)
    source_rubrique: Optional[str]   # raw Rubrique from source file
    status: str                      # "ok" | "discrepancy" | "unmapped"
    warning: Optional[str]           # human-readable explanation; None when ok


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _labels_agree(norm_rubrique: str, norm_label: str) -> bool:
    """
    Return True when the rubrique and the rule label are semantically consistent.
    Exact equality is a match; containment in either direction is also a match
    (e.g. "amortissement des immobilisations incorporelles" contains
    "immobilisations incorporelles", so they agree even though the strings differ).
    """
    return norm_rubrique == norm_label or norm_label in norm_rubrique or norm_rubrique in norm_label


# ---------------------------------------------------------------------------
# Core function
# ---------------------------------------------------------------------------

def classify_and_reconcile(
    account: "Account",
    loader: "AccountingRulesLoader",
) -> ClassificationResult:
    """
    Classify one account by rules, compare to the source Rubrique, and return
    a ClassificationResult with a status and optional warning message.

    States:
      ok              — rule matches; Rubrique agrees or is absent.
      discrepancy     — rule matches; Rubrique disagrees (rule used, warning emitted).
      unmapped        — no rule match; placed by Rubrique (UNVERIFIED) or excluded.
      compte_resultat — class 6/7 account; belongs to income statement, not bilan.
    """
    code = account.account_code
    rubrique = getattr(account, "source_rubrique", None)
    if rubrique:
        rubrique = rubrique.strip() or None

    # ── Compte résultat (class 6 & 7) — excluded from bilan by design ────────
    if code and code[:1] in ("6", "7"):
        return ClassificationResult(
            account=account,
            category_label=None,
            node_path=None,
            source_rubrique=rubrique,
            status="compte_resultat",
            warning=None,
        )

    rule = loader.get_account_category(code)

    # ── Rule found ────────────────────────────────────────────────────────────
    if rule:
        label = rule["label"]
        path  = rule["node_path"]

        if rubrique and not _labels_agree(loader.normalize_label(rubrique), loader.normalize_label(label)):
            warning = (
                f"Compte {code} : règles SCE → '{label}', "
                f"fichier source (Rubrique) → '{rubrique}'. Règles appliquées."
            )
            logger.debug(warning)
            return ClassificationResult(
                account=account,
                category_label=label,
                node_path=path,
                source_rubrique=rubrique,
                status="discrepancy",
                warning=warning,
            )

        return ClassificationResult(
            account=account,
            category_label=label,
            node_path=path,
            source_rubrique=rubrique,
            status="ok",
            warning=None,
        )

    # ── No rule — try Rubrique fallback ──────────────────────────────────────
    if rubrique:
        label_index = loader.build_label_index()
        path = label_index.get(loader.normalize_label(rubrique))
        if path:
            warning = (
                f"Compte {code} : absent des règles SCE, "
                f"affecté via Rubrique '{rubrique}' (NON VÉRIFIÉ)."
            )
            logger.debug(warning)
            return ClassificationResult(
                account=account,
                category_label=rubrique,
                node_path=path,
                source_rubrique=rubrique,
                status="unmapped",
                warning=warning,
            )

    # ── Nothing — exclude from totals ────────────────────────────────────────
    warning = (
        f"Compte {code} : absent des règles SCE et sans Rubrique utilisable. "
        f"Exclu des totaux."
    )
    logger.debug(warning)
    return ClassificationResult(
        account=account,
        category_label=None,
        node_path=None,
        source_rubrique=rubrique,
        status="unmapped",
        warning=warning,
    )


# ---------------------------------------------------------------------------
# Batch helper
# ---------------------------------------------------------------------------

def reconcile_all(
    accounts: list["Account"],
    loader: "AccountingRulesLoader",
) -> list[ClassificationResult]:
    """Run classify_and_reconcile for every account and return the full list."""
    return [classify_and_reconcile(acc, loader) for acc in accounts]


def build_data_quality(
    results: list[ClassificationResult],
    has_rubrique_column: bool,
) -> dict:
    """
    Aggregate the per-line reconciliation results into a data_quality summary
    dict that is embedded in the bilan response.
    """
    lines = [
        {
            "code":            r.account.account_code,
            "label":           r.account.label,
            "category":        r.category_label,
            "source_rubrique": r.source_rubrique,
            "status":          r.status,
            "warning":         r.warning,
        }
        for r in results
    ]

    flagged = [l for l in lines if l["status"] not in ("ok", "compte_resultat")]
    discrepancy_count = sum(1 for r in results if r.status == "discrepancy")
    unmapped_count    = sum(1 for r in results if r.status == "unmapped")

    return {
        "rubrique_present":  has_rubrique_column,
        "discrepancy_count": discrepancy_count,
        "unmapped_count":    unmapped_count,
        "flagged_lines":     flagged,
        "lines":             lines,
    }
