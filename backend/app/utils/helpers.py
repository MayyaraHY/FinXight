import chardet
import pandas as pd
import io
import logging

logger = logging.getLogger(__name__)

def detect_encoding(file):
    """
    Detect the encoding of the uploaded file.
    """
    file.seek(0)
    raw_data = file.read(1024)  # Read first 1024 bytes for detection
    file.seek(0)  # Reset file pointer
    result = chardet.detect(raw_data)
    return result['encoding']

def detect_delimiter(file, encoding=None):
    """
    Detect the delimiter of the CSV file.
    Try multiple encodings if the detected one fails.
    """
    file.seek(0)
    
    # List of encodings to try
    encodings_to_try = [encoding] if encoding else []
    encodings_to_try.extend(['utf-8', 'latin1', 'cp1252', 'iso-8859-1'])
    
    first_line = None
    for enc in encodings_to_try:
        if enc is None:
            continue
        try:
            file.seek(0)
            first_line = file.readline().decode(enc)
            logger.info(f"Successfully decoded first line with {enc}")
            break
        except (UnicodeDecodeError, LookupError) as e:
            logger.debug(f"Failed to decode with {enc}: {e}")
            continue
    
    file.seek(0)
    
    if first_line is None:
        logger.warning("Could not decode first line with any encoding, assuming semicolon")
        return ';'

    # Common delimiters to test
    delimiters = [',', ';', '\t', '|']
    delimiter_counts = {}

    for delimiter in delimiters:
        delimiter_counts[delimiter] = first_line.count(delimiter)

    # Return the delimiter with the highest count
    best_delim = max(delimiter_counts, key=delimiter_counts.get)
    logger.info(f"Detected delimiter: '{best_delim}' from: {delimiter_counts}")
    return best_delim

def read_csv(file, encoding, delimiter):
    """
    Read the CSV file into a pandas DataFrame.
    Always reads WITHOUT a header assumption so detect_header() can find it.
    """
    file.seek(0)
    try:
        # Always read with header=None so we can manually detect the header
        df = pd.read_csv(
            io.StringIO(file.read().decode(encoding)),
            delimiter=delimiter,
            dtype=str,
            keep_default_na=False,
            header=None,  # Do NOT assume first row is header
        )
        
        # Give default column names
        df.columns = [f"col_{i}" for i in range(len(df.columns))]
        
        logger.info(f"CSV read successfully: {df.shape[0]} rows, {df.shape[1]} columns")
        
    except Exception as e:
        logger.error(f"Error reading CSV: {e}")
        raise

    return df