from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.models.compte_resultat import CompteResultat


class CompteResultatRepository:

    def __init__(self, db: Session):
        self.db = db

    # -------------------------
    # CREATE
    # -------------------------
    def create(self, upload_id: int, data: dict) -> CompteResultat:
        cr = CompteResultat(upload_id=upload_id, data=data)
        self.db.add(cr)
        self.db.commit()
        self.db.refresh(cr)
        return cr

    # -------------------------
    # GET BY UPLOAD ID
    # -------------------------
    def get_by_upload_id(self, upload_id: int) -> CompteResultat | None:
        return (
            self.db.query(CompteResultat)
            .filter(CompteResultat.upload_id == upload_id)
            .first()
        )

    # -------------------------
    # UPSERT  (replaces check-then-create anti-pattern)
    # -------------------------
    def update(self, upload_id: int, data: dict) -> CompteResultat:
        """
        Atomic upsert via PostgreSQL INSERT … ON CONFLICT DO UPDATE.

        The old pattern (get → create-if-missing → update) had a race condition:
        two concurrent generate requests both read "no row exists", both tried
        INSERT, and the second one crashed with UniqueViolation.  A single
        database-level statement is immune to that race.
        """
        stmt = (
            pg_insert(CompteResultat)
            .values(upload_id=upload_id, data=data)
            .on_conflict_do_update(
                index_elements=["upload_id"],
                set_={"data": data},
            )
        )
        self.db.execute(stmt)
        self.db.commit()
        # Expire the session cache so the subsequent read hits the DB.
        self.db.expire_all()
        return self.get_by_upload_id(upload_id)

    # -------------------------
    # DELETE
    # -------------------------
    def delete_by_upload_id(self, upload_id: int) -> None:
        self.db.query(CompteResultat)\
            .filter(CompteResultat.upload_id == upload_id)\
            .delete()
        self.db.commit()