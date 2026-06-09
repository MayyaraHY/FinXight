from uuid import UUID
from sqlalchemy import func
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

    def get_by_user_with_counts(self, user_id: UUID) -> list[dict]:
        from app.models.upload import Upload
        rows = (
            self.db.query(Company, func.count(Upload.id).label("upload_count"))
            .outerjoin(Upload, (Upload.company_id == Company.id) & (Upload.user_id == user_id))
            .filter(Company.user_id == user_id)
            .group_by(Company.id)
            .order_by(Company.created_at.desc())
            .all()
        )
        return [
            {"id": c.id, "name": c.name, "created_at": c.created_at, "upload_count": count}
            for c, count in rows
        ]

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

    def update(self, company_id: int, user_id: UUID, name: str) -> Company | None:
        company = self.get_by_id(company_id, user_id)
        if not company:
            return None
        company.name = name
        self.db.commit()
        self.db.refresh(company)
        return company

    def delete(self, company_id: int, user_id: UUID) -> None:
        self.db.query(Company).filter(
            Company.id == company_id, Company.user_id == user_id
        ).delete()
        self.db.commit()