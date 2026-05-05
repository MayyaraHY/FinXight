from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    APP_NAME: str = "Financial AI Service"

    # Gemini — required, no default. Pydantic reads GEMINI_API_KEY from .env.
    GEMINI_API_KEY: str

    # Primary model. Override in .env with: GEMINI_MODEL_NAME=gemini-2.0-flash
    GEMINI_MODEL_NAME: str = "gemini-1.5-flash"

    # Comma-separated fallback chain when the primary model returns 503.
    # Tried in order; first one that responds wins.
    GEMINI_FALLBACK_MODELS: str = "gemini-2.0-flash,gemini-1.5-flash"

    PORT: int = 8001

    # Optional: audit DB to log every AI request/response
    DATABASE_URL: str = ""

    class Config:
        env_file = ".env"
        extra = "ignore"   # ignore unknown env vars like APP_NAME


settings = Settings()
