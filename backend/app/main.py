import logging

from fastapi import FastAPI
from app.auth.jwks_client import jwks_client
from app.controllers.upload_controller import router as upload_router
from app.controllers.account_controller import router as account_router
from app.controllers.bilan_controller import router as bilan_router
from app.controllers.compte_resultat_controller import router as cr_router
from app.controllers.ai_controller import router as ai_router
from app.controllers.company_controller import router as company_router
from app.controllers.export_controller import router as export_router
from app.controllers.validation_controller import router as validation_router
from app.controllers.timeline_controller import router as timeline_router
from app.controllers.cashflow_controller import router as cashflow_router
from app.cors.cors_config import setup_cors
from app.db.cnx import Base, engine


logger = logging.getLogger(__name__)

app = FastAPI(title="Financial AI Engine")

# ── CORS must be registered before routers ──────────────────────────
setup_cors(app)

# ── Auto-create any missing tables on startup ────────────────────────
# Creates tables that don't exist yet. Does NOT alter existing tables.
# If you add or rename a column, alter the table manually in psql.
Base.metadata.create_all(bind=engine)

# ── JWKS warmup ──────────────────────────────────────────────────────
@app.on_event("startup")
def warm_jwks_cache():
    try:
        keys = jwks_client.get_signing_keys()
        logger.info("jwks warmup: cached %d key(s)", len(keys))
    except Exception as exc:
        logger.warning("jwks warmup failed (will lazy-fill): %s", exc)

# ── Routers ──────────────────────────────────────────────────────────
app.include_router(upload_router)
app.include_router(account_router)
app.include_router(bilan_router)
app.include_router(ai_router)
app.include_router(cr_router)
app.include_router(company_router)
app.include_router(timeline_router)
app.include_router(cashflow_router)
app.include_router(export_router)
app.include_router(validation_router)
# ── Public health endpoints ───────────────────────────────────────────
@app.get("/")
def home():
    return {"message": "Financial AI Engine running"}

@app.get("/test")
def test():
    return {"message": "Backend is connected 🚀"}
