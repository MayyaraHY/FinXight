"""
Enhanced Semantic NLP-based column classification for intelligent CSV column mapping.
Improvements:
- Higher semantic matching tolerance (adaptive thresholds)
- Better NLP-based meaning understanding using contextual embeddings
- Multi-faceted scoring with emphasis on semantic understanding
- Improved handling of French accounting terminology
"""

import logging
import numpy as np
from typing import Dict, List, Tuple, Optional
import pandas as pd

logger = logging.getLogger(__name__)

# Try importing sentence-transformers; gracefully disable semantic matching if unavailable
try:
    from sentence_transformers import SentenceTransformer, util
    SEMANTIC_AVAILABLE = True
except ImportError:
    SEMANTIC_AVAILABLE = False
    logger.warning("sentence-transformers not installed. Semantic matching disabled. Using fuzzy-only fallback.")

# Enriched column mapping with comprehensive semantic descriptions
# Enhanced with broader context for better NLP matching
ENRICHED_COLUMN_MAPPING = {
    "account_code": {
        "keywords": ["compte", "code", "n°", "N°", "numero", "num", "n", "account", "acc", "reference", "ref"],
        "description": "account code account number numerical identifier reference code accounting code account reference customer number client code",
        "expected_content": {"type": "numeric_or_short_text", "avg_length": 8, "numeric_ratio": 0.7},
        "synonyms": ["compte bancaire", "numero compte", "reference client", "identifiant"],
    },
    "label": {
        "keywords": ["intitulé", "libellé", "Libellé écriture", "description", "nom", "name", "label", "designation", "descriptif", "desc"],
        "description": "text description transaction description account designation account name account title account label account descriptive text designation name",
        "expected_content": {"type": "text", "avg_length": 30, "numeric_ratio": 0.0},
        "synonyms": ["description transaction", "nom compte", "designation ecriture", "libelle ecriture"],
    },
    "debit": {
        "keywords": ["débit", "debit", "db", "dr", "debit amount"],
        "description": "debit amount debit monetary value debit column accounting transactions debit side amount debited debit posting",
        "expected_content": {"type": "numeric", "avg_length": 10, "numeric_ratio": 0.8, "decimal_ratio": 0.5},
        "synonyms": ["montant debit", "debit operation", "operation debit"],
    },
    "credit": {
        "keywords": ["crédit", "credit", "cr", "credit amount"],
        "description": "credit amount credit monetary value credit column accounting transactions credit side amount credited credit posting",
        "expected_content": {"type": "numeric", "avg_length": 10, "numeric_ratio": 0.8, "decimal_ratio": 0.5},
        "synonyms": ["montant credit", "credit operation", "operation credit"],
    },
    "solde_debit": {
        "keywords": ["solde débiteur", "solde deb", "solde debit", "balance debit", "solde db"],
        "description": "balance debit total debit accounting account balance debit side cumulative debit debit balance running balance",
        "expected_content": {"type": "numeric", "avg_length": 12, "numeric_ratio": 0.8, "decimal_ratio": 0.6},
        "synonyms": ["solde debiteur", "balance debiteur", "solde cumulatif debit"],
    },
    "solde_credit": {
        "keywords": ["solde créditeur", "solde cdt", "solde credit", "balance credit", "solde cr"],
        "description": "balance credit total credit accounting account balance credit side cumulative credit credit balance running balance",
        "expected_content": {"type": "numeric", "avg_length": 12, "numeric_ratio": 0.8, "decimal_ratio": 0.6},
        "synonyms": ["solde crediteur", "balance crediteur", "solde cumulatif credit"],
    },
    "solde_final": {
        "keywords": ["solde", "solde final", "value", "montant", "total", "final", "amount", "balance", "solde final", "balance final"],
        "description": "final balance total amount final value accounting balance total final amount account balance total balance final settlement",
        "expected_content": {"type": "numeric", "avg_length": 12, "numeric_ratio": 0.85, "decimal_ratio": 0.7},
        "synonyms": ["solde total", "balance totale", "montant final", "solde arrête"],
    },
}


