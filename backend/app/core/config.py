import os
from dotenv import load_dotenv

load_dotenv()

class Settings:
    APP_NAME = os.getenv("APP_NAME")
    ENV = os.getenv("ENV")

    DATABASE_URL = os.getenv("DATABASE_URL")

    UPLOAD_DIR = os.getenv("UPLOAD_DIR")
    MAX_UPLOAD_SIZE_MB = int(os.getenv("MAX_UPLOAD_SIZE_MB", 100))

    #GEMINI
    GEMINI_MODEL_NAME = os.getenv("GEMINI_MODEL", "gemini-1.5-flash")
    GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

settings = Settings()