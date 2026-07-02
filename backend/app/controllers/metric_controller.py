"""User-scoped global metric library (KPIs & ratios) — the /metrics API.

A metric defined here belongs to the user, not a company, and applies to every
company they own (custom_metrics rows with company_id IS NULL). Mirrors the
company-scoped custom_metric_controller but drops the company from the path.
"""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import CurrentUser, current_user
from app.db.cnx import get_db
from app.services.custom_metric_service import CustomMetricService


class MetricCreate(BaseModel):
    name: str
    formula: str
    kind: str  # 'kpi' | 'ratio'
    format: Optional[str] = None
    higher_better: bool = True
    threshold: Optional[float] = None


class MetricUpdate(BaseModel):
    name: Optional[str] = None
    formula: Optional[str] = None
    kind: Optional[str] = None
    format: Optional[str] = None
    higher_better: Optional[bool] = None
    threshold: Optional[float] = None


class GenerateMetricRequest(BaseModel):
    name: str
    # Variable catalog [{key, label}] from the frontend (single source of truth).
    variables: list[dict] = []


router = APIRouter(
    prefix="/metrics",
    tags=["Metric Library"],
    dependencies=[Depends(current_user)],
)


@router.get("/")
def list_metrics(
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(current_user),
):
    return {"success": True, "data": CustomMetricService(db).list_library(user.id)}


@router.post("/")
def create_metric(
    body: MetricCreate,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(current_user),
):
    try:
        data = CustomMetricService(db).create_library(user.id, body.dict())
        return {"success": True, "data": data}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/generate")
def generate_metric(
    body: GenerateMetricRequest,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(current_user),
):
    try:
        data = CustomMetricService(db).generate_library(user.id, body.name, body.variables)
        return {"success": True, "data": data}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/{metric_id}")
def update_metric(
    metric_id: int,
    body: MetricUpdate,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(current_user),
):
    try:
        data = CustomMetricService(db).update_library(metric_id, user.id, body.dict(exclude_unset=True))
        return {"success": True, "data": data}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/{metric_id}")
def delete_metric(
    metric_id: int,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(current_user),
):
    try:
        CustomMetricService(db).delete_library(metric_id, user.id)
        return {"success": True}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
