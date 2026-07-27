import os
from uuid import UUID
from sqlalchemy.orm import Session
from app.repositories.company_repository import CompanyRepository
from app.repositories.upload_repository import get_by_company, delete_by_company
from app.models.company import Company
from app.models.upload import Upload
from app.models.validation_report import ValidationReport
from app.models.bilan import Bilan
from app.models.anomaly import Anomaly
from app.models.anomaly_status import AnomalyStatus

# Assets and liabilities rarely tie to the cent after rounding; treat anything
# within this tolerance as balanced for the portfolio badge.
_BALANCE_TOLERANCE = 0.5


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

    def get_company_status(self, company_id: int, user_id: UUID) -> dict:
        """Portfolio status summary for one company, based on its latest upload.

        All reads are cheap lookups of already-persisted rows (validation
        summary JSON, stored bilan totals, anomaly snapshot) — nothing is
        recomputed here, because the portfolio calls this once per card.
        Raises ValueError (-> 404) if the company doesn't exist or isn't owned
        by ``user_id``.
        """
        # Owner-scoped existence check (same pattern as get_company): 404 on miss.
        company = self.repo.get_by_id(company_id, user_id)
        if not company:
            raise ValueError(f"Company {company_id} not found")

        latest = (
            self.db.query(Upload)
            .filter(Upload.company_id == company_id, Upload.user_id == user_id)
            .order_by(Upload.created_at.desc())
            .first()
        )

        empty = {
            "company_id": company_id,
            "upload_id": None,
            "last_upload_at": None,
            "period_label": None,
            "validation_errors": 0,
            "validation_warnings": 0,
            "balanced": True,
            "open_anomalies": 0,
            "has_data": False,
        }
        if latest is None:
            return empty

        # --- Validation summary (stored JSON) ---
        vr = (
            self.db.query(ValidationReport)
            .filter(ValidationReport.upload_id == latest.id)
            .order_by(ValidationReport.created_at.desc())
            .first()
        )
        summary = (vr.data or {}).get("summary", {}) if vr and vr.data else {}
        validation_errors = int(summary.get("errors", 0) or 0)
        validation_warnings = int(summary.get("warnings", 0) or 0)

        # --- Balance check (read stored totals, never recompute) ---
        bilan = (
            self.db.query(Bilan)
            .filter(Bilan.upload_id == latest.id)
            .order_by(Bilan.created_at.desc())
            .first()
        )
        balanced = True
        if bilan and bilan.data:
            totals = bilan.data.get("totals", {}) or {}
            total_actif = (totals.get("actif") or {}).get("total_actif")
            total_passif = (totals.get("passif") or {}).get("total_passif")
            if total_actif is not None and total_passif is not None:
                balanced = abs(float(total_actif) - float(total_passif)) < _BALANCE_TOLERANCE

        # --- Open anomalies (latest snapshot minus dismissed) ---
        anomaly_row = (
            self.db.query(Anomaly)
            .filter(Anomaly.upload_id == latest.id)
            .order_by(Anomaly.created_at.desc())
            .first()
        )
        total_anomalies = (
            len(anomaly_row.anomalies)
            if anomaly_row and isinstance(anomaly_row.anomalies, list)
            else 0
        )
        dismissed = (
            self.db.query(AnomalyStatus)
            .filter(
                AnomalyStatus.upload_id == latest.id,
                AnomalyStatus.status.in_(["ignored", "deleted"]),
            )
            .count()
        )
        open_anomalies = max(total_anomalies - dismissed, 0)

        # --- Period label ---
        period_label = None
        if latest.period_year:
            period_label = str(latest.period_year)
            if latest.period_month:
                period_label = f"{latest.period_year}-{latest.period_month:02d}"

        return {
            "company_id": company_id,
            "upload_id": latest.id,
            "last_upload_at": latest.created_at,
            "period_label": period_label,
            "validation_errors": validation_errors,
            "validation_warnings": validation_warnings,
            "balanced": balanced,
            "open_anomalies": open_anomalies,
            "has_data": True,
        }

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