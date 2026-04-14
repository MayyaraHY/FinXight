import pandas as pd
import logging

logger = logging.getLogger(__name__)

def extract_data(df, column_mapping):
    """
    Extract and clean data using column mapping.
    Renames columns to standardized names and validates data.
    """
    # Build reverse mapping: standardized_name -> original_columns
    reverse_mapping = {}
    for original, mapped in column_mapping.items():
        if mapped != "unknown":
            if mapped not in reverse_mapping:
                reverse_mapping[mapped] = []
            reverse_mapping[mapped].append(original)
    
    logger.info(f"Reverse mapping: {reverse_mapping}")
    
    # Rename only the mapped columns (drop duplicate mappings, keep first)
    rename_dict = {}
    seen_keys = set()
    for original, mapped in column_mapping.items():
        if mapped != "unknown" and mapped not in seen_keys:
            rename_dict[original] = mapped
            seen_keys.add(mapped)
    
    df = df.rename(columns=rename_dict)
    
    logger.info(f"DataFrame columns after renaming: {df.columns.tolist()}")
    logger.info(f"DataFrame shape: {df.shape}")
    logger.info(f"DataFrame sample:\n{df.head()}")
    
    # Verify account_code column exists
    if "account_code" not in df.columns:
        raise ValueError(
            f"Critical column 'account_code' not found. "
            f"Available columns: {df.columns.tolist()}"
        )
    
    # Convert numeric columns (handle French format: 1 000,00 → 1000.00)
    # FIXED: Added solde_final_debit and solde_final_credit
    numeric_cols = [
        "debit", "credit",
        "solde_debit", "solde_credit",
        "solde_final",  # Legacy column
        "solde_final_debit", "solde_final_credit"  # NEW: Final balance columns
    ]
    
    for col in numeric_cols:
        if col in df.columns:
            try:
                df[col] = (
                    df[col]
                    .astype(str)
                    .str.replace(" ", "")
                    .str.replace(",", ".")
                    .str.replace(r"[^\d.\-]", "", regex=True)
                )
                # Convert to numeric and fill NaN/None with 0
                df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0)
                logger.info(f"Converted column '{col}' to numeric (NaN filled with 0)")
            except Exception as e:
                logger.warning(f"Could not convert '{col}': {e}")
    
    logger.info(f"Rows before filtering: {len(df)}")
    
    # Filter: keep only rows with non-empty account_code
    df["account_code"] = df["account_code"].astype(str).str.strip()
    df = df[df["account_code"] != ""]
    df = df[df["account_code"].notna()]
    
    logger.info(f"Rows after filtering: {len(df)}")
    
    if len(df) == 0:
        raise ValueError(
            "No valid accounts after filtering. "
            f"Check account_code column: {df.columns.tolist()}"
        )
    
    logger.info(f"Sample data:\n{df.head()}")
    
    # Convert to list of dicts
    result = df.to_dict("records")
    logger.info(f"Successfully extracted {len(result)} records")
    return result