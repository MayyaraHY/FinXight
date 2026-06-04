import logging

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth import CurrentUser, assert_upload_owned, current_user
from app.db.cnx import get_db
from app.repositories.validation_repository import ValidationRepository

logger = logging.getLogger(__name__)

# Router-level auth: every endpoint below requires a valid JWT.
router = APIRouter(
    prefix="/validation",
    tags=["Validation"],
    dependencies=[Depends(current_user)],
)


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
