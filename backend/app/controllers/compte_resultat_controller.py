import logging

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.auth import CurrentUser, assert_upload_owned, current_user
from app.db.cnx import get_db
from app.services.compte_resultat_service import CompteResultatService

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/cr",
    tags=["Compte de Résultat"],
    dependencies=[Depends(current_user)],
)


# =====================================================
# 1. GENERATE + SAVE
# =====================================================
@router.post("/generate/{upload_id}")
def generate_cr(
    upload_id: int,
    inventory_method: str = Query("permanent", enum=["permanent", "intermittent"]),
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(current_user),
):
    logger.info("cr/generate upload_id=%s by user_id=%s", upload_id, user.id)
    assert_upload_owned(db, upload_id, user)

    service = CompteResultatService(db, inventory_method=inventory_method)
    result  = service.calculate_and_save(upload_id)

    return {
        "success": True,
        "message": "Compte de résultat generated successfully",
        "data": result,
    }


# =====================================================
# 2. GET SAVED CR
# =====================================================
@router.get("/{upload_id}")
def get_cr(
    upload_id: int,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(current_user),
):
    assert_upload_owned(db, upload_id, user)

    service = CompteResultatService(db)
    cr      = service.repo.get_by_upload_id(upload_id)

    if not cr:
        return {
            "success": False,
            "message": "No compte de résultat found for this upload",
        }

    return {
        "success": True,
        "data": cr.data,
    }


# =====================================================
# 3. UPDATE
# =====================================================
@router.put("/{upload_id}")
def update_cr(
    upload_id: int,
    cr_data: dict,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(current_user),
):
    assert_upload_owned(db, upload_id, user)

    try:
        service      = CompteResultatService(db)
        updated_data = service.update_cr(upload_id, cr_data)
        return {
            "success": True,
            "message": "Compte de résultat updated successfully",
            "data": updated_data,
        }
    except ValueError as e:
        return {"success": False, "message": str(e)}


# =====================================================
# 4. DELETE
# =====================================================
@router.delete("/{upload_id}")
def delete_cr(
    upload_id: int,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(current_user),
):
    logger.info("cr/delete upload_id=%s by user_id=%s", upload_id, user.id)
    assert_upload_owned(db, upload_id, user)

    service = CompteResultatService(db)

    if not service.repo.get_by_upload_id(upload_id):
        return {
            "success": False,
            "message": f"No compte de résultat found for upload_id {upload_id}",
        }

    service.delete_cr(upload_id)
    return {
        "success": True,
        "message": "Compte de résultat deleted successfully",
        "upload_id": upload_id,
    }