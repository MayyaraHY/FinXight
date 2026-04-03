"""
Test suite for semantic NLP-based column classification.
Tests the hybrid scoring system combining semantic embeddings, fuzzy matching, and content analysis.
"""

import pytest
import pandas as pd
import logging
from unittest.mock import MagicMock, patch
from app.services.column_classifier import classify_columns_smart, normalize_string
from app.services.semantic_classifier import (
    analyze_column_content,
    compute_content_score,
    SemanticMatcher,
    ENRICHED_COLUMN_MAPPING,
)

logger = logging.getLogger(__name__)


class TestNormalizeString:
    """Test string normalization for accents and special characters."""

    def test_accent_removal(self):
        """Should remove accents from French characters."""
        assert normalize_string("Libellé") == "libelle"
        assert normalize_string("Écriture") == "ecriture"
        assert normalize_string("Débit") == "debit"
        assert normalize_string("Crédit") == "credit"

    def test_special_character_replacement(self):
        """Should replace special characters."""
        assert normalize_string("N°Compte") == "n compte"
        assert normalize_string("Solde°") == "solde o"
        assert normalize_string("N∞") == "n n"  # Corrupted degree symbol

    def test_lowercase_conversion(self):
        """Should convert to lowercase."""
        assert normalize_string("NUMERO") == "numero"
        assert normalize_string("Account") == "account"

    def test_whitespace_cleanup(self):
        """Should clean extra whitespace."""
        assert normalize_string("  libellé   écriture  ") == "libelle ecriture"
        assert normalize_string("solde\tdebit") == "solde debit"


class TestContentAnalysis:
    """Test column content analysis for numeric/text detection."""

    def test_numeric_column_detection(self):
        """Should correctly identify numeric columns."""
        df = pd.DataFrame({
            "amount": ["1000.00", "2500.50", "150.00", "999.99"],
        })
        analysis = analyze_column_content(df, "amount")

        assert analysis["numeric_ratio"] > 0.9  # Nearly all numeric
        assert analysis["decimal_ratio"] > 0.7  # Most have decimals
        assert analysis["has_large_numbers"] is True

    def test_text_column_detection(self):
        """Should correctly identify text columns."""
        df = pd.DataFrame({
            "label": ["CAPITAL SOCIAL", "ACTIONNAIRE", "RESERVES", "BENEFICES"],
        })
        analysis = analyze_column_content(df, "label")

        assert analysis["text_ratio"] > 0.8  # Nearly all text
        assert analysis["numeric_ratio"] < 0.2
        assert analysis["avg_length"] > 5

    def test_french_number_format(self):
        """Should handle French number format (space thousands, comma decimal)."""
        df = pd.DataFrame({
            "amount": ["1 000,00", "2 500,50", "150,00", "999,99"],
        })
        analysis = analyze_column_content(df, "amount")

        assert analysis["numeric_ratio"] > 0.9
        assert analysis["decimal_ratio"] > 0.7

    def test_empty_column(self):
        """Should handle empty columns gracefully."""
        df = pd.DataFrame({
            "empty": [None, None, None, None],
        })
        analysis = analyze_column_content(df, "empty")

        assert analysis["empty_ratio"] == 1.0
        assert analysis["numeric_ratio"] == 0.0


class TestContentScoring:
    """Test content-based scoring for field type matching."""

    def test_numeric_field_scoring(self):
        """Should score high for numeric fields matching numeric columns."""
        analysis = {
            "numeric_ratio": 0.95,
            "decimal_ratio": 0.6,
            "has_large_numbers": True,
            "avg_length": 10,
            "text_ratio": 0.0,
            "empty_ratio": 0.0,
        }
        expectations = {"type": "numeric", "decimal_ratio": 0.5}

        score = compute_content_score(analysis, expectations)
        assert score > 12  # Should be reasonably high

    def test_text_field_scoring(self):
        """Should score high for text fields matching text columns."""
        analysis = {
            "numeric_ratio": 0.0,
            "text_ratio": 0.95,
            "avg_length": 25,
            "decimal_ratio": 0.0,
            "has_large_numbers": False,
            "empty_ratio": 0.0,
        }
        expectations = {"type": "text"}

        score = compute_content_score(analysis, expectations)
        assert score > 12


class TestSemanticMatcher:
    """Test semantic similarity matching."""

    def test_semantic_matcher_initialization(self):
        """Should initialize without errors."""
        matcher = SemanticMatcher()
        assert matcher.model is None  # Lazy loaded
        assert matcher.embedding_cache == {}

    @patch('app.services.semantic_classifier.SEMANTIC_AVAILABLE', False)
    def test_fallback_when_unavailable(self, mock_semantic):
        """Should gracefully handle unavailable semantic matching."""
        matcher = SemanticMatcher()
        similarity = matcher.get_semantic_similarity("test", "test")
        assert similarity == 0.0  # Should return 0 when unavailable


