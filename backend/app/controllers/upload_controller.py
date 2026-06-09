import logging
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Form, UploadFile, File, Depends, Query, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import CurrentUser, assert_upload_owned, current_user
from app.db.cnx import SessionLocal
from app.repositories.upload_repository import patch_metadata
from app.services.upload_service import (
    upload_document,
    parse_csv_file,
    upload_and_parse_document,
    get_upload_service,
    get_all_uploads_service,
    update_upload_service,
    delete_upload_service,
    delete_all_uploads_service,
    preview_csv_file
)

logger = logging.getLogger(__name__)

# Router-level auth: every endpoint below requires a valid JWT.
# To add a public endpoint here, factor it out into main.py instead — the
# discipline of opt-out-explicit prevents accidentally shipping unprotected routes.
router = APIRouter(
    prefix="/upload",
    tags=["Upload"],
    dependencies=[Depends(current_user)],
)

# DB dependency
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ====== NEW ENDPOINTS (FLEXIBLE WORKFLOW) ======

@router.post("/add")
def upload_file_only(
    file: UploadFile = File(...),
    display_filename: str = Query(None, description="Custom name to display for this file. Defaults to original filename."),
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(current_user),
):
    """
    Upload a file to the server and register it in the database.
    Returns upload_id for later parsing.

    Use this endpoint when you want to separate upload from parsing.
    After uploading, use POST /parse/{upload_id} to parse the file.
    """
    logger.info("upload/add by user_id=%s email=%s", user.id, user.email)
    return upload_document(db, file, user_id=user.id, display_filename=display_filename)


@router.post("/parse/{upload_id}")
def parse_uploaded_file(
    upload_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(current_user),
):
    """
    Parse a previously uploaded CSV file.
    Anomaly detection runs as a background task after accounts are saved.
    """
    assert_upload_owned(db, upload_id, user)
    return parse_csv_file(db, upload_id, background_tasks=background_tasks)


@router.get("/preview/{upload_id}")
def preview_file(
    upload_id: int,
    rows: int = 20,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(current_user),
):
    assert_upload_owned(db, upload_id, user)
    return preview_csv_file(db, upload_id, rows)


@router.post("/upload_and_parse")
async def upload_and_parse(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    display_name: str = Form(None),
    company_id: Optional[int] = Form(None),
    period_year: Optional[int] = Form(None),
    period_month: Optional[int] = Form(None),
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(current_user),
):
    """
    Upload a CSV file and automatically parse it.
    Anomaly detection runs as a background task after accounts are saved.
    """
    logger.info("upload_and_parse by user_id=%s email=%s", user.id, user.email)
    try:
        return upload_and_parse_document(
            db=db,
            file=file,
            user_id=user.id,
            display_filename=display_name,
            company_id=company_id,
            period_year=period_year,
            period_month=period_month,
            background_tasks=background_tasks,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ====== EXISTING CRUD ENDPOINTS ======

# 🔹 READ ONE
@router.get("/upload/{upload_id}")
def get_upload(
    upload_id: int,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(current_user),
):
    return get_upload_service(db, upload_id, user_id=user.id)


# 🔹 READ ALL
@router.get("/get_all_uploads")
def get_uploads(
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(current_user),
):
    return get_all_uploads_service(db, user_id=user.id)


# 🔹 UPDATE
@router.put("/update_upload/{upload_id}")
def update_upload(
    upload_id: int,
    display_filename: str = Query(..., description="New display name for the file."),
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(current_user),
):
    return update_upload_service(db, upload_id, user_id=user.id, filename=display_filename)


# 🔹 DELETE ONE
@router.delete("/delete_upload/{upload_id}")
def delete_upload(
    upload_id: int,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(current_user),
):
    return delete_upload_service(db, upload_id, user_id=user.id)


# 🔹 DELETE ALL (only the caller's uploads — never a global wipe)
@router.delete("/delete_all_uploads")
def delete_all_uploads(
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(current_user),
):
    return delete_all_uploads_service(db, user_id=user.id)


# 🔹 PATCH METADATA (company_id, period_year, period_month — any subset)
class UploadMetadataPatch(BaseModel):
    company_id: Optional[int] = None
    period_year: Optional[int] = None
    period_month: Optional[int] = None


@router.patch("/{upload_id}/metadata")
def patch_upload_metadata(
    upload_id: int,
    body: UploadMetadataPatch,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(current_user),
):
    assert_upload_owned(db, upload_id, user)

    from app.repositories.upload_repository import _MISSING

    kwargs: dict = {}
    fields_set = body.model_fields_set
    if "company_id" in fields_set:
        kwargs["company_id"] = body.company_id
    if "period_year" in fields_set:
        kwargs["period_year"] = body.period_year
    if "period_month" in fields_set:
        kwargs["period_month"] = body.period_month

    # If no fields were sent, still succeed (no-op)
    if not kwargs:
        from app.repositories.upload_repository import get_upload_by_id
        upload = get_upload_by_id(db, upload_id, user_id=user.id)
        if not upload:
            raise HTTPException(status_code=404, detail="Upload not found")
        return {"success": True, "data": {"id": upload.id}}

    upload = patch_metadata(db, upload_id, user.id, **kwargs)
    if not upload:
        raise HTTPException(status_code=404, detail="Upload not found")

    return {
        "success": True,
        "data": {
            "id": upload.id,
            "company_id": upload.company_id,
            "period_year": upload.period_year,
            "period_month": upload.period_month,
        },
    }
