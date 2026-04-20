from app.services.csv_parsing_service import parse_csv
from app.repositories.upload_repository import *
from app.core.config import settings
import logging
import os
from app.repositories.account_repository import save_accounts
from app.utils.helpers import detect_encoding, detect_delimiter, read_csv


logger = logging.getLogger(__name__)

os.makedirs(settings.UPLOAD_DIR, exist_ok=True)


def upload_document(db, file, display_filename: str = None):
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
            file_path=file_path,
            display_filename=display_filename
        )

        logger.info(f"Upload registered with ID: {upload.id}")

        return {
            "status": "success",
            "upload_id": upload.id,
            "filename": upload.filename,
            "display_filename": upload.display_filename or upload.filename,
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


def upload_and_parse_document(db, file, display_filename: str = None):
    """
    Upload + parse in one step.
    Saves file, registers upload, parses CSV, and stores accounts.

    Returns full parsing result.
    """
    file_path = None

    try:
        # 📁 Save file
        file_path = os.path.join(settings.UPLOAD_DIR, file.filename)
        with open(file_path, "wb") as f:
            f.write(file.file.read())

        logger.info(f"File saved: {file_path}")

        # 🗄️ Save upload metadata
        upload = create_upload(
            db=db,
            filename=file.filename,
            file_path=file_path,
            display_filename=display_filename
        )

        logger.info(f"Upload registered with ID: {upload.id}")

        # 🚀 AUTO PARSE (THIS IS THE KEY PART)
        with open(upload.file_path, "rb") as f:
            validated_data = parse_csv(f, upload.id)

        # 💾 Save parsed accounts
        save_accounts(db, validated_data, upload.id)

        # 📊 Result
        return {
            "status": "success",
            "upload_id": upload.id,
            "filename": upload.filename,
            "display_filename": upload.display_filename or upload.filename,
            "accounts_inserted": len(validated_data),
            "detected_columns": list(validated_data[0].keys()) if validated_data else [],
            "message": "File uploaded and parsed successfully"
        }

    except Exception as e:
        logger.error(f"Upload+Parse failed: {str(e)}", exc_info=True)

        # 🧹 Cleanup file if error
        if file_path and os.path.exists(file_path):
            try:
                os.remove(file_path)
            except:
                pass

        raise


# Legacy alias for backward compatibility
def save_file_and_register(db, file, display_filename: str = None):
    """
    Legacy function - use upload_and_parse_document() instead.
    Kept for backward compatibility.
    """
    return upload_and_parse_document(db, file, display_filename=display_filename)


def preview_csv_file(db, upload_id: int, rows: int = 20):
    """
    Get a preview of a CSV file without full parsing.
    Returns column headers, first N rows, and total row count.
    
    Args:
        db: Database session
        upload_id: ID of the uploaded file to preview
        rows: Number of rows to return (default 20)
        
    Returns:
        Dict with headers, preview_data, and total_rows
    """
    try:
        # Get upload metadata
        upload = get_upload_by_id(db, upload_id)
        if not upload:
            raise ValueError(f"Upload with ID {upload_id} not found")

        logger.info(f"Previewing upload {upload_id}: {upload.filename}")

        # Detect encoding and delimiter
        with open(upload.file_path, "rb") as f:
            encoding = detect_encoding(f)
            delimiter = detect_delimiter(f)

        # Read CSV file
        with open(upload.file_path, "rb") as f:
            df = read_csv(f, encoding, delimiter)

        # Get headers (first row)
        headers = df.iloc[0].tolist() if len(df) > 0 else []

        # Get preview rows (skip first row if it's headers)
        preview_df = df.iloc[1:rows + 1]
        preview_data = preview_df.values.tolist()

        # Get total row count (excluding header)
        total_rows = len(df) - 1 if len(df) > 1 else 0

        logger.info(
            f"Preview for upload {upload_id}: {len(preview_data)} preview rows, "
            f"{total_rows} total rows"
        )

        return {
            "status": "success",
            "upload_id": upload_id,
            "filename": upload.filename,
            "headers": headers,
            "preview_data": preview_data,
            "preview_row_count": len(preview_data),
            "total_rows": total_rows,
            "encoding": encoding,
            "delimiter": delimiter
        }

    except Exception as e:
        logger.error(f"Preview failed for upload {upload_id}: {str(e)}", exc_info=True)
        raise


def preview_mapped_columns(db, upload_id: int, rows: int = 10):
    """
    Preview the FINAL MAPPED COLUMNS after classification.
    Shows how many columns will be extracted and their standardized names.
    This runs the full classification pipeline WITHOUT saving to database.
    
    Perfect for showing in CMS before user confirms the import.
    
    Args:
        db: Database session
        upload_id: ID of the uploaded file
        rows: Number of preview rows to return (default 10)
        
    Returns:
        Dict with:
        - extracted_columns: List of mapped column names (e.g., ["account_code", "label", "debit"])
        - column_count: Number of extracted columns
        - column_mapping: Dict showing original -> mapped names
        - confidence_scores: Dict with confidence % for each mapping
        - preview_data: Sample data with standardized column names
        - preview_row_count: Number of preview rows
        - warning_columns: List of columns with low confidence (<50%)
    """
    try:
        # Get upload metadata
        upload = get_upload_by_id(db, upload_id)
        if not upload:
            raise ValueError(f"Upload with ID {upload_id} not found")

        logger.info(f"Previewing mapped columns for upload {upload_id}: {upload.filename}")

        # Open file and run classification pipeline (without saving)
        with open(upload.file_path, "rb") as f:
            # Run the full parse_csv pipeline which includes:
            # - Encoding/delimiter detection
            # - Header detection
            # - DataFrame preparation (normalization)
            # - Column classification with confidence scores
            # - Data extraction
            # - Validation
            validated_data = parse_csv(f, upload_id)

        # Extract final column names from validated data
        if validated_data:
            extracted_columns = list(validated_data[0].keys())
        else:
            extracted_columns = []

        # Get column mapping and confidence scores from parsing
        # We need to re-run just the classification part to capture these
        with open(upload.file_path, "rb") as f:
            from app.services.header_detector import detect_header
            from app.services.column_classifier import classify_columns_smart
            from app.services.preparation_service import prepare_dataframe
            from app.utils.helpers import detect_encoding as util_detect_encoding
            from app.utils.helpers import detect_delimiter as util_detect_delimiter
            from app.utils.helpers import read_csv as util_read_csv

            # Step 1: Detect encoding and delimiter
            encoding = util_detect_encoding(f)
            delimiter = util_detect_delimiter(f)

            # Step 2: Read CSV
            df = util_read_csv(f, encoding, delimiter)

            # Step 3: Detect header
            header = detect_header(df)
            df.columns = header

            # Step 4: Prepare (normalize)
            df = prepare_dataframe(df)

            # Step 5: Classify columns
            column_mapping, confidence_scores = classify_columns_smart(df.columns, df)

        # Identify low-confidence mappings
        warning_columns = [
            (col, confidence) 
            for col, confidence in confidence_scores.items() 
            if confidence < 50 and column_mapping.get(col) != "unknown"
        ]

        # Get preview rows
        preview_data = validated_data[:rows] if validated_data else []

        logger.info(
            f"Mapped columns for upload {upload_id}: {extracted_columns} "
            f"({len(extracted_columns)} columns, {len(preview_data)} preview rows)"
        )

        return {
            "status": "success",
            "upload_id": upload_id,
            "filename": upload.filename,
            "extracted_columns": extracted_columns,
            "column_count": len(extracted_columns),
            "column_mapping": column_mapping,  # original -> mapped
            "confidence_scores": confidence_scores,  # col -> % confidence
            "preview_data": preview_data,
            "preview_row_count": len(preview_data),
            "warning_columns": warning_columns,  # Low confidence mappings
            "message": f"Found {len(extracted_columns)} columns ready to import"
        }

    except Exception as e:
        logger.error(f"Mapped column preview failed for upload {upload_id}: {str(e)}", exc_info=True)
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