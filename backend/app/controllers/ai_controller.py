import logging

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import CurrentUser, assert_upload_owned, current_user
from app.db.cnx import get_db
from app.ai.ai_service_client import chat as ai_chat
from app.models.account import Account
from app.repositories.bilan_repository import BilanRepository
from app.repositories.anomaly_repository import get_anomalies

logger = logging.getLogger(__name__)

# Router-level auth: every endpoint below requires a valid JWT.
router = APIRouter(
    prefix="/ai",
    tags=["AI"],
    dependencies=[Depends(current_user)],
)


class ChatRequest(BaseModel):
    message: str
    upload_id: int


@router.post("/chat")
def chat(
    request: ChatRequest,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(current_user),
    authorization: str | None = Header(default=None),
):
    """
    Stateless Q&A: context (accounts + bilan totals) is rebuilt from DB on every call.
    No session state required; works correctly with multiple workers.
    """
    logger.info("ai/chat upload_id=%s by user_id=%s", request.upload_id, user.id)
    assert_upload_owned(db, request.upload_id, user)
    accounts = (
        db.query(Account)
        .filter(Account.upload_id == request.upload_id)
        .limit(50)
        .all()
    )
    if not accounts:
        raise HTTPException(
            status_code=404,
            detail=f"No accounts found for upload_id {request.upload_id}",
        )

    bilan_repo = BilanRepository(db)
    bilan = bilan_repo.get_by_upload_id(request.upload_id)

    context = {
        "comptes": [
            {
                "code": a.account_code,
                "label": a.label,
                "solde": float(a.solde_final or 0),
            }
            for a in accounts
        ],
        "bilan_totaux": bilan.data.get("totals") if bilan and bilan.data else None,
    }

    try:
        # Forward the incoming JWT to the AI service so its JWT-protected
        # routes accept the call (the AI service runs its own current_user
        # dependency against the same JWKS).
        response = ai_chat(request.message, context=context, auth_header=authorization)
        return {"success": True, "response": response}
    except ValueError as e:
        # Map AI-service errors to meaningful HTTP codes for the frontend.
        msg = str(e)
        if "surchargé" in msg:
            # Gemini 503 — transient overload, surface as 503 to the frontend
            # so it can show a "try again in 30s" hint.
            raise HTTPException(status_code=503, detail=msg)
        if "Limite" in msg:
            # Gemini 429 — quota / per-minute limit on your account.
            raise HTTPException(status_code=429, detail=msg)
        raise HTTPException(status_code=502, detail=msg)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/anomalies/{upload_id}")
def get_upload_anomalies(
    upload_id: int,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(current_user),
):
    """
    Return anomalies detected by the background task for a given upload.
    Returns an empty list if detection has not run yet or found nothing.
    """
    assert_upload_owned(db, upload_id, user)
    anomalies = get_anomalies(db, upload_id)
    return {
        "success": True,
        "upload_id": upload_id,
        "count": len(anomalies),
        "anomalies": anomalies,
    }
