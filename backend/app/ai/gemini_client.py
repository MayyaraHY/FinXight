from google import genai
from google.genai import types, errors as genai_errors
import json
import logging
from app.ai.prompts import SYSTEM_PROMPT_FR
from app.core.accounting_loader import AccountingRulesLoader
from app.core.config import settings

logger = logging.getLogger(__name__)

# Module-level caches
_client: genai.Client = None
_system_prompt: str = None

VALID_FIELD_NAMES = [
    "account_code", "label", "debit", "credit",
    "solde_debit", "solde_credit", "solde_final",
    "solde_final_debit", "solde_final_credit",
    "opening_debit", "opening_credit",
]


def _build_enriched_prompt() -> str:
    """Inject real account prefixes from bilan_rules.json into the system prompt."""
    try:
        loader = AccountingRulesLoader()
        accounts = loader.get_all_accounts()
        sample = ", ".join(accounts[:50])
        extra = f"\n\nCOMPTES ACTIFS DANS CE SYSTÈME:\n{sample}\n"
        return SYSTEM_PROMPT_FR + extra
    except Exception:
        return SYSTEM_PROMPT_FR


def get_client() -> genai.Client:
    global _client
    if _client is None:
        _client = genai.Client(api_key=settings.GEMINI_API_KEY)
    return _client


def get_system_prompt() -> str:
    global _system_prompt
    if _system_prompt is None:
        _system_prompt = _build_enriched_prompt()
    return _system_prompt


def ask_gemini(prompt: str, context: dict = None) -> str:
    client = get_client()
    full_prompt = prompt
    if context:
        full_prompt = (
            f"Données:\n{json.dumps(context, ensure_ascii=False)}\n\nTâche:\n{prompt}"
        )
    try:
        response = client.models.generate_content(
            model=settings.GEMINI_MODEL_NAME,
            contents=full_prompt,
            config=types.GenerateContentConfig(
                system_instruction=get_system_prompt(),
            ),
        )
        return response.text
    except genai_errors.ClientError as e:
        if e.status_code == 429:
            logger.warning(f"Gemini rate limit: {e}")
            raise ValueError("Limite API atteinte. Réessayez dans 1 minute.")
        logger.error(f"Gemini client error: {e}")
        raise ValueError(f"Erreur IA: {str(e)}")
    except Exception as e:
        logger.error(f"Gemini unexpected error: {e}")
        raise ValueError(f"Erreur IA: {str(e)}")


def gemini_classify_fallback(
    unknown_cols: list,
    df,
    column_mapping: dict,
) -> dict:
    """
    Use Gemini to classify columns the smart classifier returned as 'unknown'.
    One API call per column; only updates mapping when Gemini returns a valid field name.
    """
    updated = dict(column_mapping)
    for col in unknown_cols:
        samples = df[col].dropna().head(5).tolist()
        prompt = (
            f"Nom de colonne: '{col}'\n"
            f"Exemples de valeurs: {samples}\n"
            f"Noms de champs valides: {VALID_FIELD_NAMES}\n\n"
            "Retourne UNIQUEMENT le nom de champ correspondant parmi la liste, "
            "ou 'unknown' si aucun ne correspond. Un seul mot, sans guillemets."
        )
        try:
            result = ask_gemini(prompt).strip().lower().strip("\"'")
            if result in VALID_FIELD_NAMES:
                updated[col] = result
                logger.info(f"Gemini classified '{col}' → '{result}'")
            else:
                logger.info(f"Gemini returned unknown field '{result}' for column '{col}'")
        except Exception as e:
            logger.warning(f"Gemini fallback failed for column '{col}': {e}")
    return updated


def ask_gemini_bilan_analysis(totals: dict) -> str:
    """Generate a French financial narrative + KPIs from balance sheet totals."""
    prompt = (
        "Analyse ces totaux de bilan tunisien et fournis:\n"
        "1. Ratios clés (liquidité générale, autonomie financière, taux d'endettement)\n"
        "2. Score de santé financière (/10) avec justification\n"
        "3. Interprétation en français (2-3 paragraphes)\n"
        "4. 3 recommandations concrètes et actionnables\n\n"
        "Utilise exactement les montants fournis dans tes calculs. Monnaie: TND."
    )
    try:
        return ask_gemini(prompt, context={"totals": totals})
    except Exception as e:
        logger.error(f"Bilan analysis failed: {e}")
        return f"Analyse indisponible: {str(e)}"


def ask_gemini_anomaly_detection(accounts: list) -> str:
    """
    Detect accounting anomalies in a list of account dicts.
    Returns a JSON string: list of {compte, probleme, suggestion}.
    """
    sample = accounts[:100]
    prompt = (
        "Analyse ces comptes du plan comptable tunisien (PCGT) et détecte les anomalies:\n"
        "- Soldes anormaux (ex: actif avec solde créditeur, passif avec solde débiteur)\n"
        "- Codes de compte hors PCGT (pas dans les classes 1-7)\n"
        "- Montants aberrants (nuls sans justification, ou excessivement élevés)\n"
        "- Incohérences entre débit et crédit\n\n"
        "Pour chaque anomalie détectée, fournis: le code compte, le problème exact, "
        "et la correction suggérée.\n"
        "Réponds UNIQUEMENT avec un tableau JSON valide: "
        '[{"compte": "...", "probleme": "...", "suggestion": "..."}]\n'
        "Si aucune anomalie, réponds: []"
    )
    try:
        return ask_gemini(prompt, context={"comptes": sample})
    except Exception as e:
        logger.error(f"Anomaly detection failed: {e}")
        return "[]"
