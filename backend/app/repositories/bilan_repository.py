from sqlalchemy.orm import Session
from app.models.bilan import Bilan


class BilanRepository:

    def __init__(self, db: Session):
        self.db = db

    # -------------------------
    # CREATE
    # -------------------------
    def create(self, upload_id: int, data: dict) -> Bilan:
        bilan = Bilan(
            upload_id=upload_id,
            data=data
        )

        self.db.add(bilan)
        self.db.commit()
        self.db.refresh(bilan)

        return bilan

    # -------------------------
    # GET BY UPLOAD ID
    # -------------------------
    def get_by_upload_id(self, upload_id: int) -> Bilan:
        return self.db.query(Bilan).filter(
            Bilan.upload_id == upload_id
        ).order_by(Bilan.created_at.desc()).first()

    # -------------------------
    # DELETE
    # -------------------------
    def delete_by_upload_id(self, upload_id: int):
        self.db.query(Bilan).filter(
            Bilan.upload_id == upload_id
        ).delete()

        self.db.commit()

    # -------------------------
    # UPDATE (replace)
    # -------------------------
    def update(self, upload_id: int, data: dict) -> Bilan:

        bilan = self.get_by_upload_id(upload_id)

        if not bilan:
            return self.create(upload_id, data)

        bilan.data = data

        self.db.commit()
        self.db.refresh(bilan)

        return bilan