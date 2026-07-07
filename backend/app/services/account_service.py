from sqlalchemy.orm import Session
from app.models.account import Account
import logging
from app.models.bilan import Bilan
from app.models.compte_resultat import CompteResultat
from typing import Dict, Optional, Tuple

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


def get_accounts_by_upload(db: Session, upload_id: int, skip: int = 0, limit: int = 1000):
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


def get_accounts_by_code_prefix(db: Session, prefix: str, skip: int = 0, limit: int = 100):
    """
    Get accounts by account code prefix (e.g., prefix="1" matches "100", "101", "12", etc.)
    
    Args:
        db: Database session
        prefix: Account code prefix (e.g., "1", "23", "401")
        skip: Pagination offset
        limit: Pagination limit
        
    Returns:
        List of matching accounts
    """
    return db.query(Account)\
        .filter(Account.account_code.startswith(prefix))\
        .offset(skip)\
        .limit(limit)\
        .all()


def get_accounts_count_by_code_prefix(db: Session, prefix: str):
    """Count total accounts matching a code prefix"""
    return db.query(Account).filter(Account.account_code.startswith(prefix)).count()

#=======================================================
#                   ===== UPDATE =====
#========================================================

# ===== BILAN CHECK =====
def is_bilan_calculated(db: Session, upload_id: int) -> bool:
    """Check if bilan exists for upload"""
    bilan = db.query(Bilan).filter(Bilan.upload_id == upload_id).first()
    return bilan is not None
 
 
# ===== CR RECALCULATION =====
def trigger_cr_recalculation(db: Session, upload_id: int) -> Dict:
    """Recalculate CR if it exists, preserving the original inventory_method."""
    cr = db.query(CompteResultat).filter(CompteResultat.upload_id == upload_id).first()
    if not cr:
        return {"cr_recalculated": False, "reason": "No CR found for this upload"}
    try:
        inventory_method = (cr.data or {}).get("meta", {}).get("inventory_method", "permanent")
        from app.services.compte_resultat_service import CompteResultatService
        result = CompteResultatService(db, inventory_method).calculate_and_save(upload_id)
        logger.info(f"CR recalculated for upload {upload_id}")
        return {"cr_recalculated": True, "totals": result.get("totals")}
    except Exception as e:
        logger.error(f"Error recalculating CR: {str(e)}")
        return {"cr_recalculated": False, "error": str(e)}


# ===== BILAN RECALCULATION =====
def trigger_bilan_recalculation(db: Session, upload_id: int) -> Dict:
    """Recalculate bilan if it exists"""
    if not is_bilan_calculated(db, upload_id):
        return {
            "bilan_recalculated": False,
            "reason": "No bilan found for this upload"
        }
    
    try:
        from app.services.bilan_service import BilanService
        bilan_service = BilanService(db)
        result = bilan_service.calculate_and_save(upload_id)
        
        logger.info(f"Bilan recalculated for upload {upload_id}")
        return {
            "bilan_recalculated": True,
            "totals": result.get("totals")
        }
    except Exception as e:
        logger.error(f"Error recalculating bilan: {str(e)}")
        return {
            "bilan_recalculated": False,
            "error": str(e)
        }
 
 
# ===== BUILD UPDATE DATA (HELPER) =====
def build_update_data(**kwargs) -> Dict:
    """
    Build update dict from kwargs - only includes non-None values.
    
    Args:
        **kwargs: Any number of keyword arguments
        
    Returns:
        Dict with only non-None values, or empty dict if all were None
        
    Raises:
        ValueError: If all values are None
    """
    update_data = {k: v for k, v in kwargs.items() if v is not None}
    
    if not update_data:
        raise ValueError("No fields to update")
    
    return update_data
 
 
# ===== UPDATE (CLEAN VERSION) =====
def update_account(db: Session, account_id: int, account_data: dict) -> Tuple[Optional[Account], Optional[int]]:
    """
    Update an account.
    
    Args:
        db: Database session
        account_id: Account ID to update
        account_data: Dict with fields to update
        
    Returns:
        Tuple (account, upload_id) or (None, None) if not found
    """
    db_account = get_account_by_id(db, account_id)
    if not db_account:
        return None, None
    
    upload_id = db_account.upload_id
    
    for key, value in account_data.items():
        if key != "id" and key != "upload_id":
            setattr(db_account, key, value)
    
    db.commit()
    db.refresh(db_account)
    logger.info(f"Account updated: {db_account.account_code}")
    return db_account, upload_id
 
 
# ===== UPDATE WITH AUTO BILAN RECALC (COMPLETE BUSINESS LOGIC) =====
def update_account_with_bilan(
    db: Session,
    account_id: int,
    **field_values
) -> Dict:
    """
    Update account and automatically recalculate bilan if it exists.
    
    This is the main business logic function. The controller just calls this.
    
    Args:
        db: Database session
        account_id: Account ID to update
        **field_values: Any account fields (label, debit, credit, solde_debit, etc.)
        
    Returns:
        Dict with account data and bilan status
        
    Raises:
        ValueError: If no fields provided or account not found
    """
    # Step 1: Build update data (filter None values)
    try:
        update_data = build_update_data(**field_values)
    except ValueError as e:
        raise ValueError(str(e))
    
    # Step 2: Update account
    account, upload_id = update_account(db, account_id, update_data)
    if not account:
        raise ValueError(f"Account {account_id} not found")
    
    # Step 3: Auto-recalculate bilan if it exists
    bilan_status = trigger_bilan_recalculation(db, upload_id)

    # Step 4: Auto-recalculate CR if it exists
    cr_status = trigger_cr_recalculation(db, upload_id)

    # Step 5: Return complete response
    return {
        "status": "success",
        "account_id": account.id,
        "account_code": account.account_code,
        "message": "Account updated successfully",
        "bilan": bilan_status,
        "cr": cr_status,
    }
 
 
# ===== DELETE =====
def delete_account(db: Session, account_id: int) -> Tuple[bool, Optional[int]]:
    """
    Delete an account by ID.
    
    Returns:
        Tuple (success, upload_id)
    """
    db_account = get_account_by_id(db, account_id)
    if not db_account:
        return False, None
    
    code = db_account.account_code
    upload_id = db_account.upload_id
    db.delete(db_account)
    db.commit()
    logger.info(f"Account deleted: {code}")
    return True, upload_id
 
 
# ===== DELETE WITH AUTO BILAN RECALC (COMPLETE BUSINESS LOGIC) =====
def delete_account_with_bilan(db: Session, account_id: int) -> Dict:
    """
    Delete account and automatically recalculate bilan if it exists.
    
    This is the main business logic function. The controller just calls this.
    
    Args:
        db: Database session
        account_id: Account ID to delete
        
    Returns:
        Dict with deletion status and bilan status
        
    Raises:
        ValueError: If account not found
    """
    # Step 1: Delete account
    success, upload_id = delete_account(db, account_id)
    if not success:
        raise ValueError(f"Account {account_id} not found")
    
    # Step 2: Auto-recalculate bilan if it exists
    bilan_status = trigger_bilan_recalculation(db, upload_id)
    
    # Step 3: Return complete response
    return {
        "status": "success",
        "message": "Account deleted successfully",
        "bilan": bilan_status
    }
 

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
