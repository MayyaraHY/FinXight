import logging

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth import CurrentUser, assert_upload_owned, current_user
from app.db.cnx import get_db
from app.repositories.validation_repository import ValidationRepository
from app.services.validation_service import run_account_validation_with_db

logger = logging.getLogger(__name__)

# Router-level auth: every endpoint below requires a valid JWT.
router = APIRouter(
    prefix="/validation",
    tags=["Validation"],
    dependencies=[Depends(current_user)],
)


@router.post("/run/{upload_id}")
def run_validation(
    upload_id: int,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(current_user),
):
    """
    Re-run PCGT validation now, using the accounts already saved for this upload.
    Use this when the stored report is stale (e.g. after updating the PCGT logic).
    Returns the fresh report immediately.
    """
    logger.info("validation/run upload_id=%s by user_id=%s", upload_id, user.id)
    assert_upload_owned(db, upload_id, user)
    try:
        report = run_account_validation_with_db(db, upload_id)
        return {"success": True, "status": "done", "data": report}
    except Exception as e:
        logger.error("Validation run failed for upload %s: %s", upload_id, e, exc_info=True)
        return {"success": False, "status": "failed", "message": str(e)}


@router.get("/{upload_id}")
def get_validation_report(
    upload_id: int,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(current_user),
):
    """
    Fetch the PCGT validation report for an upload.

    The report is produced asynchronously after parsing, so a freshly uploaded
    file may return status "pending" before the background task finishes; the
    frontend polls until "done"/"failed".
    """
    assert_upload_owned(db, upload_id, user)
    report = ValidationRepository(db).get_by_upload_id(upload_id)

    if not report:
        return {"success": False, "status": "missing", "message": "No validation report yet"}

    return {
        "success": True,
        "status": report.status,
        "data": report.data,
    }
