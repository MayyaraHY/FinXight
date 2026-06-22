import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.auth import CurrentUser, current_user
from app.db.cnx import get_db
from app.services.cashflow_orchestrator import CashFlowOrchestrator, PeriodMissingError
from app.services.company_service import CompanyService

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/companies",
    tags=["Cash Flow"],
    dependencies=[Depends(current_user)],
)


@router.get("/{company_id}/cashflow")
def get_cashflow(
    company_id: int,
    year: int = Query(...),
    inventory_method: str = Query(..., enum=["permanent", "intermittent"]),
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(current_user),
):
    try:
        CompanyService(db).get_company(company_id=company_id, user_id=user.id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    try:
        data = CashFlowOrchestrator(db).build(
            company_id=company_id,
            user_id=user.id,
            year_n=year,
            inventory_method=inventory_method,
        )
    except PeriodMissingError as e:
        raise HTTPException(status_code=409, detail=str(e))

    data["inventory_method"] = inventory_method
    return {"success": True, "data": data}
