"""
Semantic NLP-based column classification for intelligent CSV column mapping.
Combines semantic embeddings, fuzzy matching, and content analysis.
"""

import logging
import numpy as np
from typing import Dict, List, Tuple, Optional
import pandas as pd

logger = logging.getLogger(__name__)

# Try importing sentence-transformers; gracefully disable semantic matching if unavailable
try:
    from sentence_transformers import SentenceTransformer
    SEMANTIC_AVAILABLE = True
except ImportError:
    SEMANTIC_AVAILABLE = False
    logger.warning("sentence-transformers not installed. Semantic matching disabled. Using fuzzy-only fallback.")

# Enriched column mapping with semantic descriptions
# FIXED: Added solde_final_debit and solde_final_credit as separate entries
ENRICHED_COLUMN_MAPPING = {
    "account_code": {
        "keywords": ["compte", "code", "n°", "numero", "num", "n", "account", "acc"],
        "description": "numerical identifier reference code account number accounting",
        "expected_content": {"type": "numeric_or_short_text", "avg_length": 8, "numeric_ratio": 0.7},
    },
    "label": {
        "keywords": ["intitulé", "libellé", "libelle ecriture", "description", "nom", "name", "label", "designation"],
        "description": "text description designation name account title account label",
        "expected_content": {"type": "text", "avg_length": 30, "numeric_ratio": 0.0},
    },
    "debit": {
        "keywords": ["débit", "debit", "db"],
        "description": "debit amount monetary value debit column transactions",
        "expected_content": {"type": "numeric", "avg_length": 10, "numeric_ratio": 0.8, "decimal_ratio": 0.5},
    },
    "credit": {
        "keywords": ["crédit", "credit", "cr"],
        "description": "credit amount monetary value credit column transactions",
        "expected_content": {"type": "numeric", "avg_length": 10, "numeric_ratio": 0.8, "decimal_ratio": 0.5},
    },
    "solde_debit": {
        "keywords": [
            "solde débiteur", "solde debiteur", "solde deb", "solde debit",  # Period balance
            "solde pér dbt", "solde periode debit", "balance debit", "periode debit"
        ],
        "description": "balance debit total debit accounting account balance debit side period balance",
        "expected_content": {"type": "numeric", "avg_length": 12, "numeric_ratio": 0.8, "decimal_ratio": 0.6},
    },
    "solde_credit": {
        "keywords": [
            "solde créditeur", "solde crediteur", "solde cdt", "solde credit",  # Period balance
            "solde pér cdt", "solde periode credit", "balance credit", "periode credit"
        ],
        "description": "balance credit total credit accounting account balance credit side period balance",
        "expected_content": {"type": "numeric", "avg_length": 12, "numeric_ratio": 0.8, "decimal_ratio": 0.6},
    },
    "solde_final": {
        "keywords": ["solde", "solde final", "value", "montant", "total", "final", "amount", "balance", "solde final", "balance final"],
        "description": "final balance total amount final value accounting balance total final amount account balance total balance final settlement",
        "expected_content": {"type": "numeric", "avg_length": 12, "numeric_ratio": 0.85, "decimal_ratio": 0.7},
        "synonyms": ["solde total", "balance totale", "montant final", "solde arrête"],
    },
    "solde_final_debit": {
        "keywords": [
            "solde fin dbt", "solde final debit", "solde fin debit", "final debit",
            "solde final dbt", "solde final debiteur", "final balance debit"
        ],
        "description": "final balance debit side total debit accounting final account balance debit",
        "expected_content": {"type": "numeric", "avg_length": 12, "numeric_ratio": 0.85, "decimal_ratio": 0.7},
    },
    "solde_final_credit": {
        "keywords": [
            "solde fin cdt", "solde final credit", "solde fin credit", "final credit",
            "solde final cdt", "solde final crediteur", "final balance credit"
        ],
        "description": "final balance credit side total credit accounting final account balance credit",
        "expected_content": {"type": "numeric", "avg_length": 12, "numeric_ratio": 0.85, "decimal_ratio": 0.7},
    },
}


class SemanticMatcher:
    """
    Semantic matching using sentence transformers.
    Lazy loads model on first use and caches embeddings.
    Gracefully falls back to None if model unavailable.
    """

    def __init__(self):
        self.model = None
        self.embedding_cache = {}
        self.model_name = "sentence-transformers/all-MiniLM-L6-v2"

    def _ensure_model_loaded(self):
        """Lazy load semantic model on first use."""
        if self.model is None and SEMANTIC_AVAILABLE:
            try:
                logger.info(f"Loading semantic model: {self.model_name}")
                self.model = SentenceTransformer(self.model_name)
                logger.info("Semantic model loaded successfully")
            except Exception as e:
                logger.warning(f"Failed to load semantic model: {e}. Semantic matching disabled.")
                self.model = None

    def get_embedding(self, text: str) -> Optional[np.ndarray]:
        """Get embedding for text, with caching."""
        if not SEMANTIC_AVAILABLE:
            return None

        if text in self.embedding_cache:
            return self.embedding_cache[text]

        self._ensure_model_loaded()

        if self.model is None:
            return None

        try:
            embedding = self.model.encode(text, convert_to_numpy=True)
            self.embedding_cache[text] = embedding
            return embedding
        except Exception as e:
            logger.warning(f"Failed to encode text '{text}': {e}")
            return None

    def get_semantic_similarity(self, text1: str, text2: str) -> float:
        """
        Compute cosine similarity between two texts (0-1).
        Returns 0.0 if semantic matching unavailable.
        """
        emb1 = self.get_embedding(text1)
        emb2 = self.get_embedding(text2)

        if emb1 is None or emb2 is None:
            return 0.0

        try:
            # Cosine similarity
            similarity = np.dot(emb1, emb2) / (np.linalg.norm(emb1) * np.linalg.norm(emb2))
            # Scale to 0-100 for consistency with fuzzy matching
            return max(0.0, min(100.0, similarity * 100))
        except Exception as e:
            logger.warning(f"Semantic similarity computation failed: {e}")
            return 0.0


