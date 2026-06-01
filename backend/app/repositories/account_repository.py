import re
import unicodedata

from app.models.account import Account
from app.models.upload import Upload
from sqlalchemy.orm import Session


# ---------------------------------------------------------------------------
# Rubrique normalisation
# ---------------------------------------------------------------------------
_EMPTY_VALUES = frozenset({"", "nan", "none", "null", "n/a", "-", "#n/a"})


def clean_rubrique(raw) -> str | None:
    """
    Normalise a raw Rubrique cell before persisting to the DB.

    Steps:
      1. Coerce to str, strip surrounding whitespace.
      2. Unicode NFC normalisation — repairs garbled multi-byte sequences that
         CSV parsers sometimes produce (e.g. "Immobilisations financiÃ¨res"
         from a mis-decoded latin-1 file becomes "Immobilisations financières").
      3. Collapse internal runs of whitespace to a single space.
      4. Preserve accented characters (é, ç, à, …) — they display correctly in
         the UI.  Accent-stripping happens only at *comparison* time inside
         AccountingRulesLoader.normalize_label(), never in the stored value.
      5. Return None for empty / placeholder values ("nan", "none", "-", …).

    Examples
    --------
    "  Immobilisations financières  " → "Immobilisations financières"
    "Autres   actifs  courants"       → "Autres actifs courants"
    "nan" / "" / None / "-"           → None
    """
    if raw is None:
        return None

    s = unicodedata.normalize("NFC", str(raw)).strip()

    # Reject empty / placeholder tokens
    if s.lower() in _EMPTY_VALUES:
        return None

    # Collapse internal whitespace
    s = re.sub(r"\s+", " ", s)

    return s or None


# ---------------------------------------------------------------------------


def bulk_insert_accounts(db, accounts: list):
    db.add_all(accounts)
    db.commit()


def save_accounts(session: Session, accounts, upload_id):
    """
    Persist parsed account rows. Also sets Upload.has_rubrique_column = True
    when at least one row carries a non-empty source_rubrique, so the bilan
    reconciliation engine knows whether to run per-line Rubrique comparisons.
    """
    has_rubrique = any(
        clean_rubrique(r.get("rubrique")) is not None
        for r in accounts
    )

    for account in accounts:
        source_rubrique = clean_rubrique(account.get("rubrique"))

        db_account = Account(
            upload_id=upload_id,
            account_code=account["account_code"],
            label=account.get("label"),
            debit=account.get("debit"),
            credit=account.get("credit"),
            solde_debit=account.get("solde_debit"),
            solde_credit=account.get("solde_credit"),
            solde_final=account.get("solde_final"),
            solde_final_debit=account.get("solde_final_debit"),
            solde_final_credit=account.get("solde_final_credit"),
            opening_debit=account.get("opening_debit"),
            opening_credit=account.get("opening_credit"),
            source_rubrique=source_rubrique,
        )
        session.add(db_account)

    # Flag the upload so the bilan service knows reconciliation is meaningful
    if has_rubrique:
        upload = session.query(Upload).filter(Upload.id == upload_id).first()
        if upload:
            upload.has_rubrique_column = True

    session.commit()