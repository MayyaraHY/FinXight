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

    Returns:
        tuple (header, data_start_index) where
          - header: list of header strings (same width as df)
          - data_start_index: index of the first real DATA row; the caller should
            slice ``df.iloc[data_start_index:]`` to drop title rows AND the header
            row itself. 0 means "all rows are data" (columns were already real names).
    """
    # If dataframe is empty, return default columns
    if df.empty:
        logger.warning("DataFrame is empty, using default columns")
        return [f"col_{i}" for i in range(len(df.columns))], 0

    # Clean and filter column names - remove empty strings
    current_cols = [str(col).strip() for col in df.columns.tolist()]
    non_empty_cols = [col for col in current_cols if col]

    # If current columns are already real names (not col_X), keep them; all rows are data.
    if non_empty_cols and not all(str(col).startswith('col_') for col in current_cols):
        logger.info(f"Using existing column names: {current_cols}")
        return current_cols, 0

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
            # Data starts on the row AFTER the header; rows above are titles.
            return row_str, idx + 1

    # Fallback: use first row as header, data starts on the second row
    header = df.iloc[0].tolist()
    logger.warning(f"Using first row as header (fallback): {header}")
    return header, 1