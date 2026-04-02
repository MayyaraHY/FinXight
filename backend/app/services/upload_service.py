from app.services.csv_parsing_service import parse_csv_and_store
from app.repositories.upload_repository import *
from app.core.config import settings
import logging
import os

logger = logging.getLogger(__name__)

os.makedirs(settings.UPLOAD_DIR, exist_ok=True)


def save_file_and_register(db, file):
    """
    Save file to disk, register upload, and parse CSV with detailed feedback.
    """
    file_path = None
    try:
        file_path = os.path.join(settings.UPLOAD_DIR, file.filename)

        # 💾 Save file
        with open(file_path, "wb") as f:
            f.write(file.file.read())
        
        logger.info(f"File saved: {file_path}")

        # 🗄️ Save upload metadata
        upload = create_upload(
            db=db,
            filename=file.filename,
            file_path=file_path
        )
        
        logger.info(f"Upload registered with ID: {upload.id}")

        # 🔥 Parse CSV → accounts table
        parse_result = parse_csv_and_store(
            db=db,
            file_path=file_path,
            upload_id=upload.id
        )

        logger.info(
            f"Upload {upload.id}: {parse_result['inserted']} accounts inserted. "
            f"Detected columns: {parse_result['detected_columns']}"
        )

        return {
            "status": "success",
            "upload_id": upload.id,
            "filename": upload.filename,
            "accounts_inserted": parse_result["inserted"],
            "detected_columns": parse_result["detected_columns"],
            "encoding": parse_result["encoding"],
            "separator": parse_result["separator"],
            "has_header": parse_result["has_header"],
            "errors": parse_result.get("errors", [])
        }

    except Exception as e:
        logger.error(f"Upload failed: {str(e)}", exc_info=True)
        
        # Clean up file if it was created
        if file_path and os.path.exists(file_path):
            try:
                os.remove(file_path)
            except:
                pass
        
        raise

# 🔹 READ ONE
def get_upload_service(db, upload_id: int):
    upload = get_upload_by_id(db, upload_id)
    if not upload:
        return {"error": "Upload not found"}
    return upload


# 🔹 READ ALL
def get_all_uploads_service(db):
    return get_all_uploads(db)


# 🔹 UPDATE
def update_upload_service(db, upload_id: int, filename: str):
    upload = update_upload(db, upload_id, filename)

    if not upload:
        return {"error": "Upload not found"}

    return upload


# 🔹 DELETE ONE
def delete_upload_service(db, upload_id: int):
    upload = get_upload_by_id(db, upload_id)

    if not upload:
        return {"error": "Upload not found"}

    # delete file from disk
    if upload.file_path and os.path.exists(upload.file_path):
        os.remove(upload.file_path)

    delete_upload(db, upload_id)

    return {"message": f"Upload {upload_id} deleted"}


# 🔹 DELETE ALL
def delete_all_uploads_service(db):
    uploads = get_all_uploads(db)

    # delete all files
    for upload in uploads:
        if upload.file_path and os.path.exists(upload.file_path):
            os.remove(upload.file_path)

    delete_all_uploads(db)

    return {"message": "All uploads deleted"}