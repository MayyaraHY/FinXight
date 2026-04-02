import pandas as pd
import numpy as np
from app.models.account import Account
from app.repositories.account_repository import bulk_insert_accounts
from difflib import SequenceMatcher
import logging

logger = logging.getLogger(__name__)


def safe_read_csv(file_path):
    """
    Read CSV with multiple encoding and separator attempts.
    Handles files with missing/misaligned headers.
    """
    encodings = ["utf-8", "latin1", "cp1252", "iso-8859-1"]
    separators = [",", ";", "\t", "|"]

    for enc in encodings:
        for sep in separators:
            try:
                # Try reading with header
                df = pd.read_csv(file_path, encoding=enc, sep=sep)
                
                # Validation: must have at least 2 columns with data
                if df.shape[1] >= 2 and len(df) > 0:
                    return df, enc, sep, True  # True = header found
                    
            except Exception:
                pass
            
            try:
                # Try reading WITHOUT header (assume first row is data)
                df = pd.read_csv(file_path, encoding=enc, sep=sep, header=None)
                
                # Validation: must have at least 2 columns with data
                if df.shape[1] >= 2 and len(df) > 0:
                    return df, enc, sep, False  # False = no header
                    
            except Exception:
                pass

    raise Exception(
        "Unsupported CSV format - could not parse with any "
        "encoding/separator combination"
    )


def infer_csv_structure(df, has_header):
    """
    Intelligently infer the structure of the CSV.
    
    Returns:
        dict with {col_index: field_type} mapping
    """
    structure = {}
    
    # If no header, we'll need to guess based on data
    if not has_header:
        logger.info("CSV has no header - inferring structure from data")
        
        # Check first row to determine field types
        first_row = df.iloc[0]
        
        for idx, val in enumerate(first_row):
            if pd.isna(val):
                continue
                
            val_str = str(val).lower().strip()
            
            # Try to detect field type
            if any(x in val_str for x in ["account", "code", "compte", "numero", "n°"]):
                structure[idx] = "account_code"
            elif any(x in val_str for x in ["label", "description", "libellé", "name", "intitulé"]):
                structure[idx] = "label"
            elif any(x in val_str for x in ["balance", "value", "amount", "solde", "montant", "valeur"]):
                structure[idx] = "value"
            # Try numeric detection
            elif _is_numeric(val):
                structure[idx] = "value"
    
    return structure


def _is_numeric(val):
    """Check if a value can be converted to float"""
    if pd.isna(val):
        return False
    try:
        float(str(val).replace(",", ".").strip())
        return True
    except:
        return False


def find_best_column(df_columns, candidates):
    """
    Find best matching column using fuzzy matching.
    
    Args:
        df_columns: List of actual column names in DataFrame
        candidates: List of candidate names to match against
    
    Returns:
        Best matching column name or None
    """
    best_match = None
    best_score = 0.0
    
    for col in df_columns:
        col_lower = str(col).lower().strip()
        for candidate in candidates:
            candidate_lower = candidate.lower().strip()
            score = SequenceMatcher(None, col_lower, candidate_lower).ratio()
            
            if score > best_score:
                best_score = score
                best_match = col
    
    # Only accept matches above 50% similarity
    return best_match if best_score >= 0.5 else None


def detect_csv_columns(df, has_header=True):
    """
    Auto-detect account_code, label, and value columns with fuzzy matching.
    Handles cases where headers are missing or malformed.
    
    Returns:
        Dict with detected column names
    
    Raises:
        ValueError if columns cannot be detected
    """
    columns = df.columns.tolist()
    columns_str = [str(c) for c in columns]
    
    detected = {}
    
    # First, try to match by column name
    code_candidates = ["account_code", "code", "compte", "account", "numéro", "number", "n°"]
    label_candidates = ["label", "description", "libellé", "name", "intitulé", "account_name", "description"]
    value_candidates = ["value", "amount", "solde", "montant", "balance", "valeur"]
    
    detected["account_code"] = find_best_column(columns_str, code_candidates)
    detected["label"] = find_best_column(columns_str, label_candidates)
    detected["value"] = find_best_column(columns_str, value_candidates)
    
    # If detection by name fails, try detecting by position + data type
    if not has_header or any(v is None for v in detected.values()):
        logger.info("Column names unclear - detecting by data content")
        detected = _detect_columns_by_content(df, detected)
    
    # Validation
    missing = [k for k, v in detected.items() if v is None]
    if missing:
        raise ValueError(
            f"Could not detect columns for: {missing}. "
            f"Available columns: {columns}\n"
            f"Please ensure your CSV has 'account_code/code', 'label/description', "
            f"and 'value/amount' columns."
        )
    
    return detected


