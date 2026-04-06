from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.cnx import get_db
from app.services.bilan_service import BilanService

router = APIRouter(prefix="/bilan", tags=["Bilan"])


# =====================================================
# 1. GENERATE + SAVE (POST)
# =====================================================
@router.post("/generate/{upload_id}")
def generate_bilan(upload_id: int, db: Session = Depends(get_db)):

    service = BilanService(db)
    result = service.calculate_and_save(upload_id)

    return {
        "success": True,
        "message": "Bilan generated successfully",
        "data": result
    }


# =====================================================
# 2. FETCH SAVED BILAN (GET)
# =====================================================
@router.get("/{upload_id}")
def get_bilan(upload_id: int, db: Session = Depends(get_db)):

    service = BilanService(db)
    bilan = service.repo.get_by_upload_id(upload_id)

    if not bilan:
        return {
            "success": False,
            "message": "No bilan found for this upload"
        }

    return {
        "success": True,
        "data": bilan.data
    }