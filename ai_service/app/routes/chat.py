from fastapi import APIRouter, HTTPException

from app.models.requests import ChatRequest, ChatResponse
from app.core.gemini_client import ask_gemini

router = APIRouter()


@router.post("/chat", response_model=ChatResponse)
def chat(req: ChatRequest):
    try:
        reply = ask_gemini(req.message, context=req.context)
    except ValueError as e:
        msg = str(e)
        if "surchargé" in msg:
            raise HTTPException(status_code=503, detail=msg)
        if "Limite" in msg:
            raise HTTPException(status_code=429, detail=msg)
        raise HTTPException(status_code=502, detail=msg)
    return ChatResponse(response=reply)