def _detect_columns_by_content(df, detected):
    """
    Detect columns by analyzing actual data content when headers are unclear.
    """
    # Sample first non-empty rows
    sample = df.dropna(how='all').head(10)
    
    for col_name in df.columns:
        col_data = df[col_name].dropna()
        
        if col_data.empty:
            continue
        
        # Check if column contains numeric values (likely value/amount)
        numeric_count = sum(1 for v in col_data if _is_numeric(v))
        numeric_ratio = numeric_count / len(col_data)
        
        # Check if column contains codes (short alphanumeric)
        code_like = sum(1 for v in col_data if _looks_like_code(str(v)))
        code_ratio = code_like / len(col_data)
        
        # Column inference
        if numeric_ratio > 0.7 and detected.get("value") is None:
            detected["value"] = col_name
            logger.info(f"Detected VALUE column: {col_name}")
        elif code_ratio > 0.5 and detected.get("account_code") is None:
            detected["account_code"] = col_name
            logger.info(f"Detected ACCOUNT_CODE column: {col_name}")
        elif detected.get("label") is None:
            detected["label"] = col_name
            logger.info(f"Detected LABEL column: {col_name}")
    
    return detected


def _looks_like_code(val):
    """Check if value looks like an account code (short alphanumeric, often starts with digit)"""
    val_clean = str(val).strip()
    if len(val_clean) < 2 or len(val_clean) > 20:
        return False
    # Account codes are often numeric or short alphanumeric
    return val_clean[0].isdigit() or (val_clean[0].isalpha() and len(val_clean) <= 10)


def parse_csv_and_store(db, file_path, upload_id):
    """
    Parse CSV file and store accounts in database with proper error handling.
    Handles CSVs with or without headers.
    """
    logger.info(f"Starting CSV parse for upload_id={upload_id}")
    
    df, encoding, separator, has_header = safe_read_csv(file_path)
    
    logger.info(
        f"CSV loaded: {df.shape[0]} rows, {df.shape[1]} columns. "
        f"Encoding: {encoding}, Separator: '{separator}', Has Header: {has_header}"
    )
    
    # If no header detected, use first row as header
    if not has_header:
        logger.info("Using first row as header")
        df.columns = [f"col_{i}" for i in range(df.shape[1])]
        df = df.iloc[1:].reset_index(drop=True)
    
    # Standardize column names (strip whitespace)
    df.columns = [str(col).strip() for col in df.columns]
    
    logger.info(f"Columns after processing: {df.columns.tolist()}")
    
    # Auto-detect columns
    try:
        columns = detect_csv_columns(df, has_header)
        logger.info(f"Detected columns: {columns}")
    except ValueError as e:
        logger.error(f"Column detection failed: {str(e)}")
        raise
    
    code_col = columns["account_code"]
    label_col = columns["label"]
    value_col = columns["value"]
    
    accounts = []
    errors = []
    
    for idx, row in df.iterrows():
        try:
            # Extract values
            code = row.get(code_col)
            label = row.get(label_col)
            value = row.get(value_col)
            
            # Skip entirely empty rows
            if pd.isna(code) and pd.isna(label) and pd.isna(value):
                continue
            
            # Convert to proper types with error handling
            account_code = str(code).strip() if pd.notna(code) else None
            account_label = str(label).strip() if pd.notna(label) else None
            
            # Handle numeric value
            try:
                val_str = str(value).strip().replace(",", ".") if pd.notna(value) else "0"
                account_value = float(val_str) if val_str else 0.0
            except (ValueError, TypeError) as e:
                logger.warning(f"Row {idx}: Could not parse value '{value}': {e}")
                account_value = 0.0
            
            # Skip if no account code
            if not account_code or account_code.lower() in ["nan", "none"]:
                continue
            
            account = Account(
                upload_id=upload_id,
                account_code=account_code,
                label=account_label,
                value=account_value
            )
            accounts.append(account)
        
        except Exception as e:
            error_msg = f"Row {idx + 2}: {str(e)}"  # +2 for header
            logger.warning(error_msg)
            errors.append({"row": idx + 2, "error": str(e)})
            continue
    
    if not accounts:
        error_detail = (
            f"No valid accounts parsed from CSV. "
            f"Total rows: {len(df)}, "
            f"Errors: {errors[:5] if errors else 'None'}"
        )
        logger.error(error_detail)
        raise ValueError(error_detail)
    
    # Bulk insert
    bulk_insert_accounts(db, accounts)
    
    logger.info(f"Successfully inserted {len(accounts)} accounts")
    
    return {
        "inserted": len(accounts),
        "errors": errors,
        "detected_columns": columns,
        "encoding": encoding,
        "separator": separator,
        "has_header": has_header
    }