import os
from dotenv import load_dotenv

load_dotenv()


class Settings:
    APP_NAME = os.getenv("APP_NAME")
    ENV = os.getenv("ENV")

    DATABASE_URL = os.getenv("DATABASE_URL")

    UPLOAD_DIR = os.getenv("UPLOAD_DIR")
    MAX_UPLOAD_SIZE_MB = int(os.getenv("MAX_UPLOAD_SIZE_MB", 100))

    # GROQ — used by classifier_client for cheap CSV column classification
    GROQ_API_KEY = os.getenv("GROQ_API_KEY")

    # Separate GROQ key for custom-metric formula generation. Use a key from a
    # DIFFERENT Groq account/org to isolate rate limits (Groq meters per account,
    # not per key). Falls back to GROQ_API_KEY when unset (dev convenience).
    GROQ_FORMULA_API_KEY = os.getenv("GROQ_FORMULA_API_KEY")

    # ----------------------------------------------------------------
    # Service URLs — every cross-service call reads from here, never
    # hardcodes a host. Set in .env. Missing values fail fast at startup
    # (see _require below) so a typo can never silently default to localhost.
    # ----------------------------------------------------------------

    # AI microservice URL — Gemini-backed chat / anomalies / bilan analysis
    AI_SERVICE_URL = os.getenv("AI_SERVICE_URL")

    # User-service URL — source of JWT signing keys (JWKS) and /auth/* endpoints
    USER_SERVICE_URL = os.getenv("USER_SERVICE_URL")


def _require(name: str, value):
    """Raise at import time if a mandatory env var is missing."""
    if not value:
        raise RuntimeError(
            f"Required environment variable {name} is not set. "
            f"Add it to backend/.env (see backend/.env.example)."
        )
    return value


settings = Settings()

# Fail fast on missing service URLs — better than a 500 on the first request.
_require("AI_SERVICE_URL", settings.AI_SERVICE_URL)
_require("USER_SERVICE_URL", settings.USER_SERVICE_URL)
