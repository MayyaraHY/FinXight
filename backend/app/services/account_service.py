from sqlalchemy.orm import Session
from app.models.account import Account
import logging

logger = logging.getLogger(__name__)


# ===== CREATE =====
def create_account(db: Session, account_data: dict):
    """
    Create a new account.
    
    Args:
        db: Database session
        account_data: Dict with account fields (account_code, label, debit, credit, etc.)
        
    Returns:
        Created Account object
    """
    db_account = Account(**account_data)
    db.add(db_account)
    db.commit()
    db.refresh(db_account)
    logger.info(f"Account created: {db_account.account_code}")
    return db_account


# ===== READ =====
def get_account_by_id(db: Session, account_id: int):
    """Get account by ID"""
    return db.query(Account).filter(Account.id == account_id).first()


def get_account_by_code(db: Session, account_code: str):
    """Get account by code"""
    return db.query(Account).filter(Account.account_code == account_code).first()


def get_accounts_by_upload(db: Session, upload_id: int, skip: int = 0, limit: int = 100):
    """Get all accounts for a specific upload"""
    return db.query(Account)\
        .filter(Account.upload_id == upload_id)\
        .offset(skip)\
        .limit(limit)\
        .all()


def get_all_accounts(db: Session, skip: int = 0, limit: int = 100):
    """Get all accounts with pagination"""
    return db.query(Account).offset(skip).limit(limit).all()


def get_accounts_count(db: Session, upload_id: int = None):
    """Get account count (total or by upload)"""
    query = db.query(Account)
    if upload_id:
        query = query.filter(Account.upload_id == upload_id)
    return query.count()


def search_accounts(db: Session, keyword: str, skip: int = 0, limit: int = 100):
    """
    Search accounts by account_code or label.
    
    Args:
        db: Database session
        keyword: Search keyword (searches both code and label)
        skip: Pagination offset
        limit: Pagination limit
        
    Returns:
        List of matching accounts
    """
    return db.query(Account)\
        .filter(
            (Account.account_code.ilike(f"%{keyword}%")) |
            (Account.label.ilike(f"%{keyword}%"))
        )\
        .offset(skip)\
        .limit(limit)\
        .all()


# ===== UPDATE =====
def update_account(db: Session, account_id: int, account_data: dict):
    """
    Update an account.
    
    Args:
        db: Database session
        account_id: Account ID to update
        account_data: Dict with fields to update
        
    Returns:
        Updated Account object or None if not found
    """
    db_account = get_account_by_id(db, account_id)
    if not db_account:
        return None
    
    for key, value in account_data.items():
        if key != "id" and key != "upload_id":  # Don't update these
            setattr(db_account, key, value)
    
    db.commit()
    db.refresh(db_account)
    logger.info(f"Account updated: {db_account.account_code}")
    return db_account


# ===== DELETE =====
def delete_account(db: Session, account_id: int):
    """
    Delete an account by ID.
    
    Returns:
        True if deleted, False if not found
    """
    db_account = get_account_by_id(db, account_id)
    if not db_account:
        return False
    
    code = db_account.account_code
    db.delete(db_account)
    db.commit()
    logger.info(f"Account deleted: {code}")
    return True


def delete_accounts_by_upload(db: Session, upload_id: int):
    """
    Delete all accounts for a specific upload.
    
    Returns:
        Number of deleted accounts
    """
    count = db.query(Account).filter(Account.upload_id == upload_id).delete()
    db.commit()
    logger.info(f"Deleted {count} accounts for upload {upload_id}")
    return count
