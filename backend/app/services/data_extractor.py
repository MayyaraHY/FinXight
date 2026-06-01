import pandas as pd
import logging

from app.utils.helpers import parse_french_number

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

    # C3: surface duplicate mappings instead of dropping them silently
    for mapped, originals in reverse_mapping.items():
        if len(originals) > 1:
            logger.warning(
                f"Multiple source columns mapped to '{mapped}': {originals}. "
                f"Keeping the first ('{originals[0]}') and ignoring the rest — "
                f"review the column classification for this file."
            )

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
    
    # Convert numeric columns (handle French format: 1 000,00 → 1000.00).
    # "rubrique" is intentionally NOT here — it is a text category label,
    # preserved as-is and saved to accounts.source_rubrique.
    numeric_cols = [
        "debit", "credit",
        "solde_debit", "solde_credit",
        "solde_final",  # Legacy column
        "solde_final_debit", "solde_final_credit",
        "opening_debit", "opening_credit",
    ]
    
    for col in numeric_cols:
        if col in df.columns:
            try:
                original = df[col].astype(str)
                # parse_french_number returns None only for non-empty unparseable values
                parsed = df[col].apply(parse_french_number)

                # Log real (non-empty) values we failed to parse BEFORE zeroing them,
                # so corrupted data is visible instead of silently becoming 0.
                stripped = original.str.strip().str.lower()
                non_empty = ~stripped.isin(["", "nan", "none", "null"])
                failed_mask = parsed.isna() & non_empty
                n_failed = int(failed_mask.sum())
                if n_failed:
                    samples = original[failed_mask].unique().tolist()[:5]
                    logger.warning(
                        f"Column '{col}': {n_failed} non-empty value(s) could not be "
                        f"parsed as numbers and were set to 0. Samples: {samples}"
                    )

                df[col] = pd.to_numeric(parsed.fillna(0), errors="coerce").fillna(0)
                logger.info(f"Converted column '{col}' to numeric via parse_french_number")
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