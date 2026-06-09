"""
LLM fallback for account matching — Groq.

Strategy:
  1. Code prefix doesn't exist in PCGT → trigger this module.
  2. Use fuzzy ranking to trim PCGT candidates to top 5 (by label similarity).
     Prefers subclass candidates (first 2 digits); falls back to full class if empty.
     This collapses the old two-call subclass→class retry into a single call.
  3. llm_match_batch() accepts all invalid (code, label) pairs at once and sends
     them in a single Groq prompt, returning one suggestion per pair.
  4. Retry with exponential backoff on 429.
  5. Never raises — on any failure returns unresolved so parsing is never blocked.
"""

from __future__ import annotations

import json
import logging
import time
from typing import Dict, List, Optional, Tuple

from groq import Groq

from app.core.config import settings
from app.core.pcgt_loader import PCGTAccount, PCGTLoader
from app.services.account_matcher import fuzzy_match
from app.services.preparation_service import normalize_string

logger = logging.getLogger(__name__)

MODEL = "llama-3.1-8b-instant"
TOP_N_CANDIDATES = 5   # candidates sent to the LLM per invalid code
BATCH_SIZE = 20        # max invalid codes per Groq call
MAX_RETRIES = 3

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


# ---------------------------------------------------------------------------
# Candidate trimming
# ---------------------------------------------------------------------------

def _top_candidates(source_label: str, pool: List[PCGTAccount]) -> List[PCGTAccount]:
    """
    Rank pool by fuzzy label similarity to source_label and return top TOP_N_CANDIDATES.
    Uses the existing fuzzy_match scorer — no LLM involved here.
    """
    if not pool:
        return []
    norm = normalize_string(source_label)
    scored = sorted(pool, key=lambda a: fuzzy_match(norm, [a]).score, reverse=True)
    return scored[:TOP_N_CANDIDATES]


def _get_trimmed_candidates(source_code: str, source_label: str, loader: PCGTLoader) -> List[PCGTAccount]:
    """
    Return top-N candidates for a single invalid code.
    Prefers subclass (first 2 digits); falls back to full class if subclass is empty.
    Single candidate set — no second LLM call needed.
    """
    klass = source_code[0]
    subclass = source_code[:2]

    subclass_pool = loader.get_accounts_by_prefix(subclass)
    pool = subclass_pool if subclass_pool else loader.get_accounts_by_prefix(klass)

    return _top_candidates(source_label, pool)


# ---------------------------------------------------------------------------
# Groq call with retry
# ---------------------------------------------------------------------------

