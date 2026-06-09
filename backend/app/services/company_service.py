import os
from uuid import UUID
from sqlalchemy.orm import Session
from app.repositories.company_repository import CompanyRepository
from app.repositories.upload_repository import get_by_company, delete_by_company
from app.models.company import Company


class CompanyService:

    def __init__(self, db: Session):
        self.repo = CompanyRepository(db)
        self.db = db

    def create_company(self, user_id: UUID, name: str) -> Company:
        return self.repo.create(user_id=user_id, name=name)

    def list_companies_with_counts(self, user_id: UUID) -> list[dict]:
        return self.repo.get_by_user_with_counts(user_id)

    def list_companies(self, user_id: UUID) -> list[Company]:
        return self.repo.get_by_user(user_id)

    def get_company(self, company_id: int, user_id: UUID) -> Company:
        company = self.repo.get_by_id(company_id, user_id)
        if not company:
            raise ValueError(f"Company {company_id} not found")
        return company

    def rename_company(self, company_id: int, user_id: UUID, name: str) -> Company:
        company = self.repo.update(company_id, user_id, name)
        if not company:
            raise ValueError(f"Company {company_id} not found")
        return company

    def delete_company(self, company_id: int, user_id: UUID) -> int:
        company = self.repo.get_by_id(company_id, user_id)
        if not company:
            raise ValueError(f"Company {company_id} not found")

        uploads = get_by_company(self.db, company_id, user_id)
        for upload in uploads:
            if upload.file_path and os.path.exists(upload.file_path):
                try:
                    os.remove(upload.file_path)
                except OSError:
                    pass

        upload_count = len(uploads)
        delete_by_company(self.db, company_id, user_id)
        self.repo.delete(company_id, user_id)
        return upload_count