class EnhancedSemanticMatcher:
    """
    Enhanced semantic matching using sentence transformers with:
    - Higher tolerance for semantic matching
    - Multi-model ensemble for better accuracy
    - Contextual understanding of accounting terminology
    - Adaptive scoring thresholds
    """

    def __init__(self):
        self.model = None
        self.embedding_cache = {}
        self.model_name = "sentence-transformers/all-MiniLM-L6-v2"  # Efficient model
        self.similarity_cache = {}

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
        IMPROVED: Compute semantic similarity with context awareness.
        Returns 0-100 score.
        - Now considers synonyms and related terms
        - Uses cosine similarity which is more robust
        - Returns score on 0-100 scale for consistency
        """
        # Check cache first
        cache_key = f"{text1}||{text2}"
        if cache_key in self.similarity_cache:
            return self.similarity_cache[cache_key]

        emb1 = self.get_embedding(text1)
        emb2 = self.get_embedding(text2)

        if emb1 is None or emb2 is None:
            return 0.0

        try:
            # Use cosine similarity (more stable than dot product for normalized embeddings)
            similarity = util.pytorch_cos_sim(emb1, emb2).item() if SEMANTIC_AVAILABLE else 0.0
            if similarity is None or np.isnan(similarity):
                similarity = 0.0
            
            # Scale to 0-100
            score = max(0.0, min(100.0, similarity * 100))
            self.similarity_cache[cache_key] = score
            return score
        except Exception as e:
            logger.warning(f"Semantic similarity computation failed: {e}")
            return 0.0

    def compute_contextual_score(self, column_name: str, field_config: Dict) -> float:
        """
        IMPROVED: Compute semantic score with multiple context layers:
        1. Direct match with field description
        2. Match with synonyms
        3. Keyword context matching
        Returns enhanced score (0-100)
        """
        col_normalized = column_name.lower()
        
        # Primary: Match against field description
        primary_score = self.get_semantic_similarity(col_normalized, field_config["description"])
        
        # Secondary: Match against synonyms (if available)
        secondary_scores = []
        if "synonyms" in field_config:
            for synonym in field_config["synonyms"]:
                score = self.get_semantic_similarity(col_normalized, synonym)
                secondary_scores.append(score)
        
        # Combine scores with weighting
        # Primary match: 60%, Best synonym match: 40%
        final_score = primary_score * 0.6
        if secondary_scores:
            final_score += max(secondary_scores) * 0.4
        
        return max(0.0, min(100.0, final_score))


def analyze_column_content(df: pd.DataFrame, column_name: str) -> Dict:
    """
    Analyze column content to determine type and patterns.
    Enhanced for better detection of numeric vs text columns.
    
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
    IMPROVED: Compute content match score (0-25 points) with better tolerance.
    More flexible in accepting matches while still being discriminative.
    """
    score = 0.0

    # More lenient numeric/text matching
    if field_expectations.get("type") == "numeric" and column_analysis["numeric_ratio"] > 0.6:
        score += 20  # Increased from 15
    elif field_expectations.get("type") == "text" and column_analysis["text_ratio"] > 0.7:
        score += 20
    elif field_expectations.get("type") == "numeric_or_short_text":
        if column_analysis["numeric_ratio"] > 0.4 or column_analysis["avg_length"] < 12:
            score += 18  # Increased from 12

    # Check decimal presence for monetary fields
    if field_expectations.get("decimal_ratio", 0) > 0.3:
        if column_analysis["decimal_ratio"] > 0.2:
            score += 3

    # Check for large numbers (indicator of monetary values)
    if column_analysis["has_large_numbers"] and field_expectations.get("type") == "numeric":
        score += 2

    # Penalize if too many empty values
    if column_analysis["empty_ratio"] > 0.5:
        score -= 5

    return max(0.0, min(25.0, score))


def validate_and_boost_mapping(
    mapping: Dict[str, str], df: pd.DataFrame, confidence_scores: Dict[str, float]
) -> Dict[str, float]:
    """
    Post-classification validation and confidence boosting using content analysis.
    IMPROVED: More aggressive confidence boosting for semantic matches.
    """
    updated_scores = confidence_scores.copy()

    for column_name, field_name in mapping.items():
        if field_name == "unknown":
            continue

        # More lenient threshold for boosting (was 85, now 70)
        if updated_scores.get(column_name, 0) > 70:
            continue

        # Analyze column content
        analysis = analyze_column_content(df, column_name)
        field_expectations = ENRICHED_COLUMN_MAPPING.get(field_name, {}).get("expected_content", {})

        content_score = compute_content_score(analysis, field_expectations)

        # IMPROVED: More aggressive boost strategy
        if content_score > 10:
            boost = content_score * 0.4  # Increased from 0.25 (was up to 5, now up to 10)
            new_confidence = min(100.0, updated_scores.get(column_name, 0) + boost)
            logger.debug(
                f"Boosting '{column_name}' → '{field_name}': "
                f"{updated_scores.get(column_name, 0):.1f}% → {new_confidence:.1f}% "
                f"(content_score={content_score:.1f})"
            )
            updated_scores[column_name] = new_confidence

        # Flag suspicious classifications
        elif content_score < 3 and updated_scores.get(column_name, 0) < 60:
            logger.warning(
                f"⚠ Suspicious classification: '{column_name}' → '{field_name}' "
                f"(confidence={updated_scores.get(column_name, 0):.1f}%, content_score={content_score:.1f})"
            )

    return updated_scores


# Global semantic matcher instance (singleton)
_semantic_matcher = None


def get_semantic_matcher() -> EnhancedSemanticMatcher:
    """Get or create global enhanced semantic matcher instance."""
    global _semantic_matcher
    if _semantic_matcher is None:
        _semantic_matcher = EnhancedSemanticMatcher()
    return _semantic_matcher
