"""
Fuzzy label matcher (Phase 3) + in-session cache (Phase 5).

Given a normalised source label and the small candidate subset produced by the
PCGT rule filter (app/core/pcgt_loader.py), pick the best PCGT account by string
similarity. This is the free, deterministic first matching layer; only labels it
cannot confidently resolve are escalated to the LLM (Phase 4).

Similarity uses rapidfuzz.token_sort_ratio — order-insensitive, so
"local location" and "location du local" score highly — over the candidates'
pre-normalised labels.

Confidence bands:
    score >= 90  -> "high",   needs_llm = False
    75..89       -> "medium", needs_llm = False
    < 75         -> "low",    needs_llm = True
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple

from rapidfuzz import fuzz, process

from app.core.pcgt_loader import PCGTAccount

logger = logging.getLogger(__name__)

HIGH_THRESHOLD = 90
MEDIUM_THRESHOLD = 75


@dataclass
class MatchResult:
    code: Optional[str]
    label: Optional[str]
    score: float
    confidence: str        # "high" | "medium" | "low"
    needs_llm: bool


def fuzzy_match(normalized_label: str, candidates: List[PCGTAccount]) -> MatchResult:
    """
    Best fuzzy match of ``normalized_label`` against ``candidates``.

    Returns needs_llm=True (and the best low-confidence guess, for context) when
    no candidate clears the medium threshold, or when there is nothing to match.
    """
    if not normalized_label or not candidates:
        return MatchResult(None, None, 0.0, "low", needs_llm=True)

    # Map normalized_label -> account; process.extractOne works over the keys.
    # Multiple candidates can share a normalized label (rare); keep the first.
    choices: Dict[str, PCGTAccount] = {}
    for acc in candidates:
        choices.setdefault(acc.normalized_label, acc)

    best: Optional[Tuple[str, float, int]] = process.extractOne(
        normalized_label,
        choices.keys(),
        scorer=fuzz.token_sort_ratio,
    )
    if best is None:
        return MatchResult(None, None, 0.0, "low", needs_llm=True)

    matched_label, score, _ = best
    acc = choices[matched_label]

    if score >= HIGH_THRESHOLD:
        confidence, needs_llm = "high", False
    elif score >= MEDIUM_THRESHOLD:
        confidence, needs_llm = "medium", False
    else:
        confidence, needs_llm = "low", True

    return MatchResult(
        code=acc.code,
        label=acc.label,
        score=float(score),
        confidence=confidence,
        needs_llm=needs_llm,
    )


# ---------------------------------------------------------------------------
# Phase 5 — in-session cache
# ---------------------------------------------------------------------------
# Keyed by normalized label. This deduplicates repeated labels within a file and
# gives DETERMINISM WITHIN A SESSION only: it lives for the lifetime of the
# process and is NOT persisted. Across restarts (or model updates) the same
# ambiguous label may resolve differently. A DB-backed persistent cache is a
# deliberate later step, intentionally out of scope for this MVP.

_llm_cache: Dict[str, dict] = {}


def cache_get(normalized_label: str) -> Optional[dict]:
    return _llm_cache.get(normalized_label)


def cache_put(normalized_label: str, result: dict) -> None:
    if normalized_label:
        _llm_cache[normalized_label] = result


def cache_clear() -> None:
    """Test helper — reset the in-session cache."""
    _llm_cache.clear()
