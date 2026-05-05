from groq import Groq
from app.core.config import settings
import logging

logger = logging.getLogger(__name__)

VALID_FIELD_NAMES = [
    "account_code", "label", "debit", "credit",
    "solde_debit", "solde_credit", "solde_final",
    "solde_final_debit", "solde_final_credit",
    "opening_debit", "opening_credit",
]

_client: Groq = None

def get_client() -> Groq:
    global _client
    if _client is None:
        _client = Groq(api_key=settings.GROQ_API_KEY)
    return _client


def classify_columns(unknown_cols: list, df, column_mapping: dict) -> dict:
    client = get_client()
    updated = dict(column_mapping)

    for col in unknown_cols:
        samples = df[col].dropna().head(5).tolist()
        prompt = (
            f"Column name: '{col}'\n"
            f"Sample values: {samples}\n"
            f"Valid field names: {VALID_FIELD_NAMES}\n\n"
            "Return ONLY the matching field name from the list, "
            "or 'unknown' if none match. One word, no quotes."
        )
        try:
            response = client.chat.completions.create(
                model="llama-3.1-8b-instant",
                messages=[{"role": "user", "content": prompt}],
                max_tokens=20,
                temperature=0,   # deterministic — right answer every time
            )
            result = response.choices[0].message.content.strip().lower().strip("\"'")
            if result in VALID_FIELD_NAMES:
                updated[col] = result
                logger.info(f"Groq classified '{col}' → '{result}'")
            else:
                logger.info(f"Groq returned unknown field '{result}' for column '{col}'")
        except Exception as e:
            logger.warning(f"Groq fallback failed for column '{col}': {e}")

    return updated