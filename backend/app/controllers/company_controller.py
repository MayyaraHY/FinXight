from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import CurrentUser, current_user
from app.db.cnx import get_db
from app.services.company_service import CompanyService


class CompanyCreate(BaseModel):
    name: str


class CompanyRename(BaseModel):
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
    return {"success": True, "data": {"id": company.id, "name": company.name, "upload_count": 0}}


@router.get("/")
def list_companies(
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(current_user),
):
    service = CompanyService(db)
    companies = service.list_companies_with_counts(user_id=user.id)
    return {"success": True, "data": companies}


@router.get("/{company_id}")
def get_company(
    company_id: int,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(current_user),
):
    try:
        service = CompanyService(db)
        company = service.get_company(company_id=company_id, user_id=user.id)
        counts = service.list_companies_with_counts(user_id=user.id)
        upload_count = next((c["upload_count"] for c in counts if c["id"] == company.id), 0)
        return {
            "success": True,
            "data": {
                "id": company.id,
                "name": company.name,
                "created_at": company.created_at,
                "upload_count": upload_count,
            },
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.put("/{company_id}")
def rename_company(
    company_id: int,
    body: CompanyRename,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(current_user),
):
    try:
        service = CompanyService(db)
        company = service.rename_company(company_id=company_id, user_id=user.id, name=body.name)
        return {"success": True, "data": {"id": company.id, "name": company.name}}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.delete("/{company_id}")
def delete_company(
    company_id: int,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(current_user),
):
    try:
        service = CompanyService(db)
        deleted_uploads = service.delete_company(company_id=company_id, user_id=user.id)
        return {"success": True, "deleted_uploads": deleted_uploads}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))