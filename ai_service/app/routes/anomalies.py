import json
import logging
from fastapi import APIRouter, HTTPException

from app.models.requests import AnomalyDetectRequest, AnomalyDetectResponse
from app.core.gemini_client import ask_gemini
from app.prompts.prompts import ANOMALY_DETECTION_PROMPT

from fastapi import Depends
from app.auth import CurrentUser, current_user

logger = logging.getLogger(__name__)
router = APIRouter(
    prefix="/anomalies",   
    tags=["Anomalies"],    
    dependencies=[Depends(current_user)]
)


@router.post("/detect", response_model=AnomalyDetectResponse)
def detect_anomalies(req: AnomalyDetectRequest):
    try:
        raw = ask_gemini(ANOMALY_DETECTION_PROMPT, context={"comptes": req.comptes[:100]})
    except ValueError as e:
        msg = str(e)
        if "surchargé" in msg:
            raise HTTPException(status_code=503, detail=msg)
        if "Limite" in msg:
            raise HTTPException(status_code=429, detail=msg)
        raise HTTPException(status_code=502, detail=msg)

    try:
        anomalies = json.loads(raw) if raw.strip().startswith("[") else []
    except json.JSONDecodeError as e:
        logger.warning(
            f"Anomaly detection returned malformed JSON; raw response: {raw!r} | error: {e}"
        )
        anomalies = []
    return AnomalyDetectResponse(anomalies=anomalies)
