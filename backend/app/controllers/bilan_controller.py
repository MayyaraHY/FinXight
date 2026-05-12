import logging

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth import CurrentUser, assert_upload_owned, current_user
from app.db.cnx import get_db
from app.services.bilan_service import BilanService

logger = logging.getLogger(__name__)

# Router-level auth: every endpoint below requires a valid JWT.
router = APIRouter(
    prefix="/bilan",
    tags=["Bilan"],
    dependencies=[Depends(current_user)],
)


# =====================================================
# 1. GENERATE + SAVE (POST)
# =====================================================
@router.post("/generate/{upload_id}")
def generate_bilan(
    upload_id: int,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(current_user),
):
    logger.info("bilan/generate upload_id=%s by user_id=%s", upload_id, user.id)
    assert_upload_owned(db, upload_id, user)
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
def get_bilan(
    upload_id: int,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(current_user),
):
    assert_upload_owned(db, upload_id, user)
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


# =====================================================
# 3. UPDATE BILAN (PUT)
# =====================================================
@router.put("/{upload_id}")
def update_bilan(
    upload_id: int,
    bilan_data: dict,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(current_user),
):
    """
    Update bilan data for a specific upload.
    Validates that the upload exists before updating.
    """
    assert_upload_owned(db, upload_id, user)
    try:
        service = BilanService(db)
        updated_data = service.update_bilan(upload_id, bilan_data)
        
        return {
            "success": True,
            "message": "Bilan updated successfully",
            "data": updated_data
        }
    except ValueError as e:
        return {
            "success": False,
            "message": str(e)
        }


# =====================================================
# 4. DELETE BILAN (DELETE)
# =====================================================
@router.delete("/{upload_id}")
def delete_bilan(
    upload_id: int,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(current_user),
):
    """
    Delete bilan for a specific upload.
    Only deletes the bilan record, not the associated accounts.
    """
    logger.info("bilan/delete upload_id=%s by user_id=%s", upload_id, user.id)
    assert_upload_owned(db, upload_id, user)
    service = BilanService(db)
    
    # Check if bilan exists first
    existing_bilan = service.repo.get_by_upload_id(upload_id)
    if not existing_bilan:
        return {
            "success": False,
            "message": f"No bilan found for upload_id {upload_id}"
        }
    
    service.delete_bilan(upload_id)
    
    return {
        "success": True,
        "message": "Bilan deleted successfully",
        "upload_id": upload_id
    }