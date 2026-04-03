"""
Test to verify negative signs are preserved in numeric columns during preparation.
"""

import pandas as pd
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.absolute()))

from app.services.preparation_service import prepare_dataframe

# Create test DataFrame with negative values
df = pd.DataFrame({
    'Compte': ['401001', '401002', '401003'],
    'Libellé écriture': ['CLIENT ALPHA SARL', 'CLIENT BETA LTD', 'CLIENT GAMMA LLC'],
    'Montant Débit (€)': ['1000.50', '2000.00', '0.00'],
    'Montant Crédit (€)': ['0.00', '0.00', '3000.75'],
    'Solde Final': ['-500.25', '1500.75', '-2000.50'],  # Negative values
    'Solde Ant Débit (réf)': ['100', '-200', '300'],    # Negative values
})

print("\n" + "="*70)
print("TEST: Negative Sign Preservation During Preparation")
print("="*70)

print(f"\nOriginal data (before preparation):")
print(df)

print("\nOriginal values with signs:")
print(f"  'Solde Final' row 0: '{df.loc[0, 'Solde Final']}'")
print(f"  'Solde Final' row 1: '{df.loc[1, 'Solde Final']}'")
print(f"  'Solde Final' row 2: '{df.loc[2, 'Solde Final']}'")
print(f"  'Solde Ant Débit (réf)' row 1: '{df.loc[1, 'Solde Ant Débit (réf)']}'")

# Prepare the DataFrame
df_prepared = prepare_dataframe(df)

print(f"\n\nAfter preparation:")
print(df_prepared)

print("\nPrepared values (checking for preserved signs):")
print(f"  'solde final' row 0: '{df_prepared.loc[0, 'solde final']}'")
print(f"  'solde final' row 1: '{df_prepared.loc[1, 'solde final']}'")
print(f"  'solde final' row 2: '{df_prepared.loc[2, 'solde final']}'")
print(f"  'solde ant debit ref' row 1: '{df_prepared.loc[1, 'solde ant debit ref']}'")

print("\n" + "="*70)

# Verify negative signs are preserved
checks = [
    ("Column name normalized", 'solde final' in df_prepared.columns),
    ("Negative sign preserved (row 0)", '-' in str(df_prepared.loc[0, 'solde final'])),
    ("Negative sign preserved (row 2)", '-' in str(df_prepared.loc[2, 'solde final'])),
    ("Negative sign preserved in solde debit", '-' in str(df_prepared.loc[1, 'solde ant debit ref'])),
    ("Decimal point preserved", '.' in str(df_prepared.loc[0, 'solde final'])),
    ("Text columns normalized", 'client alpha sarl' in str(df_prepared.loc[0, 'libelle ecriture']).lower()),
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
print("="*70)

if failed == 0:
    print("✓ TEST PASSED: Negative signs are preserved correctly!")
    sys.exit(0)
else:
    print("✗ TEST FAILED: Some checks failed")
    sys.exit(1)
