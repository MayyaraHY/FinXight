from fuzzywuzzy import fuzz
import logging
import unicodedata
import re
import pandas as pd
from typing import Dict, Tuple

logger = logging.getLogger(__name__)


def normalize_string(text):
    """
    Normalize text by:
    - Removing accents (é → e, è → e, etc.)
    - Converting to lowercase
    - Removing special/corrupted characters
    - Removing extra whitespace
    
    For French accounting columns: N° → n, N∞ → n, Libellé → libelle
    """
    if not isinstance(text, str):
        text = str(text)

    # Decompose accented characters and remove accents (é → e, è → e)
    text = unicodedata.normalize('NFKD', text)
    text = text.encode('ascii', 'ignore').decode('ascii')

    # Convert to lowercase
    text = text.lower()

    # Remove degree symbols and corrupted characters (° and ∞ just removed, not converted)
    text = text.replace('°', '').replace('º', '')
    text = text.replace('∞', '')

    # Replace any remaining non-alphanumeric characters (except spaces) with space
    text = re.sub(r'[^a-z0-9\s]', ' ', text)

    # Remove extra whitespace
    text = re.sub(r'\s+', ' ', text).strip()

    logger.debug(f"Normalized: '{text}'")
    return text


# Legacy COLUMN_MAPPING for backwards compatibility
COLUMN_MAPPING = {
    "account_code": ["compte", "Compte", "code", "n°", "N°", "numero", "num", "n"],
    "label": ["intitulé", "libellé", "Libellé écriture", "description", "nom"],
    "debit": ["débit", "debit"],
    "credit": ["crédit", "credit"],
    "solde_debit": ["solde débiteur", "solde deb", "solde debit"],
    "solde_credit": ["solde créditeur", "solde cdt", "solde credit"],
    "solde_final": ["solde", "solde final", "Solde Final", "value", "montant"],
}


def classify_columns(columns):
    """
    Legacy fuzzy-only classifier. Use classify_columns_smart() for hybrid NLP matching.
    Kept for backwards compatibility.
    """
    mapping, _ = classify_columns_smart(columns, None)
    return mapping


def classify_columns_smart(
    columns, df: pd.DataFrame = None
) -> Tuple[Dict[str, str], Dict[str, float]]:
    """
    IMPROVED: Intelligent hybrid NLP column classification combining:
    - Semantic embeddings (60% weight) ← INCREASED from 50%, now dominant
    - Fuzzy matching (20% weight) ← DECREASED from 30%
    - Content analysis (20% weight) ← SAME
    
    Key improvements:
    - Semantic matching now primary signal for meaning understanding
    - Lower threshold for accepting matches (25 instead of 30)
    - Better tolerance for variations and synonyms
    - French accounting terminology optimization
    
    Returns tuple of (mapping dict, confidence_scores dict)
    """
    from app.services.semantic_classifier import (
        get_semantic_matcher,
        ENRICHED_COLUMN_MAPPING,
        analyze_column_content,
        compute_content_score,
        validate_and_boost_mapping,
    )

    mapping = {}
    confidence_scores = {}
    used_keys = set()

    # Normalize all keywords once
    normalized_keywords = {}
    for key, config in ENRICHED_COLUMN_MAPPING.items():
        normalized_keywords[key] = [normalize_string(kw) for kw in config["keywords"]]

    semantic_matcher = get_semantic_matcher()

    for col in columns:
        col_normalized = normalize_string(col)
        logger.info(f"Processing column: '{col}' → normalized: '{col_normalized}'")

        best_match = None
        best_score = 0.0
        best_scores_breakdown = {}

        for key, config in ENRICHED_COLUMN_MAPPING.items():
            # Skip if this standardized key is already used
            if key in used_keys:
                continue

            # 1. SEMANTIC SCORE (60 points max) - IMPROVED & PRIMARY
            # Uses contextual NLP understanding with synonyms
            semantic_score = semantic_matcher.compute_contextual_score(col_normalized, config)
            semantic_score = (semantic_score / 100.0) * 60  # Normalize to 0-60

            # 2. FUZZY SCORE (20 points max) - REDUCED for better semantic dominance
            fuzzy_score = 0
            for norm_keyword in normalized_keywords[key]:
                keyword_match = fuzz.ratio(col_normalized, norm_keyword)
                fuzzy_score = max(fuzzy_score, keyword_match)
            fuzzy_score = (fuzzy_score / 100.0) * 20  # Normalize to 0-20

            # 3. CONTENT SCORE (20 points max) - SAME
            content_score = 0.0
            if df is not None:
                analysis = analyze_column_content(df, col)
                content_score = compute_content_score(analysis, config.get("expected_content", {}))

            # Total hybrid score
            hybrid_score = semantic_score + fuzzy_score + content_score
            best_scores_breakdown[key] = {
                "semantic": semantic_score,
                "fuzzy": fuzzy_score,
                "content": content_score,
                "total": hybrid_score,
            }

            if hybrid_score > best_score:
                best_score = hybrid_score
                best_match = key

            logger.debug(
                f"  Candidate '{key}': semantic={semantic_score:.1f} + fuzzy={fuzzy_score:.1f} + content={content_score:.1f} = {hybrid_score:.1f}"
            )

        # IMPROVED: Lower threshold from 30 to 25 for better tolerance
        # Semantic score alone (60 pts max) can now match at 25/100 → 0.42 semantic
        # This is about 42% semantic match + any fuzzy/content = threshold met
        if best_match and best_score >= 25:
            mapping[col] = best_match
            confidence = min(100.0, (best_score / 100.0) * 100)  # Normalize to percentage
            confidence_scores[col] = confidence
            used_keys.add(best_match)

            breakdown = best_scores_breakdown[best_match]
            logger.info(
                f"✓ Mapped '{col}' → '{best_match}' (confidence: {confidence:.1f}%) "
                f"[semantic={breakdown['semantic']:.1f}, fuzzy={breakdown['fuzzy']:.1f}, content={breakdown['content']:.1f}]"
            )
        else:
            mapping[col] = "unknown"
            confidence_scores[col] = 0.0

            if best_match and best_score > 0:
                logger.warning(
                    f"✗ Column '{col}' partially matched '{best_match}' (score: {best_score:.1f}/100, below 25 threshold)"
                )
            else:
                logger.warning(f"✗ Unknown column detected: '{col}'")

    # Post-classification validation using content analysis
    if df is not None:
        logger.info("Validating and boosting confidence scores using enhanced content analysis...")
        confidence_scores = validate_and_boost_mapping(mapping, df, confidence_scores)

    logger.info(f"Final column mapping: {mapping}")
    logger.info(f"Confidence scores: {[(col, f'{conf:.1f}%') for col, conf in confidence_scores.items()]}")

    return mapping, confidence_scores
