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
        "keywords": ["compte", "code", "n", "num", "numero", "account", "acc"],
        "description": "numerical identifier reference code account number accounting",
        "expected_content": {"type": "numeric_or_short_text", "avg_length": 8, "numeric_ratio": 0.7},
        "priority": 10,
    },
    "label": {
        "keywords": ["intitule", "libelle", "designation", "description", "nom", "name", "label"],
        "description": "text description designation name account title account label",
        "expected_content": {"type": "text", "avg_length": 30, "numeric_ratio": 0.0},
        "priority": 10,
    },
    
    # ============ OPENING BALANCES (Start of period) ============
    "opening_debit": {
        "keywords": [
            # Your exact format (WITHOUT accents after normalization)
            "solde ant dbt",
            "solde ant dbt ref",
            "solde anterior dbt",
            "solde ancien dbt",
            "solde ancien debit",
            # Other variants
            "ouverture debit",
            "opening debit",
            "initial debit",
            "balance initiale dbt",
            "solde d ouverture dbt",
        ],
        "description": "opening balance debit previous period balance beginning balance debit anterior",
        "expected_content": {"type": "numeric", "avg_length": 12, "numeric_ratio": 0.85, "decimal_ratio": 0.6},
        "priority": 9,
    },
    "opening_credit": {
        "keywords": [
            # Your exact format (WITHOUT accents after normalization)
            "solde ant cdt",
            "solde ant cdt ref",
            "solde anterior cdt",
            "solde ancien cdt",
            "solde ancien credit",
            # Other variants
            "ouverture credit",
            "opening credit",
            "initial credit",
            "balance initiale cdt",
            "solde d ouverture cdt",
        ],
        "description": "opening balance credit previous period balance beginning balance credit anterior",
        "expected_content": {"type": "numeric", "avg_length": 12, "numeric_ratio": 0.85, "decimal_ratio": 0.6},
        "priority": 9,
    },
    
    # ============ PERIOD MOVEMENTS (Actual debit/credit entries in period) ============
    "debit": {
        "keywords": [
            # Your exact format (WITHOUT accents)
            "debit periode ref",
            "debit period ref",
            "debit periode",
            "debit period",
            # Variations
            "debit mouvement",
            "mouvement debit",
            "debit",  # Last resort - too generic
            "db",
        ],
        "description": "debit amount monetary value debit column transactions period movement",
        "expected_content": {"type": "numeric", "avg_length": 10, "numeric_ratio": 0.8, "decimal_ratio": 0.5},
        "priority": 8,
        "must_exclude_keywords": ["solde", "fin", "final", "ant"],  # Don't match if contains these
    },
    "credit": {
        "keywords": [
            # Your exact format (WITHOUT accents)
            "credit periode ref",
            "credit period ref",
            "credit periode",
            "credit period",
            # Variations
            "credit mouvement",
            "mouvement credit",
            "credit",  # Last resort - too generic
            "cr",
        ],
        "description": "credit amount monetary value credit column transactions period movement",
        "expected_content": {"type": "numeric", "avg_length": 10, "numeric_ratio": 0.8, "decimal_ratio": 0.5},
        "priority": 8,
        "must_exclude_keywords": ["solde", "fin", "final", "ant"],  # Don't match if contains these
    },
    
    # ============ PERIOD BALANCES (Balance at end of current period) ============
    "solde_debit": {
        "keywords": [
            # Your exact format (WITHOUT accents)
            "solde per dbt",
            "solde per dbt ref",
            "solde periode dbt",
            "solde periode dbt ref",
            # Variations
            "solde period dbt",
            "periode dbt balance",
            "period balance dbt",
            "balance dbt periode",
        ],
        "description": "balance debit total debit accounting account balance debit side period balance current period",
        "expected_content": {"type": "numeric", "avg_length": 12, "numeric_ratio": 0.8, "decimal_ratio": 0.6},
        "priority": 7,
    },
    "solde_credit": {
        "keywords": [
            # Your exact format (WITHOUT accents)
            "solde per cdt",
            "solde per cdt ref",
            "solde periode cdt",
            "solde periode cdt ref",
            # Variations
            "solde period cdt",
            "periode cdt balance",
            "period balance cdt",
            "balance cdt periode",
        ],
        "description": "balance credit total credit accounting account balance credit side period balance current period",
        "expected_content": {"type": "numeric", "avg_length": 12, "numeric_ratio": 0.8, "decimal_ratio": 0.6},
        "priority": 7,
    },
    
    # ============ FINAL BALANCES (Closing balance - MOST SPECIFIC!) ============
    "solde_final_debit": {
        "keywords": [
            # Your exact format (WITHOUT accents)
            "solde fin dbt",
            "solde fin dbt ref",
            "solde final dbt",
            "solde final dbt ref",
            "solde final debit",
            "solde final debit ref",
            # Avoid generic matches - must have "fin" or "final"
        ],
        "description": "final balance debit side total debit accounting final account balance debit closing balance",
        "expected_content": {"type": "numeric", "avg_length": 12, "numeric_ratio": 0.85, "decimal_ratio": 0.7},
        "priority": 11,  # HIGHEST - Check this FIRST
        "must_contain_keywords": ["fin", "final"],  # Must have one of these
    },
    "solde_final_credit": {
        "keywords": [
            # Your exact format (WITHOUT accents)
            "solde fin cdt",
            "solde fin cdt ref",
            "solde final cdt",
            "solde final cdt ref",
            "solde final credit",
            "solde final credit ref",
            # Avoid generic matches - must have "fin" or "final"
        ],
        "description": "final balance credit side total credit accounting final account balance credit closing balance",
        "expected_content": {"type": "numeric", "avg_length": 12, "numeric_ratio": 0.85, "decimal_ratio": 0.7},
        "priority": 11,  # HIGHEST - Check this FIRST
        "must_contain_keywords": ["fin", "final"],  # Must have one of these
    },
    
    # ============ FALLBACK ONLY - DO NOT USE ============
    "solde_final": {
        "keywords": [],  # ← EMPTY! Don't match anything!
        "description": "DEPRECATED - Use solde_final_debit/credit instead",
        "priority": 0,  # LOWEST - Never match
        "note": "This column should NEVER be detected. It's a generic placeholder.",
    },
}
 
 
# ==============================================================================
# MATCHING ALGORITHM PSEUDOCODE
# ==============================================================================
"""
Algorithm to fix the detection:
 
1. NORMALIZE all column names:
   - Remove accents: "Crédit" → "Credit"
   - Lowercase: "CREDIT" → "credit"
   - Remove special chars: "Crédit (réf)" → "credit ref"
 
2. CHECK IN PRIORITY ORDER (highest first):
   - solde_final_debit (priority 11)
   - solde_final_credit (priority 11)
   - opening_debit (priority 9)
   - opening_credit (priority 9)
   - debit (priority 8)
   - credit (priority 8)
   - solde_debit (priority 7)
   - solde_credit (priority 7)
   - solde_final (priority 0 - SKIP)
 
3. FOR EACH COLUMN, FOR EACH FIELD (in priority order):
   
   if field has "must_contain_keywords":
       if none of these keywords in column_name:
           skip this field
   
   if field has "must_exclude_keywords":
       if ANY of these keywords in column_name:
           skip this field
   
   for each keyword in field["keywords"]:
       if keyword in column_name:
           MATCH FOUND! Assign column to this field
           Break to next column
"""
 
 
# ==============================================================================
# EXAMPLE MAPPING OF YOUR CSV
# ==============================================================================
"""
Your original CSV (after normalization):
 
1. compte                          → account_code ✓
2. intitule                        → label ✓
3. solde ant dbt ref               → opening_debit ✓
4. solde ant cdt ref               → opening_credit ✓
5. debit periode ref               → debit ✓
6. credit periode ref              → credit ✓ (NOT solde_final!)
7. solde per dbt ref               → solde_debit ✓
8. solde per cdt ref               → solde_credit ✓
9. solde fin dbt ref               → solde_final_debit ✓
10. solde fin cdt ref              → solde_final_credit ✓
 
Total expected: 10 columns correctly detected
"""
 
 
# ==============================================================================
# REQUIRED CHANGES TO CLASSIFIER ALGORITHM
# ==============================================================================
"""
In your column classifier (column_classifier.py or preparation_service.py):
 
1. NORMALIZE KEYWORDS TOO:
   
   def normalize_keyword(kw):
       import unicodedata
       import re
       # Remove accents from keywords before comparing
       kw = ''.join(c for c in unicodedata.normalize('NFD', kw) 
                    if unicodedata.category(c) != 'Mn')
       kw = kw.lower()
       kw = re.sub(r'[^a-z0-9\s]', '', kw)
       return kw
 
2. IMPLEMENT PRIORITY ORDERING:
   
   # Sort fields by priority (descending)
   fields_sorted = sorted(
       ENRICHED_COLUMN_MAPPING.items(),
       key=lambda x: x[1].get("priority", 0),
       reverse=True
   )
   
   # Check fields in priority order
   for field_name, field_config in fields_sorted:
       for column_name in unmatched_columns:
           if matches(column_name, field_config):
               assign(column_name, field_name)
               break
 
3. ADD CONSTRAINT CHECKING:
   
   def matches(column_name, field_config):
       # Check "must contain"
       if "must_contain_keywords" in field_config:
           if not any(kw in column_name for kw in field_config["must_contain_keywords"]):
               return False
       
       # Check "must exclude"
       if "must_exclude_keywords" in field_config:
           if any(kw in column_name for kw in field_config["must_exclude_keywords"]):
               return False
       
       # Check keyword match
       for kw in field_config["keywords"]:
           kw_normalized = normalize_keyword(kw)
           if kw_normalized in column_name:
               return True
       
       return False
"""

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