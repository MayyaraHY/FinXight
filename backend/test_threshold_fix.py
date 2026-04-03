"""
Quick test to verify threshold fix (30 points) works with prepared columns.
"""

import pandas as pd
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.absolute()))

from app.services.column_classifier import classify_columns_smart
from app.services.preparation_service import prepare_dataframe

# Create test DataFrame with real accounting data (like the 10-column CSV)
df = pd.DataFrame({
    'Compte': ['401001', '401002', '401003', '401004', '401005'],
    'Libellé': ['CLIENT A', 'CLIENT B', 'CLIENT C', 'CLIENT D', 'CLIENT E'],
    'Solde Ant Dbt (réf)': ['100', '200', '300', '400', '500'],
    'Solde Ant Cdt (réf)': ['0', '0', '0', '0', '0'],
    'Débit': ['1000.00', '2000.00', '3000.00', '4000.00', '5000.00'],
    'Crédit': ['0.00', '0.00', '500.00', '0.00', '1000.00'],
    'Solde Final': ['1100.00', '2200.00', '2800.00', '4400.00', '4000.00'],
    'Solde Pér Cdt (réf)': ['500', '600', '700', '800', '900'],
    'Solde Fin Dbt (réf)': ['1000', '1100', '1200', '1300', '1400'],
    'Solde Fin Cdt (réf)': ['2000', '2100', '2200', '2300', '2400'],
})

print("\n" + "="*70)
print("TEST: Threshold Fix with 10-Column CSV + Preparation Service")
print("="*70)

print(f"\nOriginal columns: {df.columns.tolist()}")
print(f"Original shape: {df.shape}")

# Step 1: Prepare DataFrame (normalize)
df_prepared = prepare_dataframe(df)

print(f"\nAfter preparation:")
print(f"Prepared columns: {df_prepared.columns.tolist()}")
print(f"Prepared shape: {df_prepared.shape}")

# Step 2: Classify columns
column_mapping, confidence_scores = classify_columns_smart(df_prepared.columns, df_prepared)

print(f"\nColumn Mapping Results:")
print("-" * 70)

required_fields = ['account_code', 'label', 'debit', 'credit', 'solde_final']
missing_fields = []

for col_name, mapped_to in column_mapping.items():
    confidence = confidence_scores.get(col_name, 0.0)
    status = "✓" if mapped_to != "unknown" else "✗"
    print(f"{status} '{col_name}' → '{mapped_to}' ({confidence:.1f}%)")
    
    if mapped_to == "unknown" and any(req in col_name for req in required_fields):
        missing_fields.append(col_name)

print("\n" + "-" * 70)

# Check if all required fields are mapped
unmapped_required = [f for f in required_fields if column_mapping.get(f) == "unknown"]

print(f"\nSummary:")
print(f"  Total columns: {len(column_mapping)}")
print(f"  Successfully mapped: {sum(1 for v in column_mapping.values() if v != 'unknown')}")
print(f"  Unknown columns: {sum(1 for v in column_mapping.values() if v == 'unknown')}")

# Verify critical fields
print(f"\nCritical Fields:")
if 'compte' in column_mapping and column_mapping['compte'] != 'unknown':
    print(f"  ✓ 'compte' → '{column_mapping['compte']}' ({confidence_scores.get('compte', 0):.1f}%)")
else:
    print(f"  ✗ 'compte' not mapped (CRITICAL)")

if 'label' in column_mapping and column_mapping['label'] != 'unknown':
    print(f"  ✓ Column mapped to 'label' ({confidence_scores.get(column_mapping.get('label'), 0):.1f}%)")
else:
    print(f"  ✗ No column mapped to 'label'")

if 'debit' in column_mapping and column_mapping['debit'] != 'unknown':
    print(f"  ✓ Column mapped to 'debit'")
else:
    print(f"  ✗ No column mapped to 'debit'")

print("\n" + "="*70)

# Success criteria
success = (
    'compte' in column_mapping and 
    column_mapping['compte'] == 'account_code' and
    confidence_scores.get('compte', 0) >= 30
)

if success:
    print("✓ TEST PASSED: Threshold fix is working!")
    print("  'compte' keyword now matches at 30+ points (fuzzy match)")
    sys.exit(0)
else:
    print("✗ TEST FAILED: Threshold fix not working as expected")
    sys.exit(1)
