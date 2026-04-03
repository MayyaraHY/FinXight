from app.services.header_detector import detect_header
from app.services.column_classifier import classify_columns_smart
from app.services.data_extractor import extract_data
from app.services.validator import validate_accounts
from app.services.preparation_service import prepare_dataframe
from app.utils.logger import log_parsing
from app.utils.helpers import detect_encoding, detect_delimiter, read_csv
import logging

logger = logging.getLogger(__name__)

def parse_csv(file, upload_id):
    # Step 1: Detect encoding and delimiter
    encoding = detect_encoding(file)
    delimiter = detect_delimiter(file)

    # Step 2: Read CSV with detected encoding/delimiter
    df = read_csv(file, encoding, delimiter)
    logger.info(f"Raw columns after reading CSV: {df.columns.tolist()}")

    # Step 3: Detect and clean header
    header = detect_header(df)
    df.columns = header
    
    # Step 4: Prepare DataFrame (normalize all data before classification)
    # This will:
    # - Normalize column names (lowercase, remove accents, remove special chars)
    # - Remove empty columns
    # - Normalize all data values
    logger.info("Preparing DataFrame: normalizing column names and data...")
    df = prepare_dataframe(df)
    logger.info(f"Columns after preparation: {df.columns.tolist()}")

    # Step 5: Classify columns using intelligent NLP-based matching (French)
    logger.info("Starting NLP-based column classification with semantic matching...")
    column_mapping, confidence_scores = classify_columns_smart(df.columns, df)
    
    # Log confidence scores for transparency
    logger.info("Column classification results with confidence:")
    for col in df.columns:
        confidence = confidence_scores.get(col, 0.0)
        mapped_to = column_mapping.get(col, "unknown")
        logger.info(f"  '{col}' → '{mapped_to}' (confidence: {confidence:.1f}%)")

    # Step 6: Extract and clean data
    extracted_data = extract_data(df, column_mapping)

    # Step 7: Validate account codes
    validated_data = validate_accounts(extracted_data)

    # Step 8: Log parsing details
    log_parsing(upload_id, encoding, delimiter, column_mapping, confidence_scores)

    return validated_data