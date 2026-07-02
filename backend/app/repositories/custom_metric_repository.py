from uuid import UUID
from sqlalchemy.orm import Session
from app.models.custom_metric import CustomMetric


class CustomMetricRepository:

    def __init__(self, db: Session):
        self.db = db

    def create(self, company_id: int | None, user_id: UUID, **fields) -> CustomMetric:
        metric = CustomMetric(company_id=company_id, user_id=user_id, **fields)
        self.db.add(metric)
        self.db.commit()
        self.db.refresh(metric)
        return metric

    # --- Global library (user-scoped, company_id IS NULL) -------------------
    def get_by_user(self, user_id: UUID) -> list[CustomMetric]:
        """All the user's global library metrics (company_id IS NULL)."""
        return (
            self.db.query(CustomMetric)
            .filter(CustomMetric.company_id.is_(None), CustomMetric.user_id == user_id)
            .order_by(CustomMetric.created_at.asc())
            .all()
        )

    def get_by_id_for_user(self, metric_id: int, user_id: UUID) -> CustomMetric | None:
        """A single global library metric owned by the user."""
        return (
            self.db.query(CustomMetric)
            .filter(
                CustomMetric.id == metric_id,
                CustomMetric.company_id.is_(None),
                CustomMetric.user_id == user_id,
            )
            .first()
        )

    def get_by_company(self, company_id: int, user_id: UUID) -> list[CustomMetric]:
        return (
            self.db.query(CustomMetric)
            .filter(CustomMetric.company_id == company_id, CustomMetric.user_id == user_id)
            .order_by(CustomMetric.created_at.asc())
            .all()
        )

    def get_by_id(self, metric_id: int, company_id: int, user_id: UUID) -> CustomMetric | None:
        return (
            self.db.query(CustomMetric)
            .filter(
                CustomMetric.id == metric_id,
                CustomMetric.company_id == company_id,
                CustomMetric.user_id == user_id,
            )
            .first()
        )

    def update(self, metric: CustomMetric, fields: dict) -> CustomMetric:
        for key, value in fields.items():
            setattr(metric, key, value)
        self.db.commit()
        self.db.refresh(metric)
        return metric

    def delete(self, metric: CustomMetric) -> None:
        self.db.delete(metric)
        self.db.commit()
