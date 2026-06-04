from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.models.validation_report import ValidationReport


class ValidationRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_by_upload_id(self, upload_id: int) -> ValidationReport | None:
        return (
            self.db.query(ValidationReport)
            .filter(ValidationReport.upload_id == upload_id)
            .order_by(ValidationReport.created_at.desc())
            .first()
        )

    def delete_by_upload_id(self, upload_id: int) -> None:
        self.db.query(ValidationReport).filter(
            ValidationReport.upload_id == upload_id
        ).delete()
        self.db.commit()

    def upsert(
        self, upload_id: int, status: str, data: dict | None = None
    ) -> ValidationReport:
        """
        Atomic upsert of the per-upload report. Mirrors BilanRepository.update:
        no unique constraint on upload_id, so we conflict on the primary key when
        a row already exists, otherwise plain insert.
        """
        existing = self.get_by_upload_id(upload_id)
        if existing:
            stmt = (
                pg_insert(ValidationReport)
                .values(id=existing.id, upload_id=upload_id, status=status, data=data)
                .on_conflict_do_update(
                    index_elements=["id"],
                    set_={"status": status, "data": data},
                )
            )
            self.db.execute(stmt)
        else:
            stmt = pg_insert(ValidationReport).values(
                upload_id=upload_id, status=status, data=data
            )
            self.db.execute(stmt)

        self.db.commit()
        self.db.expire_all()
        return self.get_by_upload_id(upload_id)
