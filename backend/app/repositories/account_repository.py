from app.models.account import Account

def bulk_insert_accounts(db, accounts: list):
    db.add_all(accounts)
    db.commit()