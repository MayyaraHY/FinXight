import logging

from fastapi import FastAPI
from app.auth.jwks_client import jwks_client
from app.controllers.upload_controller import router as upload_router
from app.controllers.account_controller import router as account_router
from app.controllers.bilan_controller import router as bilan_router
from app.controllers.ai_controller import router as ai_router
from app.cors.cors_config import setup_cors
from app.db.cnx import Base, engine
from sqlalchemy import text


logger = logging.getLogger(__name__)

app = FastAPI(title="Financial AI Engine")


@app.on_event("startup")
def warm_jwks_cache():
    try:
        keys = jwks_client.get_signing_keys()
        logger.info("jwks warmup: cached %d key(s)", len(keys))
    except Exception as exc:  # pragma: no cover
        logger.warning("jwks warmup failed (will lazy-fill): %s", exc)

#cors config
setup_cors(app)
# create tables automatically (for now)
Base.metadata.create_all(bind=engine)

# Ensure columns added in later migrations exist (safe to run on every startup)
with engine.connect() as _conn:
    _conn.execute(text(
        "ALTER TABLE IF EXISTS anomalies ADD COLUMN IF NOT EXISTS anomalies JSON"
    ))
    _conn.execute(text(
        "ALTER TABLE IF EXISTS anomalies "
        "ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()"
    ))
    _conn.commit()

app.include_router(upload_router)
app.include_router(account_router)
app.include_router(bilan_router)
app.include_router(ai_router)


@app.get("/")
def home():
    return {"message": "Financial AI Engine running"}

@app.get("/test")
def test():
    return {"message": "Backend is connected 🚀"}