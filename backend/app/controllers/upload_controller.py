from fastapi import APIRouter, UploadFile, File, Depends
from sqlalchemy.orm import Session

from app.db.cnx import SessionLocal
from app.services.upload_service import save_file_and_register

router = APIRouter()

# DB dependency
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.post("/upload")
def upload_file(file: UploadFile = File(...), db: Session = Depends(get_db)):
    upload = save_file_and_register(db, file)

    return {
        "id": upload.id,
        "filename": upload.filename,
        "path": upload.file_path,
        "status": upload.status
    }