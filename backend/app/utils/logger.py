import logging

logging.basicConfig(filename="parsing.log", level=logging.INFO)

def log_parsing(upload_id, encoding, delimiter, column_mapping, confidence_scores=None):
    """
    Log parsing details including column mappings and confidence scores.
    """
    if confidence_scores is None:
        confidence_scores = {}
    
    confidence_str = ", ".join(
        [f"'{col}': {conf:.1f}%" for col, conf in confidence_scores.items()]
    ) if confidence_scores else "N/A"
    
    logging.info(
        f"Upload {upload_id}: "
        f"Encoding={encoding}, "
        f"Delimiter={delimiter}, "
        f"Columns={column_mapping}, "
        f"Confidence_Scores={{{confidence_str}}}"
    )