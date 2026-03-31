import os
from config.constants import DOC_TYPE_BILAN, DOC_TYPE_RESULTAT, DOC_TYPE_NOTES


def infer_doc_type(file_path: str) -> str:
    """Infer document type from file name as a fallback routing strategy."""
    name = os.path.basename(file_path).lower()
    if "bilan" in name:
        return DOC_TYPE_BILAN
    if "resultat" in name or "compte_de_resultat" in name:
        return DOC_TYPE_RESULTAT
    return DOC_TYPE_NOTES
