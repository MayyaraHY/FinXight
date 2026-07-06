from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.auth import CurrentUser, current_user
from app.db.cnx import get_db
from app.services.company_service import CompanyService
from app.repositories.timeline_repository import get_timeline_data
from app.services.synthese_service import compute_synthese

router = APIRouter(
    prefix="/companies",
    tags=["Synthese"],
    dependencies=[Depends(current_user)],
)


@router.get("/{company_id}/synthese")
def get_synthese(
    company_id: int,
    year: int = Query(...),
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(current_user),
):
    try:
        CompanyService(db).get_company(company_id=company_id, user_id=user.id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    periods = get_timeline_data(db, company_id=company_id, user_id=user.id)

    # Resolve year_prev: largest year present that is strictly less than requested year
    available_years = sorted(
        {p["period_year"] for p in periods if p.get("period_year") is not None}
    )
    year_prev = next((y for y in reversed(available_years) if y < year), None)

    result = compute_synthese(periods, year=year, year_prev=year_prev)
    if result is None:
        raise HTTPException(status_code=404, detail=f"No period found for year {year}")

    return {"success": True, "data": result}
