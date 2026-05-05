from google import genai
from google.genai import types, errors as genai_errors
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type,
    before_sleep_log,
)
import json
import logging

from app.prompts.prompts import SYSTEM_PROMPT_FR
from app.core.accounting_loader import AccountingRulesLoader
from app.core.config import settings

logger = logging.getLogger(__name__)

# Module-level caches
_client: genai.Client = None
_system_prompt: str | None = None

# HTTP status codes that mean "this model is unavailable right now,
# but a different model might still work for me."
RETRYABLE_PER_MODEL = {429, 500, 502, 503, 504}


def get_client() -> genai.Client:
    global _client
    if _client is None:
        _client = genai.Client(api_key=settings.GEMINI_API_KEY)
    return _client


def _build_enriched_prompt() -> str:
    """
    Append the first 50 active account prefixes from bilan_rules.json to the
    static system prompt. Gives Gemini concrete examples of the codes it should
    actually expect to see in this system, on top of the generic PCGT primer.

    If loading the rules fails for any reason (file missing, malformed JSON),
    we fall back gracefully to the static SYSTEM_PROMPT_FR — the service
    keeps working, just without the extra hint.
    """
    try:
        loader = AccountingRulesLoader()
        accounts = loader.get_all_accounts()
        sample = ", ".join(accounts[:50])
        return SYSTEM_PROMPT_FR + f"\n\nCOMPTES ACTIFS DANS CE SYSTÈME:\n{sample}\n"
    except Exception as e:
        logger.warning(
            f"Could not enrich prompt with bilan_rules.json ({e}); "
            "falling back to static SYSTEM_PROMPT_FR."
        )
        return SYSTEM_PROMPT_FR


def get_system_prompt() -> str:
    """
    Build (or return cached) system prompt enriched with real account codes
    from bilan_rules.json. Cached at module level — only built once per process.
    """
    global _system_prompt
    if _system_prompt is None:
        _system_prompt = _build_enriched_prompt()
    return _system_prompt


def _status_code(e: Exception) -> int | None:
    """
    Robustly extract the HTTP status code from a google-genai error.

    The SDK has shipped at least three different attribute names across versions
    (`code`, `status_code`, `http_status`). When all of those are missing, the
    error message itself starts with the status code, e.g.
    "429 RESOURCE_EXHAUSTED. {...}", so we parse the first token as a fallback.
    """
    for attr in ("code", "status_code", "http_status"):
        v = getattr(e, attr, None)
        if isinstance(v, int):
            return v
    try:
        return int(str(e).split()[0])
    except (ValueError, IndexError):
        return None


def _model_chain() -> list[str]:
    """Build the ordered list of models to try: primary first, then fallbacks."""
    primary = settings.GEMINI_MODEL_NAME
    fallbacks = [
        m.strip()
        for m in (settings.GEMINI_FALLBACK_MODELS or "").split(",")
        if m.strip() and m.strip() != primary
    ]
    return [primary, *fallbacks]


# Retry only on transient server errors (5xx). 4xx errors like 429 (quota),
# 400 (bad request), 401 (auth) are NOT retried within a single model — those
# need a different model or user action, not patience. The fallback chain in
# _generate_with_fallback handles cross-model retry for 429.
@retry(
    retry=retry_if_exception_type(genai_errors.ServerError),
    stop=stop_after_attempt(2),                      # 2 tries per model
    wait=wait_exponential(multiplier=1, min=1, max=4),
    before_sleep=before_sleep_log(logger, logging.WARNING),
    reraise=True,
)
def _generate_one_model(client: genai.Client, model: str, full_prompt: str) -> str:
    response = client.models.generate_content(
        model=model,
        contents=full_prompt,
        config=types.GenerateContentConfig(
            system_instruction=get_system_prompt(),
        ),
    )
    return response.text


def _generate_with_fallback(client: genai.Client, full_prompt: str) -> str:
    """
    Try each model in the chain. If a model fails with a "this model is
    unavailable for me right now" error (429 quota, 503 overloaded, other 5xx),
    move on to the next model — quotas and overloads are PER MODEL, so the
    next one might still work.

    Non-retryable errors (400 bad request, 401 unauthorized, 403 forbidden)
    fail fast — they indicate a bug or auth problem, not a transient issue.
    """
    chain = _model_chain()
    last_error: Exception | None = None

    for model in chain:
        try:
            logger.info(f"Calling Gemini model: {model}")
            return _generate_one_model(client, model, full_prompt)
        except (genai_errors.ServerError, genai_errors.ClientError) as e:
            code = _status_code(e)
            if code in RETRYABLE_PER_MODEL:
                logger.warning(f"Model '{model}' failed (HTTP {code}), trying next: {e}")
                last_error = e
                continue
            # Non-retryable client error (400/401/403/404 etc.) — bail out.
            raise

    # All models exhausted
    if last_error:
        raise last_error
    raise RuntimeError("No Gemini model available")


def ask_gemini(prompt: str, context: dict = None) -> str:
    """
    Single entry point for all Gemini calls in the AI service.

    Resilience strategy:
      1. Try primary model (GEMINI_MODEL_NAME) — 2 attempts with backoff for 5xx
      2. On 429 or 5xx, walk through GEMINI_FALLBACK_MODELS one by one
      3. Only fail when every model in the chain is exhausted

    Error mapping (after the chain is exhausted):
      - last error 429   → "limite atteinte"  (raised as ValueError)
      - last error 5xx   → "service surchargé"
      - other 4xx        → "erreur IA"
    """
    client = get_client()
    full_prompt = prompt
    if context:
        full_prompt = (
            f"Données:\n{json.dumps(context, ensure_ascii=False)}\n\nTâche:\n{prompt}"
        )
    try:
        return _generate_with_fallback(client, full_prompt)
    except (genai_errors.ServerError, genai_errors.ClientError) as e:
        code = _status_code(e)
        if code == 429:
            logger.warning(f"All Gemini models hit quota: {e}")
            raise ValueError(
                "Quota Gemini épuisé sur tous les modèles. "
                "Réessayez dans 1 minute ou vérifiez votre plan."
            )
        if code in {500, 502, 503, 504}:
            logger.error(f"All Gemini models exhausted (last error: {e})")
            raise ValueError(
                "Le service IA est temporairement surchargé. Réessayez dans 30 secondes."
            )
        logger.error(f"Gemini client error: {e}")
        raise ValueError(f"Erreur IA: {str(e)}")
    except Exception as e:
        logger.error(f"Gemini unexpected error: {e}")
        raise ValueError(f"Erreur IA: {str(e)}")
