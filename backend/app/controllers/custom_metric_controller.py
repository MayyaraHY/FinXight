from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import CurrentUser, current_user
from app.db.cnx import get_db
from app.services.custom_metric_service import CustomMetricService


class CustomMetricCreate(BaseModel):
    name: str
    formula: str
    kind: str  # 'kpi' | 'ratio'
    format: Optional[str] = None
    higher_better: bool = True
    threshold: Optional[float] = None


class CustomMetricUpdate(BaseModel):
    name: Optional[str] = None
    formula: Optional[str] = None
    kind: Optional[str] = None
    format: Optional[str] = None
    higher_better: Optional[bool] = None
    threshold: Optional[float] = None


router = APIRouter(
    prefix="/companies/{company_id}/custom-metrics",
    tags=["Custom Metrics"],
    dependencies=[Depends(current_user)],
)


@router.get("/")
def list_custom_metrics(
    company_id: int,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(current_user),
):
    try:
        data = CustomMetricService(db).list_metrics(company_id, user.id)
        return {"success": True, "data": data}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/")
def create_custom_metric(
    company_id: int,
    body: CustomMetricCreate,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(current_user),
):
    try:
        data = CustomMetricService(db).create_metric(company_id, user.id, body.dict())
        return {"success": True, "data": data}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/{metric_id}")
def update_custom_metric(
    company_id: int,
    metric_id: int,
    body: CustomMetricUpdate,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(current_user),
):
    try:
        data = CustomMetricService(db).update_metric(
            metric_id, company_id, user.id, body.dict(exclude_unset=True)
        )
        return {"success": True, "data": data}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/{metric_id}")
def delete_custom_metric(
    company_id: int,
    metric_id: int,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(current_user),
):
    try:
        CustomMetricService(db).delete_metric(metric_id, company_id, user.id)
        return {"success": True}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
