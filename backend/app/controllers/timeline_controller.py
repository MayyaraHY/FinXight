from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional

from app.auth import CurrentUser, current_user
from app.db.cnx import get_db
from app.services.company_service import CompanyService
from app.services.timeline_service import compare_periods, get_company_timeline

router = APIRouter(
    prefix="/companies",
    tags=["Timeline"],
    dependencies=[Depends(current_user)],
)


@router.get("/{company_id}/timeline")
def get_timeline(
    company_id: int,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(current_user),
):
    try:
        CompanyService(db).get_company(company_id=company_id, user_id=user.id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    data = get_company_timeline(db, company_id=company_id, user_id=user.id)
    return {"success": True, "data": data}


@router.get("/{company_id}/timeline/compare")
def compare_timeline(
    company_id: int,
    year_a: int = Query(...),
    year_b: int = Query(...),
    month_a: Optional[int] = Query(default=None),
    month_b: Optional[int] = Query(default=None),
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(current_user),
):
    try:
        CompanyService(db).get_company(company_id=company_id, user_id=user.id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    result = compare_periods(
        db,
        company_id=company_id,
        user_id=user.id,
        year_a=year_a,
        year_b=year_b,
        month_a=month_a,
        month_b=month_b,
    )
    if result is None:
        raise HTTPException(status_code=404, detail="One or both periods not found")

    return {"success": True, "data": result}
