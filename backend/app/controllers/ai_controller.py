from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db.cnx import get_db
from app.ai.gemini_client import ask_gemini
from app.models.account import Account
from app.repositories.bilan_repository import BilanRepository
from app.repositories.anomaly_repository import get_anomalies

router = APIRouter(prefix="/ai", tags=["AI"])


class ChatRequest(BaseModel):
    message: str
    upload_id: int


@router.post("/chat")
def chat(request: ChatRequest, db: Session = Depends(get_db)):
    """
    Stateless Q&A: context (accounts + bilan totals) is rebuilt from DB on every call.
    No session state required; works correctly with multiple workers.
    """
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
        response = ask_gemini(request.message, context=context)
        return {"success": True, "response": response}
    except ValueError as e:
        raise HTTPException(status_code=429, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/anomalies/{upload_id}")
def get_upload_anomalies(upload_id: int, db: Session = Depends(get_db)):
    """
    Return anomalies detected by the background task for a given upload.
    Returns an empty list if detection has not run yet or found nothing.
    """
    anomalies = get_anomalies(db, upload_id)
    return {
        "success": True,
        "upload_id": upload_id,
        "count": len(anomalies),
        "anomalies": anomalies,
    }
