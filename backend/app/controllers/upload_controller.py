from fastapi import APIRouter, UploadFile, File, Depends, Query
from sqlalchemy.orm import Session

from app.db.cnx import SessionLocal
from app.services.upload_service import (
    upload_document,
    parse_csv_file,
    add_and_parse_document,
    get_upload_service,
    get_all_uploads_service,
    update_upload_service,
    delete_upload_service,
    delete_all_uploads_service,
    preview_csv_file
)

router = APIRouter(prefix="/upload", tags=["Upload"])
#router = APIRouter()

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
    db: Session = Depends(get_db)
):
    """
    Upload a file to the server and register it in the database.
    Returns upload_id for later parsing.
    
    Use this endpoint when you want to separate upload from parsing.
    After uploading, use POST /parse/{upload_id} to parse the file.
    """
    result = upload_document(db, file, display_filename)
    return result


@router.post("/parse/{upload_id}")
def parse_uploaded_file(upload_id: int, db: Session = Depends(get_db)):
    """
    Parse a previously uploaded CSV file.
    
    Use this endpoint to parse a file that was uploaded with POST /upload.
    Requires the upload_id returned from the upload endpoint.
    """
    result = parse_csv_file(db, upload_id)
    return result


@router.get("/preview/{upload_id}")
def preview_file(upload_id: int, rows: int = 20, db: Session = Depends(get_db)):

    result = preview_csv_file(db, upload_id, rows)
    return result


@router.post("/add_upload")
def upload_and_parse_file(
    file: UploadFile = File(...),
    display_filename: str = Query(None, description="Custom name to display for this file. Defaults to original filename."),
    db: Session = Depends(get_db)
):
    """
    Upload and parse a file in one operation.
    
    This is the combined workflow: saves file, registers it, and parses it immediately.
    Returns detailed results including inserted accounts and detected columns.
    """
    result = add_and_parse_document(db, file, display_filename)
    return result


# ====== EXISTING CRUD ENDPOINTS ======

# 🔹 READ ONE
@router.get("/upload/{upload_id}")
def get_upload(upload_id: int, db: Session = Depends(get_db)):
    return get_upload_service(db, upload_id)


# 🔹 READ ALL
@router.get("/get_all_uploads")
def get_uploads(db: Session = Depends(get_db)):
    return get_all_uploads_service(db)


# 🔹 UPDATE
@router.put("/update_upload/{upload_id}")
def update_upload(
    upload_id: int,
    display_filename: str = Query(..., description="New display name for the file."),
    db: Session = Depends(get_db)
):
    return update_upload_service(db, upload_id, display_filename)


# 🔹 DELETE ONE
@router.delete("/delete_upload/{upload_id}")
def delete_upload(upload_id: int, db: Session = Depends(get_db)):
    return delete_upload_service(db, upload_id)


# 🔹 DELETE ALL
@router.delete("/delete_all_uploads")
def delete_all_uploads(db: Session = Depends(get_db)):
    return delete_all_uploads_service(db)