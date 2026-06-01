from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import CurrentUser, current_user
from app.db.cnx import get_db
from app.services.company_service import CompanyService


class CompanyCreate(BaseModel):
    name: str


router = APIRouter(
    prefix="/companies",
    tags=["Companies"],
    dependencies=[Depends(current_user)],
)


@router.post("/")
def create_company(
    body: CompanyCreate,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(current_user),
):
    service = CompanyService(db)
    company = service.create_company(user_id=user.id, name=body.name)
    return {"success": True, "data": {"id": company.id, "name": company.name}}


@router.get("/")
def list_companies(
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(current_user),
):
    service = CompanyService(db)
    companies = service.list_companies(user_id=user.id)
    return {
        "success": True,
        "data": [{"id": c.id, "name": c.name, "created_at": c.created_at} for c in companies],
    }


@router.get("/{company_id}")
def get_company(
    company_id: int,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(current_user),
):
    try:
        service = CompanyService(db)
        company = service.get_company(company_id=company_id, user_id=user.id)
        return {"success": True, "data": {"id": company.id, "name": company.name}}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))