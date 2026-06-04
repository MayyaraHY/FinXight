"""
Account validator — code existence check only.

Validates each account code against the PCGT. Labels are intentionally NOT
checked: the source file's labels are ERP-generated and often differ from the
official PCGT wording; flagging them produced noise with no actionable value.

The only question asked is: does this code exist in the PCGT?
  valid        — code exists (exact, analytic-suffix, or zero-padded ERP variant)
  invalid_code — code is genuinely absent; a suggestion is provided via fuzzy/LLM
  unresolved   — code absent and no confident suggestion found
"""

from __future__ import annotations

import logging
from typing import Optional

from app.ai.account_llm import llm_match
from app.core.pcgt_loader import PCGTLoader
from app.services.account_matcher import (
    HIGH_THRESHOLD,
    cache_get,
    cache_put,
    fuzzy_match,
)
from app.services.preparation_service import normalize_string

logger = logging.getLogger(__name__)

STRONG_SUGGESTION_SCORE = HIGH_THRESHOLD  # 90

VALID        = "valid"
INVALID_CODE = "invalid_code"
UNRESOLVED   = "unresolved"

ERROR_STATUSES = frozenset({INVALID_CODE, UNRESOLVED})


def _result(
    source_code: str,
    source_label: Optional[str],
    status: str,
    *,
    suggested_code: Optional[str] = None,
    suggested_label: Optional[str] = None,
    confidence: float = 0.0,
    method: str = "rule",
    reason: str = "",
) -> dict:
    return {
        "source_code": source_code,
        "source_label": source_label,
        "status": status,
        "suggested_code": suggested_code,
        "suggested_label": suggested_label,
        "confidence": round(float(confidence), 1),
        "method": method,
        "reason": reason,
    }


def validate_account(
    code: str,
    label: Optional[str] = None,
    loader: Optional[PCGTLoader] = None,
) -> dict:
    """Validate one account code against the PCGT. Never raises."""
    loader = loader or PCGTLoader()
    code = str(code).strip()

    cand = loader.get_candidates(code)

    # ── Code exists (exact, analytic suffix, or zero-padded) ──────────────
    if cand.code_exists:
        return _result(code, label, VALID, confidence=100.0, method="rule")

    # ── Code genuinely absent — suggest a correction ──────────────────────
    norm_label = normalize_string(label) if label else ""

    # 1. Strong fuzzy match within the same class (free, no LLM call)
    if norm_label:
        fz = fuzzy_match(norm_label, cand.candidates)
        if fz.code and fz.score >= STRONG_SUGGESTION_SCORE:
            return _result(
                code, label, INVALID_CODE,
                suggested_code=fz.code,
                suggested_label=fz.label,
                confidence=fz.score, method="fuzzy",
                reason=f"Code « {code} » absent du PCGT.",
            )

        # 2. Cache → LLM fallback
        cached = cache_get(norm_label)
        if cached is not None:
            return _result(
                code, label,
                INVALID_CODE if cached.get("code") else UNRESOLVED,
                suggested_code=cached.get("code"),
                suggested_label=cached.get("label"),
                confidence=cached.get("confidence", 0.0), method="cache",
                reason=cached.get("reason", ""),
            )

        llm = llm_match(code, label or "", cand.candidates)
        cache_put(norm_label, llm)
        if llm.get("status") == "matched" and llm.get("code"):
            return _result(
                code, label, INVALID_CODE,
                suggested_code=llm["code"],
                suggested_label=llm["label"],
                confidence=llm.get("confidence", 0.0), method="llm",
                reason=llm.get("reason") or f"Code « {code} » absent du PCGT.",
            )
        return _result(
            code, label, UNRESOLVED,
            confidence=0.0, method="llm",
            reason=llm.get("reason") or f"Code « {code} » absent du PCGT ; aucune correspondance fiable.",
        )

    # No label available — flag without a suggestion
    return _result(
        code, label, INVALID_CODE,
        confidence=0.0, method="rule",
        reason=f"Code « {code} » absent du PCGT.",
    )


def validate_accounts_batch(rows: list[dict], loader: Optional[PCGTLoader] = None) -> dict:
    """
    Validate every parsed account row. Returns the report payload stored in
    ValidationReport.data. Only invalid codes are kept in `lines` to keep the
    report small; valid accounts are counted but not listed.
    """
    loader = loader or PCGTLoader()
    all_lines = [
        validate_account(r.get("account_code"), r.get("label"), loader)
        for r in rows
        if r.get("account_code")
    ]

    valid  = sum(1 for l in all_lines if l["status"] == VALID)
    errors = sum(1 for l in all_lines if l["status"] in ERROR_STATUSES)

    # Only store the problematic lines — valid ones don't need to be in the DB.
    invalid_lines = [l for l in all_lines if l["status"] in ERROR_STATUSES]

    return {
        "summary": {
            "total":  len(all_lines),
            "valid":  valid,
            "errors": errors,
        },
        "lines": invalid_lines,
    }
