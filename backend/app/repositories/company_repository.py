from uuid import UUID
from sqlalchemy.orm import Session
from app.models.company import Company


class CompanyRepository:

    def __init__(self, db: Session):
        self.db = db

    def create(self, user_id: UUID, name: str) -> Company:
        company = Company(user_id=user_id, name=name)
        self.db.add(company)
        self.db.commit()
        self.db.refresh(company)
        return company

    def get_by_user(self, user_id: UUID) -> list[Company]:
        return (
            self.db.query(Company)
            .filter(Company.user_id == user_id)
            .order_by(Company.created_at.desc())
            .all()
        )

    def get_by_id(self, company_id: int, user_id: UUID) -> Company | None:
        return (
            self.db.query(Company)
            .filter(Company.id == company_id, Company.user_id == user_id)
            .first()
        )