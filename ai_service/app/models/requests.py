from pydantic import BaseModel
from typing import Any

class CompteItem(BaseModel):
    code: str
    label: str | None = None
    solde: float = 0.0

class ChatRequest(BaseModel):
    message: str
    context: dict[str, Any]   # { comptes: [...], bilan_totaux: {...} }

class ChatResponse(BaseModel):
    response: str

class AnomalyDetectRequest(BaseModel):
    comptes: list[dict[str, Any]]

class AnomalyDetectResponse(BaseModel):
    anomalies: list[dict[str, Any]]

class BilanAnalyzeRequest(BaseModel):
    totals: dict[str, Any]

class BilanAnalyzeResponse(BaseModel):
    analysis: str