def _call_groq_batch(items: List[Tuple[str, str, List[PCGTAccount]]]) -> List[dict]:
    """
    Single Groq call for a batch of (source_code, source_label, candidates) triples.
    Returns a list of result dicts in the same order as items.
    On any failure, returns _unresolved() for every item in the batch.
    """
    if not items:
        return []

    # Build per-item blocks
    blocks = []
    valid_codes_per_item = []
    by_code_per_item = []

    for idx, (code, label, candidates) in enumerate(items, start=1):
        candidate_lines = "\n".join(f"  {c.code}: {c.label}" for c in candidates)
        blocks.append(
            f"Compte {idx} — Code invalide: {code}, Libellé: {label}\n"
            f"Candidats PCGT:\n{candidate_lines}"
        )
        valid_codes_per_item.append({c.code for c in candidates})
        by_code_per_item.append({c.code: c for c in candidates})

    system = (
        "Tu es un expert-comptable tunisien spécialisé dans le Plan Comptable Général Tunisien (PCGT). "
        "Pour chaque compte invalide, choisis le meilleur candidat PCGT selon le sens du libellé uniquement. "
        "Ignore les chiffres du code invalide. Tu ne peux choisir QUE des codes présents dans la liste de candidats. "
        "Si aucun candidat ne correspond, utilise null. Réponds uniquement en JSON strict."
    )

    user = (
        "Voici les comptes invalides à corriger:\n\n"
        + "\n\n".join(blocks)
        + "\n\nRetourne exactement ce JSON (un objet par compte, dans le même ordre):\n"
        '{"results": [{"source_code": "<code invalide>", "code": "<code PCGT ou null>", '
        '"confidence": <0-100>, "reason": "<explication courte en français>"}]}'
    )

    for attempt in range(MAX_RETRIES):
        try:
            response = get_client().chat.completions.create(
                model=MODEL,
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
                temperature=0,
                response_format={"type": "json_object"},
                max_tokens=150 * len(items),
            )
            raw = response.choices[0].message.content
            parsed = json.loads(raw)
            results_raw = parsed.get("results", [])
            break
        except Exception as e:
            err_str = str(e)
            if "429" in err_str or "rate_limit" in err_str.lower():
                wait = 2 ** attempt
                logger.warning("Groq 429 on attempt %d/%d, waiting %ds", attempt + 1, MAX_RETRIES, wait)
                time.sleep(wait)
                if attempt == MAX_RETRIES - 1:
                    logger.error("Groq rate limit persistent after %d retries", MAX_RETRIES)
                    return [_unresolved("rate limit persistant") for _ in items]
            else:
                logger.warning("Groq batch call failed: %s", e)
                return [_unresolved(f"erreur LLM: {e}") for _ in items]

    # Parse and validate each result
    output = []
    for idx, (code, label, candidates) in enumerate(items):
        raw_r = results_raw[idx] if idx < len(results_raw) else {}
        valid_codes = valid_codes_per_item[idx]
        by_code = by_code_per_item[idx]

        suggested = raw_r.get("code")
        suggested = str(suggested).strip() if suggested not in (None, "", "null") else None
        confidence = raw_r.get("confidence", 0)
        reason = raw_r.get("reason") or ""

        if not suggested or suggested not in valid_codes or len(suggested) < 2:
            output.append(_unresolved(reason or "aucun code valide retourné"))
            continue

        try:
            confidence = float(confidence)
        except (TypeError, ValueError):
            confidence = 0.0

        acc = by_code[suggested]
        output.append({
            "status": "matched",
            "code": acc.code,
            "label": acc.label,
            "confidence": confidence,
            "reason": reason,
        })

    return output


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def llm_match(source_code: str, source_label: str, loader: Optional[PCGTLoader] = None) -> dict:
    """
    Single-code entry point (used by validate_account for on-demand calls).
    Trims candidates to top-5, makes one Groq call with retry.
    Never raises.
    """
    loader = loader or PCGTLoader()
    source_code = str(source_code).strip()

    if not source_code or not source_label:
        return _unresolved("code ou libellé manquant")

    candidates = _get_trimmed_candidates(source_code, source_label, loader)
    if not candidates:
        return _unresolved(f"aucun compte PCGT trouvé pour le code {source_code!r}")

    logger.debug("llm_match %s: %d trimmed candidates", source_code, len(candidates))
    results = _call_groq_batch([(source_code, source_label, candidates)])
    return results[0] if results else _unresolved("erreur inattendue")


def llm_match_batch(
    items: List[Tuple[str, str]],
    loader: Optional[PCGTLoader] = None,
) -> Dict[str, dict]:
    """
    Batch entry point: resolve multiple (source_code, source_label) pairs.
    Sends them to Groq in chunks of BATCH_SIZE to stay within token limits.
    Returns dict keyed by source_code.
    Never raises.
    """
    loader = loader or PCGTLoader()
    if not items:
        return {}

    # Build (code, label, candidates) triples
    triples = []
    for code, label in items:
        code = str(code).strip()
        candidates = _get_trimmed_candidates(code, label, loader)
        if not candidates:
            triples.append((code, label, []))
        else:
            triples.append((code, label, candidates))

    # Separate codes with no candidates (no LLM needed)
    results: Dict[str, dict] = {}
    to_call = [(c, l, cands) for c, l, cands in triples if cands]
    no_cands = [(c, l) for c, l, cands in triples if not cands]

    for code, label in no_cands:
        results[code] = _unresolved(f"aucun compte PCGT trouvé pour le code {code!r}")

    logger.info("llm_match_batch: %d codes → %d Groq call(s)", len(to_call), -(-len(to_call) // BATCH_SIZE))

    # Call in batches
    for i in range(0, len(to_call), BATCH_SIZE):
        chunk = to_call[i:i + BATCH_SIZE]
        batch_results = _call_groq_batch(chunk)
        for (code, label, _), result in zip(chunk, batch_results):
            results[code] = result

    return results
