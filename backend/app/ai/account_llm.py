"""
LLM fallback for account matching — Groq.

Strategy (replaces fuzzy-first flow):
  1. Code prefix doesn't exist in PCGT → trigger this module.
  2. Extract subclass (first 2 digits, e.g. "67" from "673").
  3. If subclass candidates exist → ask Groq to match semantically within subclass.
  4. If subclass has no candidates (e.g. "67" is not a real PCGT subclass) →
     fall back to full class candidates (all "6x" accounts).
  5. Groq matches purely on label semantics — the invalid code's digits are
     irrelevant, only the label meaning drives the suggestion.
  6. Suggested code must be >= 2 digits (never bare class digit like "6").
  7. Returns { suggested_code, suggested_label, confidence, reason } or unresolved.
  8. Never raises — on any failure returns unresolved so parsing is never blocked.
"""

from __future__ import annotations

import json
import logging
from typing import List, Optional

from groq import Groq

from app.core.config import settings
from app.core.pcgt_loader import PCGTAccount, PCGTLoader

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


def _call_groq(source_code: str, source_label: str, candidates: List[PCGTAccount]) -> dict:
    """
    Single Groq call: match source_label semantically against candidates.
    Returns { status, code, label, confidence, reason }.
    Never raises.
    """
    candidate_lines = "\n".join(f"{c.code}: {c.label}" for c in candidates)
    valid_codes = {c.code for c in candidates}
    by_code = {c.code: c for c in candidates}

    system = (
        "Tu es un expert-comptable tunisien spécialisé dans le Plan Comptable Général Tunisien (PCGT). "
        "Un code de compte invalide t'est soumis avec son libellé. "
        "Ignore complètement les chiffres du code source — utilise UNIQUEMENT le sens du libellé "
        "pour choisir le meilleur compte de la liste de candidats. "
        "Tu ne peux choisir QUE des codes présents dans la liste fournie. "
        "Le code suggéré doit avoir au minimum 2 chiffres. "
        "Si aucun candidat ne correspond sémantiquement, retourne null. "
        "Réponds uniquement en JSON strict."
    )

    user = (
        f"Code source (invalide): {source_code}\n"
        f"Libellé source: {source_label}\n\n"
        f"Comptes PCGT candidats (code: libellé officiel):\n{candidate_lines}\n\n"
        "Retourne exactement ce JSON:\n"
        '{"code": "<code candidat ou null>", '
        '"confidence": <0-100>, '
        '"reason": "<explication courte en français>"}'
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
    except Exception as e:
        logger.warning("Groq call failed for %s / %s: %s", source_code, source_label, e)
        return _unresolved(f"erreur LLM: {e}")

    code = parsed.get("code")
    code = str(code).strip() if code not in (None, "", "null") else None
    confidence = parsed.get("confidence", 0)
    reason = parsed.get("reason") or ""

    # Enforce: code must be in candidate list and have >= 2 digits
    if not code or code not in valid_codes or len(code) < 2:
        return _unresolved(reason or "aucun code valide retourné par le LLM")

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


def llm_match(source_code: str, source_label: str, loader: Optional[PCGTLoader] = None) -> dict:
    """
    Entry point: given an invalid PCGT code and its label, suggest the correct
    PCGT code using semantic label matching.

    Flow:
      1. Extract subclass (first 2 digits) → try subclass candidates first.
      2. If no subclass candidates → fall back to full class candidates.
      3. Groq picks best semantic match from whichever candidate set is used.

    Returns:
        { status: "matched"|"unresolved", code, label, confidence, reason }
    Never raises.
    """
    loader = loader or PCGTLoader()
    source_code = str(source_code).strip()

    if not source_code or not source_label:
        return _unresolved("code ou libellé manquant")

    klass = source_code[0]           # e.g. "6"
    subclass = source_code[:2]       # e.g. "67"

    # ── Step 1: try subclass candidates ──────────────────────────────────────
    subclass_candidates = loader.get_accounts_by_prefix(subclass)

    if subclass_candidates:
        logger.debug(
            "llm_match %s: using %d subclass '%s' candidates",
            source_code, len(subclass_candidates), subclass,
        )
        result = _call_groq(source_code, source_label, subclass_candidates)
        if result["status"] == "matched":
            return result
        # Subclass matched nothing → fall through to class-level

    # ── Step 2: fall back to full class candidates ────────────────────────────
    class_candidates = loader.get_accounts_by_prefix(klass)

    if not class_candidates:
        return _unresolved(f"aucun compte PCGT trouvé pour la classe {klass!r}")

    logger.debug(
        "llm_match %s: subclass '%s' unresolved, retrying with %d class '%s' candidates",
        source_code, subclass, len(class_candidates), klass,
    )
    return _call_groq(source_code, source_label, class_candidates)