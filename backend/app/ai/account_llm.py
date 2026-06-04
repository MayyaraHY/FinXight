"""
LLM fallback for account matching (Phase 4) — Groq.

Called by the validator ONLY when the fuzzy matcher cannot confidently resolve a
label (needs_llm=True). The model is constrained to choose from the Phase-2
candidate subset (~10–20 real PCGT accounts), so it cannot invent a code — it can
only pick the best real one or return "unresolved".

Mirrors app/ai/classifier_client.py: singleton Groq client, llama-3.1-8b-instant,
temperature=0, and a try/except that NEVER raises — on any failure we return a
safe "unresolved" result so a flaky/absent LLM can never break parsing.

Model note: 8b-instant is the starting point because the task is heavily
constrained (small candidate list). If spot-checks on hard semantic labels show
it picking plausible-but-wrong codes confidently, bump MODEL for this path only.
"""

from __future__ import annotations

import json
import logging
from typing import List, Optional

from groq import Groq

from app.core.config import settings
from app.core.pcgt_loader import PCGTAccount

logger = logging.getLogger(__name__)

MODEL = "llama-3.1-8b-instant"

_client: Optional[Groq] = None


def get_client() -> Groq:
    global _client
    if _client is None:
        _client = Groq(api_key=settings.GROQ_API_KEY)
    return _client


def _unresolved(reason: str) -> dict:
    return {
        "status": "unresolved",
        "code": None,
        "label": None,
        "confidence": 0.0,
        "reason": reason,
    }


def llm_match(source_code: str, source_label: str, candidates: List[PCGTAccount]) -> dict:
    """
    Ask the LLM to pick the best PCGT code for (source_code, source_label) from
    ``candidates``. Returns:
        {status: "matched"|"unresolved", code, label, confidence, reason}
    Never raises.
    """
    if not candidates:
        return _unresolved("no candidates to choose from")

    # Build a compact, code->label candidate list for the prompt.
    candidate_lines = "\n".join(f"{c.code}: {c.label}" for c in candidates)
    valid_codes = {c.code for c in candidates}
    by_code = {c.code: c for c in candidates}

    system = (
        "You are an expert Tunisian accountant (Plan Comptable Général Tunisien). "
        "Given a source account code and its label, choose the SINGLE best matching "
        "account from the provided candidate list. You may ONLY choose a code that "
        "appears in the candidate list. If none is a reasonable match, return "
        '"unresolved". Respond with strict JSON only.'
    )
    user = (
        f"Source code: {source_code}\n"
        f"Source label: {source_label}\n\n"
        f"Candidates (code: official label):\n{candidate_lines}\n\n"
        "Return JSON exactly: "
        '{"code": "<candidate code or null>", '
        '"confidence": <0-100>, '
        '"reason": "<short French explanation>"}. '
        'Use null for code if unresolved.'
    )

    try:
        response = get_client().chat.completions.create(
            model=MODEL,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            temperature=0,
            response_format={"type": "json_object"},
            max_tokens=200,
        )
        raw = response.choices[0].message.content
        parsed = json.loads(raw)
    except Exception as e:  # noqa: BLE001 - never let the LLM break parsing
        logger.warning("Groq account match failed for %s/%s: %s", source_code, source_label, e)
        return _unresolved(f"llm error: {e}")

    code = parsed.get("code")
    code = str(code).strip() if code not in (None, "", "null") else None
    confidence = parsed.get("confidence", 0)
    reason = parsed.get("reason") or ""

    if not code or code not in valid_codes:
        return _unresolved(reason or "llm returned no in-list code")

    try:
        confidence = float(confidence)
    except (TypeError, ValueError):
        confidence = 0.0

    acc = by_code[code]
    return {
        "status": "matched",
        "code": acc.code,
        "label": acc.label,
        "confidence": confidence,
        "reason": reason,
    }
