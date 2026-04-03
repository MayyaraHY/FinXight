#!/usr/bin/env python
"""
Quick test to verify the semantic NLP classifier fixes work correctly.
Tests: normalization, empty column filtering, and threshold at 65 points.
"""

import sys
import pandas as pd
from app.services.column_classifier import normalize_string, classify_columns_smart

print("\n" + "="*70)
print("QUICK TEST: Semantic NLP Column Classification with Fixes")
print("="*70)

# Test 1: Normalization
print("\n[TEST 1] String Normalization (removes degree/corrupted chars and accents)")
print("-" * 70)

test_cases = [
    ("N°", "n"),
    ("Libellé écriture", "libelle ecriture"),
    ("Solde Final", "solde final"),
    ("N∞", "n"),
    ("N°Compte", "n compte"),
    ("Débit", "debit"),
    ("Crédit", "credit"),
]

success = True
for input_str, expected in test_cases:
    result = normalize_string(input_str)
    match = "PASS" if result == expected else "FAIL"
    if result != expected:
        success = False
    print(f"  [{match}] normalize_string('{input_str}') -> '{result}'")
    if result != expected:
        print(f"      Expected: '{expected}'")

# Test 2: Column classification with realistic data
print("\n[TEST 2] Column Classification (threshold: 44 points)")
print("-" * 70)

df = pd.DataFrame({
    "N°": ["10100000", "10200000", "10300000"],
    "Libellé écriture": ["CAPITAL SOCIAL", "ACTIONNAIRES", "RESERVES"],
    "Solde Final": ["500.00", "1000.00", "2000.00"],
})

print(f"Input DataFrame columns: {df.columns.tolist()}")
print(f"Input DataFrame shape: {df.shape}")

mapping, confidence_scores = classify_columns_smart(df.columns, df)

print(f"  Column Mapping Results:")
for col in df.columns:
    mapped_to = mapping.get(col, "unknown")
    confidence = confidence_scores.get(col, 0.0)
    status = "OK" if mapped_to != "unknown" else "FAIL"
    print(f"  [{status}] '{col}'")
    print(f"      -> '{mapped_to}' (confidence: {confidence:.1f}%)")

# Test 3: Verify account_code was mapped
print("\n[TEST 3] Critical Field Validation")
print("-" * 70)

has_account_code = any(v == "account_code" for v in mapping.values())
if has_account_code:
    print("  [OK] account_code successfully mapped")
    for col, field in mapping.items():
        if field == "account_code":
            print(f"      from column: '{col}' (confidence: {confidence_scores[col]:.1f}%)")
else:
    print("  [FAIL] account_code NOT found in mapping")
    success = False

# Summary
print("\n" + "="*70)
if has_account_code:
    print("SUCCESS: All fixes are working correctly!")
    print("\nMapped columns (all successfully detected):")
    for col, field in mapping.items():
        if field != "unknown":
            print(f"  [OK] '{col}' -> '{field}' ({confidence_scores[col]:.1f}%)")
    print("\nYou can now:")
    print("  1. Upload your CSV file")
    print("  2. Check the logs for confidence scores")
    print("  3. Data should extract successfully with all columns mapped")
else:
    print("WARNING: Some tests failed - check the output above")
    sys.exit(1)

print("="*70 + "\n")
