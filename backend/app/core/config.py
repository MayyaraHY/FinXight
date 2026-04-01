import os
from dotenv import load_dotenv

load_dotenv()

class Settings:
    APP_NAME = os.getenv("APP_NAME")
    ENV = os.getenv("ENV")

    DATABASE_URL = os.getenv("DATABASE_URL")

    UPLOAD_DIR = os.getenv("UPLOAD_DIR")
    MAX_UPLOAD_SIZE_MB = int(os.getenv("MAX_UPLOAD_SIZE_MB", 100))

settings = Settings()