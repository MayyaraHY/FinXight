import pandas as pd
import unicodedata
import re
import logging
from io import StringIO

logger = logging.getLogger(__name__)


def normalize_string(text: str) -> str:
    """
    Normalize a string by:
    1. Converting to lowercase
    2. Removing accents (é->e, è->e, à->a, etc.)
    3. Removing/replacing special characters properly
    4. Stripping whitespace
    
    Args:
        text: String to normalize
        
    Returns:
        Normalized lowercased string
    """
    if not isinstance(text, str):
        return str(text)
    
    # 1. Lowercase
    text = text.lower()
    
    # 2. Remove accents using Unicode normalization (NFD)
    text = unicodedata.normalize('NFD', text)
    text = ''.join(c for c in text if unicodedata.category(c) != 'Mn')
    
    # 3. Replace special punctuation with spaces (not just remove)
    # Replace dashes, slashes, dots, underscores, apostrophes, etc. with spaces
    text = re.sub(r"[-/._']", ' ', text)
    
    # 4. Remove remaining special chars but keep letters, numbers, spaces
    # Remove: (), [], {}, €, °, ∞, etc. but NOT spaces
    text = re.sub(r'[°∞\(\)\[\]{},;:|€¢£¥]', '', text)
    
    # 5. Normalize multiple spaces to single space
    text = re.sub(r'\s+', ' ', text)
    
    # 6. Remove remaining quotes if any
    text = re.sub(r'["\"]', '', text)
    
    # 7. Strip whitespace
    return text.strip()


def prepare_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    """
    Prepare a DataFrame for processing by:
    1. Normalizing column names (lowercase, remove accents, remove special chars)
    2. Removing empty columns
    3. Normalizing data values in each column (lowercase, remove accents)
    
    Args:
        df: Input DataFrame
        
    Returns:
        Prepared DataFrame with normalized column names and data
    """
    logger.info("Starting DataFrame preparation...")
    
    # Make a copy to avoid SettingWithCopyWarning
    df = df.copy()
    
    # Step 1: Normalize column names
    original_columns = df.columns.tolist()
    normalized_columns = [normalize_string(col) for col in original_columns]
    df.columns = normalized_columns
    logger.info(f"Normalized column names: {dict(zip(original_columns, normalized_columns))}")
    
    # Step 2: Remove empty columns
    df = df.loc[:, df.columns.str.strip() != '']
    logger.info(f"Removed empty columns. Remaining: {df.columns.tolist()}")
    
    # Step 3: Normalize data values in all columns to lowercase and remove accents
    for col in df.columns:
        if df[col].dtype == 'object':  # Only process string columns
            df[col] = df[col].apply(
                lambda x: normalize_string(str(x)) if pd.notna(x) else x
            )
    
    logger.info("DataFrame preparation complete")
    return df


def prepare_dataframe_from_stream(file_stream, encoding: str, delimiter: str) -> pd.DataFrame:
    """
    Read CSV from a file stream and prepare it (normalize column names and data).
    
    Args:
        file_stream: File stream object
        encoding: File encoding (e.g., 'utf-8', 'latin-1')
        delimiter: CSV delimiter (e.g., ',', ';')
        
    Returns:
        Prepared DataFrame with normalized columns and data
    """
    logger.info(f"Reading CSV from stream with encoding={encoding}, delimiter={delimiter}")
    
    # Read CSV
    df = pd.read_csv(file_stream, encoding=encoding, delimiter=delimiter)
    logger.info(f"Raw DataFrame shape: {df.shape}, columns: {df.columns.tolist()}")
    
    # Prepare (normalize)
    df = prepare_dataframe(df)
    logger.info(f"Prepared DataFrame shape: {df.shape}, columns: {df.columns.tolist()}")
    
    return df


def get_normalization_mapping(original_columns: list, normalized_columns: list) -> dict:
    """
    Get a mapping from original column names to normalized column names.
    Useful for tracking transformations.
    
    Args:
        original_columns: List of original column names
        normalized_columns: List of normalized column names
        
    Returns:
        Dict mapping original -> normalized names
    """
    return dict(zip(original_columns, normalized_columns))
