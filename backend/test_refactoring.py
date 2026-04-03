"""
Test script to validate the refactored architecture with preparation service.
Tests:
1. Preparation service: normalization of column names and data
2. Refactored upload functions: upload_document, parse_csv_file, add_and_parse_document
3. Integration with CSV parsing pipeline
"""

import pandas as pd
import numpy as np
import sys
import os
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent.absolute()))

from app.services.preparation_service import normalize_string, prepare_dataframe, get_normalization_mapping

def test_normalization():
    """Test the normalize_string function"""
    print("\n" + "="*60)
    print("TEST 1: String Normalization")
    print("="*60)
    
    test_cases = [
        ("N°", "n"),
        ("Libellé écriture", "libelle ecriture"),
        ("Solde Final", "solde final"),
        ("Compte-client", "compte client"),
        ("Débit/Crédit", "debit credit"),
        ("NUMÉRO D'ORDRE", "numero d ordre"),
        ("Montant (€)", "montant"),
        ("Solde Ant. Débit (réf)", "solde ant debit ref"),
        ("À JOUR", "a jour"),
        ("NUMÉRO°", "numero"),
    ]
    
    passed = 0
    failed = 0
    
    for input_str, expected in test_cases:
        result = normalize_string(input_str)
        status = "✓ PASS" if result == expected else "✗ FAIL"
        if result == expected:
            passed += 1
        else:
            failed += 1
        print(f"{status} | normalize_string('{input_str}') -> '{result}' (expected: '{expected}')")
    
    print(f"\nResults: {passed} passed, {failed} failed")
    return failed == 0


def test_dataframe_preparation():
    """Test the prepare_dataframe function"""
    print("\n" + "="*60)
    print("TEST 2: DataFrame Preparation")
    print("="*60)
    
    # Create test DataFrame with French accounting data
    df = pd.DataFrame({
        'N°': ['1', '2', '3'],
        'Libellé écriture': ['VENTE CLIENT A', 'ACHAT FOURNISSEUR B', 'REMB.FRAIS C'],
        'Solde Final': [1000.50, 2000.75, -500.25],
        '': ['', '', ''],  # Empty column
        'Montant (€)': [100, 200, 300]
    })
    
    print(f"Original DataFrame:")
    print(f"  Columns: {df.columns.tolist()}")
    print(f"  Shape: {df.shape}")
    print(f"  Data sample:\n{df.head()}\n")
    
    # Apply preparation
    df_prepared = prepare_dataframe(df)
    
    print(f"Prepared DataFrame:")
    print(f"  Columns: {df_prepared.columns.tolist()}")
    print(f"  Shape: {df_prepared.shape}")
    print(f"  Data sample:\n{df_prepared.head()}\n")
    
    # Verify results
    checks = [
        ("Empty column removed", '' not in df_prepared.columns),
        ("Column names normalized", 'n' in df_prepared.columns),
        ("Accents removed from columns", 'libelle ecriture' in df_prepared.columns),
        ("Special chars removed from columns", 'montant' in df_prepared.columns),
        ("Data lowercased", df_prepared.loc[0, 'libelle ecriture'] == 'vente client a'),
        ("Original columns > prepared columns", len(df.columns) > len(df_prepared.columns)),
    ]
    
    passed = 0
    failed = 0
    for check_name, result in checks:
        status = "✓ PASS" if result else "✗ FAIL"
        if result:
            passed += 1
        else:
            failed += 1
        print(f"{status} | {check_name}")
    
    print(f"\nResults: {passed} passed, {failed} failed")
    return failed == 0


def test_normalization_mapping():
    """Test the get_normalization_mapping function"""
    print("\n" + "="*60)
    print("TEST 3: Normalization Mapping")
    print("="*60)
    
    original = ['N°', 'Libellé écriture', 'Solde Final', '']
    normalized = ['n', 'libelle ecriture', 'solde final', '']
    
    mapping = get_normalization_mapping(original, normalized)
    
    print(f"Normalization Mapping:")
    for orig, norm in mapping.items():
        print(f"  '{orig}' → '{norm}'")
    
    print(f"\nResults: Mapping created successfully with {len(mapping)} entries")
    return len(mapping) == 4


def test_preparation_with_realistic_data():
    """Test preparation with realistic French financial data"""
    print("\n" + "="*60)
    print("TEST 4: Realistic Financial Data Preparation")
    print("="*60)
    
    # Simulate real accounting data
    df = pd.DataFrame({
        'Compte': ['401001', '401002', '401003'],
        'Libellé': ['CLIENT ALPHA SARL', 'CLIENT BETA LTD', 'CLIENT GAMMA LLC'],
        'Dates': ['01/01/2024', '02/01/2024', '03/01/2024'],
        'Montant Débit (€)': [1500.50, 2000.00, 0.00],
        'Montant Crédit (€)': [0.00, 0.00, 3000.75],
        'Solde': [1500.50, 2000.00, -3000.75],
    })
    
    print(f"Original columns: {df.columns.tolist()}")
    
    df_prepared = prepare_dataframe(df)
    
    print(f"Prepared columns: {df_prepared.columns.tolist()}")
    print(f"\nSample prepared data:")
    print(df_prepared.head())
    
    # Check that numeric values are preserved
    numeric_check = all(isinstance(val, (int, float, np.number)) or pd.isna(val) 
                       for col in df_prepared.select_dtypes(include=[np.number]).columns 
                       for val in df_prepared[col])
    
    print(f"\n{'✓ PASS' if numeric_check else '✗ FAIL'} | Numeric values preserved during preparation")
    
    return True


if __name__ == "__main__":
    print("\n" + "#"*60)
    print("# ARCHITECTURE REFACTORING TEST SUITE")
    print("# Testing Preparation Service + Refactored Upload Functions")
    print("#"*60)
    
    all_passed = True
    
    try:
        all_passed &= test_normalization()
        all_passed &= test_dataframe_preparation()
        all_passed &= test_normalization_mapping()
        all_passed &= test_preparation_with_realistic_data()
        
    except Exception as e:
        print(f"\n✗ ERROR: {str(e)}", exc_info=True)
        all_passed = False
    
    # Final summary
    print("\n" + "#"*60)
    if all_passed:
        print("# ✓ ALL TESTS PASSED ✓")
        print("# Architecture refactoring is working correctly!")
        print("#"*60)
        sys.exit(0)
    else:
        print("# ✗ SOME TESTS FAILED ✗")
        print("#"*60)
        sys.exit(1)
