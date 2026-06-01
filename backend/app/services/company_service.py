from uuid import UUID
from sqlalchemy.orm import Session
from app.repositories.company_repository import CompanyRepository
from app.models.company import Company


class CompanyService:

    def __init__(self, db: Session):
        self.repo = CompanyRepository(db)

    def create_company(self, user_id: UUID, name: str) -> Company:
        return self.repo.create(user_id=user_id, name=name)

    def list_companies(self, user_id: UUID) -> list[Company]:
        return self.repo.get_by_user(user_id)

    def get_company(self, company_id: int, user_id: UUID) -> Company:
        company = self.repo.get_by_id(company_id, user_id)
        if not company:
            raise ValueError(f"Company {company_id} not found")
        return company