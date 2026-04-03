import pandas as pd
import logging

logger = logging.getLogger(__name__)

def _is_numeric(val):
    """
    Check if a string value looks numeric.
    """
    v = str(val).lower().strip()
    if not v or v in ['nan', 'none', '']:
        return False
    # Try to parse as number (handle French format)
    v_clean = v.replace(' ', '').replace(',', '.').replace('.', '', v.count('.') - 1 if v.count('.') > 0 else 0).replace('.', '', 1)
    try:
        float(v_clean)
        return True
    except ValueError:
        return False

def detect_header(df):
    """
    Detect the actual header row in the dataframe.
    Skips title rows and finds the row with actual column names.
    Returns: list of header strings (with empty columns removed)
    """
    # If dataframe is empty, return default columns
    if df.empty:
        logger.warning("DataFrame is empty, using default columns")
        return [f"col_{i}" for i in range(len(df.columns))]
    
    # Clean and filter column names - remove empty strings
    current_cols = [str(col).strip() for col in df.columns.tolist()]
    current_cols = [col for col in current_cols if col]  # Filter empty strings
    
    # If current columns have actual names (not col_X), return them
    if current_cols and not all(str(col).startswith('col_') for col in current_cols):
        logger.info(f"Using existing column names (cleaned): {current_cols}")
        return current_cols
    
    # Try to find header in first N rows by looking for text-like content
    # Skip obvious title rows (single column with text, or very few columns with data)
    max_rows_to_check = min(10, len(df))
    
    for idx in range(max_rows_to_check):
        row = df.iloc[idx]
        row_str = [str(v).strip() for v in row]
        
        # Skip if this looks like a title row (single non-empty column)
        non_empty_count = sum(1 for v in row_str if v and v.lower() not in ['nan', 'none'])
        if non_empty_count <= 1:
            logger.debug(f"Row {idx} looks like title (only {non_empty_count} non-empty), skipping")
            continue
        
        # Check if this row looks like a header (has non-numeric values)
        non_numeric = sum(1 for v in row_str if v and not _is_numeric(v))
        
        # If row has mostly non-numeric values at reasonable positions, it's likely the header
        if non_numeric > len(row) * 0.4:  # At least 40% non-numeric
            logger.info(f"Detected header at row {idx}: {row_str}")
            return row_str
    
    # Fallback: use first row as header
    header = df.iloc[0].tolist()
    logger.warning(f"Using first row as header (fallback): {header}")
    return header

def clean_header(header):
    """
    Strip whitespace, lowercase, and normalize French terms.
    """
    return [str(col).strip().lower().replace("é", "e").replace("ç", "c") for col in header]