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

    # AI microservice URL — Gemini-backed chat / anomalies / bilan analysis
    AI_SERVICE_URL = os.getenv("AI_SERVICE_URL", "http://localhost:8001")


settings = Settings()
