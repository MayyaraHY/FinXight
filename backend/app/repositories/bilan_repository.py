from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.models.bilan import Bilan


class BilanRepository:

    def __init__(self, db: Session):
        self.db = db

    # -------------------------
    # CREATE
    # -------------------------
    def create(self, upload_id: int, data: dict) -> Bilan:
        bilan = Bilan(upload_id=upload_id, data=data)
        self.db.add(bilan)
        self.db.commit()
        self.db.refresh(bilan)
        return bilan

    # -------------------------
    # GET BY UPLOAD ID
    # -------------------------
    def get_by_upload_id(self, upload_id: int) -> Bilan | None:
        return (
            self.db.query(Bilan)
            .filter(Bilan.upload_id == upload_id)
            .order_by(Bilan.created_at.desc())
            .first()
        )

    # -------------------------
    # DELETE
    # -------------------------
    def delete_by_upload_id(self, upload_id: int) -> None:
        self.db.query(Bilan).filter(Bilan.upload_id == upload_id).delete()
        self.db.commit()

    # -------------------------
    # UPSERT  (replaces check-then-create anti-pattern)
    # -------------------------
    def update(self, upload_id: int, data: dict) -> Bilan:
        """
        Atomic upsert via PostgreSQL INSERT … ON CONFLICT DO UPDATE.

        Bilan has no unique constraint on upload_id (multiple rows allowed),
        so we use the primary-key conflict target.  If a row for this
        upload_id already exists we update it in place; otherwise we insert.
        This removes the get-then-create race that could produce ghost rows
        under concurrent recalculations.
        """
        existing = self.get_by_upload_id(upload_id)
        if existing:
            # Row exists — update in place using its primary key.
            stmt = (
                pg_insert(Bilan)
                .values(id=existing.id, upload_id=upload_id, data=data)
                .on_conflict_do_update(
                    index_elements=["id"],
                    set_={"data": data},
                )
            )
            self.db.execute(stmt)
        else:
            # No row yet — plain insert.
            stmt = pg_insert(Bilan).values(upload_id=upload_id, data=data)
            self.db.execute(stmt)

        self.db.commit()
        self.db.expire_all()
        return self.get_by_upload_id(upload_id)