class TestHybridClassification:
    """Test the hybrid NLP-based column classification."""

    def test_exact_keyword_match(self):
        """Should have high confidence for exact keyword matches."""
        df = pd.DataFrame({
            "compte": [10100000, 10200000, 10300000],
            "libellé": ["CAPITAL", "RESERVES", "GAINS"],
        })

        mapping, confidence = classify_columns_smart(df.columns, df)

        # compte should match account_code
        assert mapping.get("compte") == "account_code"
        # libellé should match label
        assert mapping.get("libellé") == "label"

    def test_accented_name_handling(self):
        """Should handle accented column names."""
        df = pd.DataFrame({
            "Libellé Écriture": ["CAPITAL", "RESERVES"],
            "Débits": ["1000.00", "2000.00"],
        })

        mapping, confidence = classify_columns_smart(df.columns, df)

        # Should match despite accents
        assert mapping.get("Libellé Écriture") == "label"

    def test_corrupted_characters_handling(self):
        """Should handle corrupted special characters."""
        df = pd.DataFrame({
            "N∞": [10100000, 10200000],  # Corrupted degree symbol
            "LibellÈ": ["CAPITAL", "RESERVES"],
        })

        mapping, confidence = classify_columns_smart(df.columns, df)

        # Should still match despite corruption
        assert mapping.get("N∞") == "account_code"
        assert mapping.get("LibellÈ") == "label"

    def test_numeric_column_classification(self):
        """Should correctly classify numeric columns."""
        df = pd.DataFrame({
            "n_compte": ["100", "200", "300"],
            "solde_montant": ["1000.00", "2500.50", "1500.75"],
            "description": ["CAPITAL", "RESERVES", "PROFIT"],
        })

        mapping, confidence = classify_columns_smart(df.columns, df)

        # solde_montant should match solde_final (numeric + content)
        assert mapping.get("solde_montant") == "solde_final"
        # description should match label (text)
        assert mapping.get("description") == "label"

    def test_no_duplicate_mappings(self):
        """Should prevent duplicate mappings to same standardized field."""
        df = pd.DataFrame({
            "compte": [10100000, 10200000],
            "numero": [10100001, 10200001],  # Also matches account_code
            "solde": [1000.00, 2000.00],
        })

        mapping, confidence = classify_columns_smart(df.columns, df)

        # Both compte and numero map to account_code, but only one should win
        mapped_values = list(mapping.values())
        assert mapped_values.count("account_code") == 1  # Only one mapping

    def test_confidence_scores_returned(self):
        """Should return confidence scores for each column."""
        df = pd.DataFrame({
            "compte": [10100000, 10200000],
            "libellé": ["CAPITAL", "RESERVES"],
            "solde": [1000.00, 2000.00],
        })

        mapping, confidence = classify_columns_smart(df.columns, df)

        # Should have confidence scores for all columns
        assert len(confidence) == len(df.columns)
        assert all(0 <= v <= 100 for v in confidence.values())  # 0-100% range


class TestFrenchAccountingData:
    """Integration tests with realistic French accounting CSV data."""

    def test_french_balance_sheet_columns(self):
        """Should correctly classify typical French balance sheet columns."""
        df = pd.DataFrame({
            "Numéro Compte": ["10100000", "10200000", "10300000"],
            "Libellé": ["CAPITAL SOCIAL", "ACTIONNAIRES", "RESERVES"],
            "Débit": ["0", "1000.00", "0"],
            "Crédit": ["500.00", "0", "2000.00"],
            "Solde": ["500.00", "1000.00", "2000.00"],
        })

        mapping, confidence = classify_columns_smart(df.columns, df)

        expected = {
            "Numéro Compte": "account_code",
            "Libellé": "label",
            "Débit": "debit",
            "Crédit": "credit",
            "Solde": "solde_final",
        }

        for col, expected_field in expected.items():
            assert mapping.get(col) == expected_field, f"Column '{col}' should map to '{expected_field}'"

    def test_partial_french_data(self):
        """Should handle CSVs with missing standard columns."""
        df = pd.DataFrame({
            "N° Compte": ["10100000", "10200000"],
            "Description": ["CAPITAL", "ACTIONNAIRES"],
            "Montant": ["500.00", "1000.00"],
        })

        mapping, confidence = classify_columns_smart(df.columns, df)

        assert mapping.get("N° Compte") == "account_code"
        assert mapping.get("Description") == "label"
        assert mapping.get("Montant") == "solde_final"


if __name__ == "__main__":
    # Run tests with: pytest tests/test_semantic_classifier.py -v
    pytest.main([__file__, "-v", "-s"])
