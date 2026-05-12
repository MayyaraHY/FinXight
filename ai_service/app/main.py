from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routes import chat, anomalies, bilan
import logging

from app.auth.jwks_client import jwks_client

app = FastAPI(title="Financial AI Service")
logger = logging.getLogger(__name__)

@app.on_event("startup")
def warm_jwks_cache():
    try:
        keys = jwks_client.get_signing_keys()
        logger.info("jwks warmup: cached %d key(s)", len(keys))
    except Exception as exc:
        logger.warning("jwks warmup failed (will lazy-fill): %s", exc)

# CORS — only the main backend talks to this service.
# Add other origins (e.g. a staging backend host) here when deploying.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:8000",
        "http://127.0.0.1:8000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(chat.router)
app.include_router(anomalies.router)
app.include_router(bilan.router)


@app.get("/health")
def health():
    return {"status": "ok"}
