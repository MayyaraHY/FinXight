import httpx
import logging
from app.core.config import settings

logger = logging.getLogger(__name__)

AI_SERVICE_URL = settings.AI_SERVICE_URL  # e.g. "http://localhost:8001"


def _post(path: str, payload: dict) -> dict:
    try:
        with httpx.Client(timeout=60.0) as client:
            res = client.post(f"{AI_SERVICE_URL}{path}", json=payload)
            res.raise_for_status()
            return res.json()
    except httpx.TimeoutException:
        raise ValueError("AI service timeout. Réessayez.")
    except httpx.HTTPStatusError as e:
        # The AI service returns the upstream Gemini error as the response body's
        # `detail`. Surface that text so the controller can map it to the right
        # HTTP code for the frontend.
        try:
            detail = e.response.json().get("detail", e.response.text)
        except Exception:
            detail = e.response.text
        if e.response.status_code == 503:
            raise ValueError("Le service IA est temporairement surchargé. Réessayez dans 30 secondes.")
        if e.response.status_code == 429:
            raise ValueError("Limite API atteinte. Réessayez dans 1 minute.")
        raise ValueError(f"AI service error: {detail}")
    except Exception as e:
        logger.error(f"AI service unreachable: {e}")
        raise ValueError("Service IA indisponible.")


def chat(message: str, context: dict) -> str:
    result = _post("/chat", {"message": message, "context": context})
    return result["response"]


def detect_anomalies(comptes: list[dict]) -> list[dict]:
    result = _post("/anomalies/detect", {"comptes": comptes})
    return result.get("anomalies", [])


def analyze_bilan(totals: dict) -> str:
    result = _post("/bilan/analyze", {"totals": totals})
    return result.get("analysis", "")