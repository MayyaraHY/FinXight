from app.services.csv_parsing_service import parse_csv
from app.repositories.upload_repository import *
from app.core.config import settings
import logging
import os
from app.repositories.account_repository import save_accounts


logger = logging.getLogger(__name__)

os.makedirs(settings.UPLOAD_DIR, exist_ok=True)


def upload_document(db, file):
    """
    Upload a document: save file to disk and register in upload table.
    Returns the upload ID and metadata, ready for parsing.
    
    Args:
        db: Database session
        file: FastAPI UploadFile object
        
    Returns:
        Dict with upload_id, filename, and file_path
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

        return {
            "status": "success",
            "upload_id": upload.id,
            "filename": upload.filename,
            "file_path": upload.file_path,
            "message": "File uploaded successfully. Use /parse/{upload_id} to parse it."
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


def parse_csv_file(db, upload_id: int):
    """
    Parse a previously uploaded CSV file.
    Performs preparation (normalization), classification, extraction, and validation.
    Saves the parsed accounts to the database.
    
    Args:
        db: Database session
        upload_id: ID of the uploaded file to parse
        
    Returns:
        Dict with parsing results and inserted account count
    """
    try:
        # Get upload metadata
        upload = get_upload_by_id(db, upload_id)
        if not upload:
            raise ValueError(f"Upload with ID {upload_id} not found")

        logger.info(f"Starting to parse upload {upload_id}: {upload.filename}")

        # Open file and parse
        with open(upload.file_path, "rb") as f:
            validated_data = parse_csv(f, upload_id)

        # 💾 Save accounts to DB
        save_accounts(db, validated_data, upload_id)

        # 📝 Prepare result
        parse_result = {
            "inserted": len(validated_data),
            "detected_columns": list(validated_data[0].keys()) if validated_data else [],
            "encoding": "detected",
            "separator": "detected",
            "has_header": True,
            "errors": []
        }

        logger.info(
            f"Upload {upload_id}: {parse_result['inserted']} accounts inserted. "
            f"Detected columns: {parse_result['detected_columns']}"
        )

        return {
            "status": "success",
            "upload_id": upload_id,
            "filename": upload.filename,
            "accounts_inserted": parse_result["inserted"],
            "detected_columns": parse_result["detected_columns"],
            "encoding": parse_result["encoding"],
            "separator": parse_result["separator"],
            "has_header": parse_result["has_header"],
            "errors": parse_result.get("errors", [])
        }

    except Exception as e:
        logger.error(f"Parse failed for upload {upload_id}: {str(e)}", exc_info=True)
        raise


def add_and_parse_document(db, file):
    """
    Combined operation: upload document and parse it in one call.
    Equivalent to the old save_file_and_register() function.
    
    Args:
        db: Database session
        file: FastAPI UploadFile object
        
    Returns:
        Dict with upload_id, filename, and parsing results
    """
    try:
        # Step 1: Upload document
        upload_result = upload_document(db, file)
        upload_id = upload_result["upload_id"]

        # Step 2: Parse CSV
        parse_result = parse_csv_file(db, upload_id)

        return parse_result

    except Exception as e:
        logger.error(f"Upload and parse failed: {str(e)}", exc_info=True)
        raise


# Legacy alias for backward compatibility
def save_file_and_register(db, file):
    """
    Legacy function - use add_and_parse_document() instead.
    Kept for backward compatibility.
    """
    return add_and_parse_document(db, file)

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