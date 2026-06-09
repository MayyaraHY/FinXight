from __future__ import annotations

import logging
from typing import Optional

from app.ai.account_llm import llm_match, llm_match_batch
from app.core.pcgt_loader import PCGTLoader
from app.services.account_matcher import cache_get, cache_put
from app.services.preparation_service import normalize_string

logger = logging.getLogger(__name__)

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


def _apply_llm(code: str, label: Optional[str], llm: dict) -> dict:
    """Build a _result dict from an llm_match / llm_match_batch response."""
    if llm.get("status") == "matched" and llm.get("code"):
        return _result(
            code, label, INVALID_CODE,
            suggested_code=llm["code"],
            suggested_label=llm["label"],
            confidence=llm.get("confidence", 0.0),
            method="llm",
            reason=llm.get("reason") or f"Code « {code} » absent du PCGT.",
        )
    return _result(
        code, label, UNRESOLVED,
        confidence=0.0,
        method="llm",
        reason=llm.get("reason") or f"Code « {code} » absent du PCGT ; aucune correspondance fiable.",
    )


def validate_account(
    code: str,
    label: Optional[str] = None,
    loader: Optional[PCGTLoader] = None,
) -> dict:
    """
    Validate one account code against the PCGT. Never raises.
    Used for on-demand single-code validation (e.g. PUT /accounts/update).

    Flow:
      1. Code exists in PCGT → valid, done.
      2. Code absent + label present → cache check → llm_match() (single call).
      3. Code absent + no label → invalid_code with no suggestion.
    """
    loader = loader or PCGTLoader()
    code = str(code).strip()

    cand = loader.get_candidates(code)

    if cand.code_exists:
        return _result(code, label, VALID, confidence=100.0, method="rule")

    if label:
        norm_label = normalize_string(label)

        cached = cache_get(norm_label)
        if cached is not None:
            return _result(
                code, label,
                INVALID_CODE if cached.get("code") else UNRESOLVED,
                suggested_code=cached.get("code"),
                suggested_label=cached.get("label"),
                confidence=cached.get("confidence", 0.0),
                method="cache",
                reason=cached.get("reason", ""),
            )

        llm = llm_match(code, label, loader)
        cache_put(norm_label, llm)
        return _apply_llm(code, label, llm)

    return _result(
        code, label, INVALID_CODE,
        confidence=0.0,
        method="rule",
        reason=f"Code « {code} » absent du PCGT.",
    )


def validate_accounts_batch(rows: list[dict], loader: Optional[PCGTLoader] = None) -> dict:
    """
    Validate every parsed account row.

    Flow:
      1. Prefix-check every code (O(1), no LLM).
      2. Collect invalid codes that need an LLM suggestion (cache-miss only).
      3. Call llm_match_batch() ONCE for all of them (one or few Groq requests).
      4. Merge LLM results back and build the final report.

    Returns the report payload stored in ValidationReport.data.
    Only invalid/unresolved lines are kept; valid accounts are counted only.
    """
    loader = loader or PCGTLoader()

    # ── Phase 1: prefix-check every row ──────────────────────────────────────
    phase1: list[dict] = []   # full result for valid/no-label rows
    needs_llm: list[tuple[str, str]] = []   # (code, label) for cache-miss invalids
    needs_llm_idx: list[int] = []            # index into phase1 for merge

    for row in rows:
        code = row.get("account_code")
        label = row.get("label")
        if not code:
            continue

        code = str(code).strip()
        cand = loader.get_candidates(code)

        if cand.code_exists:
            phase1.append(_result(code, label, VALID, confidence=100.0, method="rule"))
            continue

        if not label:
            phase1.append(_result(
                code, label, INVALID_CODE,
                confidence=0.0, method="rule",
                reason=f"Code « {code} » absent du PCGT.",
            ))
            continue

        # Invalid code with a label — check cache first
        norm_label = normalize_string(label)
        cached = cache_get(norm_label)
        if cached is not None:
            phase1.append(_result(
                code, label,
                INVALID_CODE if cached.get("code") else UNRESOLVED,
                suggested_code=cached.get("code"),
                suggested_label=cached.get("label"),
                confidence=cached.get("confidence", 0.0),
                method="cache",
                reason=cached.get("reason", ""),
            ))
            continue

        # Cache miss — needs LLM; reserve a slot in phase1
        needs_llm_idx.append(len(phase1))
        needs_llm.append((code, label))
        phase1.append(None)  # placeholder

    # ── Phase 2: single batch LLM call for all cache-miss invalids ────────────
    if needs_llm:
        llm_results = llm_match_batch(needs_llm, loader)

        for list_idx, (code, label) in zip(needs_llm_idx, needs_llm):
            llm = llm_results.get(code, {"status": "unresolved", "reason": "résultat manquant"})
            result = _apply_llm(code, label, llm)
            phase1[list_idx] = result
            # Populate cache for future uploads
            cache_put(normalize_string(label), llm)

    # ── Phase 3: build report ─────────────────────────────────────────────────
    all_lines = [r for r in phase1 if r is not None]

    valid  = sum(1 for l in all_lines if l["status"] == VALID)
    errors = sum(1 for l in all_lines if l["status"] in ERROR_STATUSES)
    invalid_lines = [l for l in all_lines if l["status"] in ERROR_STATUSES]

    return {
        "summary": {
            "total":  len(all_lines),
            "valid":  valid,
            "errors": errors,
        },
        "lines": invalid_lines,
    }
