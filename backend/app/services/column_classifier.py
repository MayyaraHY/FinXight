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
    # N° should become n, not no
    text = text.replace('°', '').replace('º', '')  # Remove degree symbols entirely
    text = text.replace('∞', '')  # Remove corrupted infinity symbol

    # Replace any remaining non-alphanumeric characters (except spaces) with space
    text = re.sub(r'[^a-z0-9\s]', ' ', text)

    # Remove extra whitespace
    text = re.sub(r'\s+', ' ', text).strip()

    logger.debug(f"Normalized: '{text}'")
    return text


# Legacy COLUMN_MAPPING for backwards compatibility
COLUMN_MAPPING = {
    "account_code": ["compte","Compte" "code", "n°", "N°", "numero", "num", "n"],
    "label": ["intitulé", "libellé", "Libellé écriture", "description", "nom"],
    "debit": ["débit", "debit"],
    "credit": ["crédit", "credit"],
    "solde_debit": ["solde débiteur", "solde deb", "solde debit"],
    "solde_credit": ["solde créditeur", "solde cdt", "solde credit"],
    "solde_final": ["solde", "solde final","Solde Final", "value", "montant"],
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
    Intelligent hybrid NLP column classification combining:
    - Semantic embeddings (50% weight) - understands meaning
    - Fuzzy matching (30% weight) - handles typos and variations
    - Content analysis (20% weight) - examines actual data patterns

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

            # 1. SEMANTIC SCORE (50 points max)
            semantic_score = semantic_matcher.get_semantic_similarity(col_normalized, config["description"])
            semantic_score = (semantic_score / 100.0) * 50  # Normalize to 0-50

            # 2. FUZZY SCORE (30 points max)
            fuzzy_score = 0
            for norm_keyword in normalized_keywords[key]:
                keyword_match = fuzz.ratio(col_normalized, norm_keyword)
                fuzzy_score = max(fuzzy_score, keyword_match)
            fuzzy_score = (fuzzy_score / 100.0) * 30  # Normalize to 0-30

            # 3. CONTENT SCORE (20 points max)
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

        # Only map if score is high enough
        # After preparation service, normalized names match keywords perfectly
        # Fuzzy match alone (30 pts) is sufficient for strong matches
        if best_match and best_score >= 30:
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
                    f"✗ Column '{col}' partially matched '{best_match}' (score: {best_score:.1f}/100, below 30 threshold)"
                )
            else:
                logger.warning(f"✗ Unknown column detected: '{col}'")

    # Post-classification validation using content analysis
    if df is not None:
        logger.info("Validating and boosting confidence scores using content analysis...")
        confidence_scores = validate_and_boost_mapping(mapping, df, confidence_scores)

    logger.info(f"Final column mapping: {mapping}")
    logger.info(f"Confidence scores: {[(col, f'{conf:.1f}%') for col, conf in confidence_scores.items()]}")

    return mapping, confidence_scores