from app.models.account import Account
from sqlalchemy.orm import Session


def bulk_insert_accounts(db, accounts: list):
    db.add_all(accounts)
    db.commit()

def save_accounts(session: Session, accounts, upload_id):
    for account in accounts:
        db_account = Account(
            upload_id=upload_id,
            account_code=account["account_code"],
            label=account.get("label"),
            debit=account.get("debit"),
            credit=account.get("credit"),
            solde_debit=account.get("solde_debit"),
            solde_credit=account.get("solde_credit"),
            solde_final=account.get("solde_final")
        )
        session.add(db_account)
    session.commit()