def analyze_column_content(df: pd.DataFrame, column_name: str) -> Dict:
    """
    Analyze column content to determine type and patterns.
    
    Returns dict with:
    - numeric_ratio: percentage of values that look numeric
    - text_ratio: percentage of text values
    - avg_length: average string length
    - decimal_ratio: percentage of numeric values with decimals
    - empty_ratio: percentage of empty/NaN values
    - has_large_numbers: suggests monetary values (>1000)
    """
    if column_name not in df.columns:
        logger.warning(f"Column '{column_name}' not found in DataFrame")
        return {
            "numeric_ratio": 0.0,
            "text_ratio": 0.0,
            "avg_length": 0,
            "decimal_ratio": 0.0,
            "empty_ratio": 1.0,
            "has_large_numbers": False,
        }

    col_data = df[column_name].dropna()

    if len(col_data) == 0:
        return {
            "numeric_ratio": 0.0,
            "text_ratio": 0.0,
            "avg_length": 0,
            "decimal_ratio": 0.0,
            "empty_ratio": 1.0,
            "has_large_numbers": False,
        }

    numeric_count = 0
    text_count = 0
    decimal_count = 0
    large_numbers_count = 0
    lengths = []

    for val in col_data:
        str_val = str(val).strip()
        lengths.append(len(str_val))

        # Try to parse as number (handles French format: "1 234,56")
        try:
            clean_val = str_val.replace(" ", "").replace(",", ".")
            num = float(clean_val)
            numeric_count += 1

            if "," in str_val or "." in str_val:
                decimal_count += 1

            if abs(num) > 1000:
                large_numbers_count += 1
        except ValueError:
            text_count += 1

    total = len(col_data)
    numeric_ratio = numeric_count / total if total > 0 else 0.0
    decimal_ratio = decimal_count / total if total > 0 else 0.0
    has_large_numbers = large_numbers_count / total > 0.5 if total > 0 else False
    avg_length = int(np.mean(lengths)) if lengths else 0

    return {
        "numeric_ratio": numeric_ratio,
        "text_ratio": text_count / total if total > 0 else 0.0,
        "avg_length": avg_length,
        "decimal_ratio": decimal_ratio,
        "empty_ratio": (len(df) - total) / len(df) if len(df) > 0 else 0.0,
        "has_large_numbers": has_large_numbers,
    }


def compute_content_score(column_analysis: Dict, field_expectations: Dict) -> float:
    """
    Compute content match score (0-20 points) by comparing column analysis with field expectations.
    """
    score = 0.0

    if field_expectations.get("type") == "numeric" and column_analysis["numeric_ratio"] > 0.7:
        score += 15
    elif field_expectations.get("type") == "text" and column_analysis["text_ratio"] > 0.8:
        score += 15
    elif field_expectations.get("type") == "numeric_or_short_text":
        if column_analysis["numeric_ratio"] > 0.5 or column_analysis["avg_length"] < 10:
            score += 12

    # Check decimal presence for monetary fields
    if field_expectations.get("decimal_ratio", 0) > 0.4:
        if column_analysis["decimal_ratio"] > 0.3:
            score += 3

    # Check for large numbers (indicator of monetary values)
    if column_analysis["has_large_numbers"] and field_expectations.get("type") == "numeric":
        score += 2

    # Penalize if too many empty values
    if column_analysis["empty_ratio"] > 0.5:
        score -= 5

    return max(0.0, min(20.0, score))


def validate_and_boost_mapping(
    mapping: Dict[str, str], df: pd.DataFrame, confidence_scores: Dict[str, float]
) -> Dict[str, float]:
    """
    Post-classification validation and confidence boosting using content analysis.
    Returns updated confidence scores.
    """
    updated_scores = confidence_scores.copy()

    for column_name, field_name in mapping.items():
        if field_name == "unknown":
            continue

        # Skip if already high confidence from semantic+fuzzy
        if updated_scores.get(column_name, 0) > 85:
            continue

        # Analyze column content
        analysis = analyze_column_content(df, column_name)
        field_expectations = ENRICHED_COLUMN_MAPPING.get(field_name, {}).get("expected_content", {})

        content_score = compute_content_score(analysis, field_expectations)

        # Boost confidence based on content match
        if content_score > 12:
            boost = content_score * 0.25  # 20-point content score → up to 5-point boost
            new_confidence = min(100.0, updated_scores.get(column_name, 0) + boost)
            logger.debug(
                f"Boosting '{column_name}' → '{field_name}': "
                f"{updated_scores.get(column_name, 0):.1f}% → {new_confidence:.1f}% "
                f"(content_score={content_score:.1f})"
            )
            updated_scores[column_name] = new_confidence

        # Flag suspicious classifications (content doesn't match field type)
        elif content_score < 5 and updated_scores.get(column_name, 0) < 75:
            logger.warning(
                f"⚠ Suspicious classification: '{column_name}' → '{field_name}' "
                f"(confidence={updated_scores.get(column_name, 0):.1f}%, content_score={content_score:.1f})"
            )

    return updated_scores


# Global semantic matcher instance (singleton)
_semantic_matcher = None


def get_semantic_matcher() -> SemanticMatcher:
    """Get or create global semantic matcher instance."""
    global _semantic_matcher
    if _semantic_matcher is None:
        _semantic_matcher = SemanticMatcher()
    return _semantic_matcher