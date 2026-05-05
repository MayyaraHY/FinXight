from fastapi import APIRouter, HTTPException

from app.models.requests import BilanAnalyzeRequest, BilanAnalyzeResponse
from app.core.gemini_client import ask_gemini
from app.prompts.prompts import BILAN_ANALYSIS_PROMPT

router = APIRouter()


@router.post("/bilan/analyze", response_model=BilanAnalyzeResponse)
def analyze_bilan(req: BilanAnalyzeRequest):
    try:
        analysis = ask_gemini(BILAN_ANALYSIS_PROMPT, context={"totals": req.totals})
    except ValueError as e:
        msg = str(e)
        if "surchargé" in msg:
            raise HTTPException(status_code=503, detail=msg)
        if "Limite" in msg:
            raise HTTPException(status_code=429, detail=msg)
        raise HTTPException(status_code=502, detail=msg)
    return BilanAnalyzeResponse(analysis=analysis)
