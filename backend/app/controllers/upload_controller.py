from fastapi import APIRouter, UploadFile, File, Depends
from sqlalchemy.orm import Session

from app.db.cnx import SessionLocal
from app.services.upload_service import *

router = APIRouter()

# DB dependency
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.post("/add_upload")
def upload_file(file: UploadFile = File(...), db: Session = Depends(get_db)):
    result = save_file_and_register(db, file)
    return result

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
def update_upload(upload_id: int, filename: str, db: Session = Depends(get_db)):
    return update_upload_service(db, upload_id, filename)


# 🔹 DELETE ONE
@router.delete("/delete_upload/{upload_id}")
def delete_upload(upload_id: int, db: Session = Depends(get_db)):
    return delete_upload_service(db, upload_id)


# 🔹 DELETE ALL
@router.delete("/delete_all_uploads")
def delete_all_uploads(db: Session = Depends(get_db)):
    return delete_all_uploads_service(db)