import httpx
import logging
from app.core.config import settings

logger = logging.getLogger(__name__)

AI_SERVICE_URL = settings.AI_SERVICE_URL  # e.g. "http://localhost:8001"


def _post(path: str, payload: dict, auth_header: str | None = None) -> dict:
    """
    POST to the AI microservice. When `auth_header` is provided, it's forwarded
    as the Authorization header so the AI service's JWT-protected routes accept
    the call. For background tasks (no incoming request), pass None and call
    routes that don't require auth — or implement service-to-service tokens.
    """
    headers = {}
    if auth_header:
        headers["Authorization"] = auth_header
    try:
        # follow_redirects=True so a 307 from FastAPI (caused by a
        # trailing-slash mismatch) is transparently followed instead of
        # being parsed as JSON and crashing.
        with httpx.Client(timeout=60.0, follow_redirects=True) as client:
            res = client.post(
                f"{AI_SERVICE_URL}{path}",
                json=payload,
                headers=headers,
            )
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
        if e.response.status_code == 401:
            # Auth header was missing or rejected by the AI service.
            logger.error(f"AI service rejected our JWT: {detail}")
            raise ValueError("Authentification refusée par le service IA.")
        raise ValueError(f"AI service error: {detail}")
    except Exception as e:
        logger.error(f"AI service unreachable: {e}")
        raise ValueError("Service IA indisponible.")


def chat(message: str, context: dict, auth_header: str | None = None) -> str:
    result = _post(
        "/chat",
        {"message": message, "context": context},
        auth_header=auth_header,
    )
    return result["response"]


def detect_anomalies(comptes: list[dict], auth_header: str | None = None) -> list[dict]:
    result = _post(
        "/anomalies/detect",
        {"comptes": comptes},
        auth_header=auth_header,
    )
    return result.get("anomalies", [])


def analyze_bilan(totals: dict, auth_header: str | None = None) -> str:
    result = _post(
        "/bilan/analyze",
        {"totals": totals},
        auth_header=auth_header,
    )
    return result.get("analysis", "")
