import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.auth import CurrentUser, assert_upload_owned, current_user
from app.db.cnx import SessionLocal
from app.services.account_service import (
    get_account_by_id,
    get_account_by_code,
    get_accounts_by_upload,
    get_all_accounts,
    get_accounts_count,
    search_accounts,
    get_accounts_by_code_prefix,
    get_accounts_count_by_code_prefix,
    delete_accounts_by_upload,
    update_account_with_bilan,
    delete_account_with_bilan
)

logger = logging.getLogger(__name__)

# Router-level auth: every endpoint below requires a valid JWT.
router = APIRouter(
    prefix="/accounts",
    tags=["accounts"],
    dependencies=[Depends(current_user)],
)

# DB dependency
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ===== HELPER: Convert Account Model to JSON-Safe Dict =====
def account_to_dict(account):
    """Convert SQLAlchemy Account model to dictionary, handling NaN and Decimal values"""
    if account is None:
        return None
    
    result = {
        "id": account.id,
        "upload_id": account.upload_id,
        "account_code": account.account_code,
        "label": account.label,
        "debit": float(account.debit) if account.debit is not None else None,
        "credit": float(account.credit) if account.credit is not None else None,
        "solde_debit": float(account.solde_debit) if account.solde_debit is not None else None,
        "solde_credit": float(account.solde_credit) if account.solde_credit is not None else None,
        "solde_final": float(account.solde_final) if account.solde_final is not None else None,
        "solde_final_debit": float(account.solde_final_debit) if account.solde_final_debit is not None else None,
        "solde_final_credit": float(account.solde_final_credit) if account.solde_final_credit is not None else None,
        "opening_debit": float(account.opening_debit) if account.opening_debit is not None else None,
        "opening_credit": float(account.opening_credit) if account.opening_credit is not None else None,
        "created_at": account.created_at.isoformat() if account.created_at else None,
    }
    
    # Replace NaN with None (NaN check: value != value)
    for key, value in result.items():
        if isinstance(value, float) and (value != value):
            result[key] = None
    
    return result


# ===== READ =====
@router.get("/get_account_by_id/{account_id}")
def get_account(account_id: int, db: Session = Depends(get_db)):
    """Get account by ID"""
    account = get_account_by_id(db, account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    return account_to_dict(account)


@router.get("/get_account_by_code_class/{account_code}")
def get_account_by_code_endpoint(account_code: str, db: Session = Depends(get_db)):
    """Get account by account code"""
    account = get_account_by_code(db, account_code)
    if not account:
        raise HTTPException(status_code=404, detail="Account code not found")
    return account_to_dict(account)


@router.get("/get_all_accounts/")
def get_accounts(
    upload_id: int = Query(None, description="Filter by upload ID"),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    db: Session = Depends(get_db),
):
    """
    Get accounts with pagination.
    
    Optional Query Parameters:
    - upload_id: Filter by specific upload
    - skip: Pagination offset (default: 0)
    - limit: Max results (default: 100, max: 1000)
    """
    if upload_id:
        accounts = get_accounts_by_upload(db, upload_id, skip, limit)
    else:
        accounts = get_all_accounts(db, skip, limit)
    
    count = get_accounts_count(db, upload_id)
    
    return {
        "status": "success",
        "total_count": count,
        "skip": skip,
        "limit": limit,
        "data": [account_to_dict(acc) for acc in accounts],
    }


@router.get("/search/")
def search_accounts_endpoint(
    keyword: str = Query(..., min_length=1, description="Search keyword"),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    db: Session = Depends(get_db),
):
    """
    Search accounts by account code or label.
    
    Path: /accounts/search/?keyword=VALUE
    """
    accounts = search_accounts(db, keyword, skip, limit)
    return {
        "status": "success",
        "keyword": keyword,
        "results": len(accounts),
        "data": [account_to_dict(acc) for acc in accounts],
    }


@router.get("/by_code_prefix/")
def get_accounts_by_prefix(
    prefix: str = Query(..., min_length=1, description="Account code prefix (e.g., '1', '23', '401')"),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    db: Session = Depends(get_db),
):
    """
    Get accounts by account code prefix.
    
    Examples:
    - /accounts/by_code_prefix/?prefix=1          (all accounts starting with "1")
    - /accounts/by_code_prefix/?prefix=23         (all accounts starting with "23")
    - /accounts/by_code_prefix/?prefix=401&limit=50  (all accounts starting with "401", max 50)
    """
    if not prefix or len(prefix) < 1:
        raise HTTPException(status_code=400, detail="Prefix must be at least 1 character")
    
    accounts = get_accounts_by_code_prefix(db, prefix, skip, limit)
    total = get_accounts_count_by_code_prefix(db, prefix)
    
    return {
        "status": "success",
        "prefix": prefix,
        "total_count": total,
        "returned": len(accounts),
        "skip": skip,
        "limit": limit,
        "data": [account_to_dict(acc) for acc in accounts],
    }

@router.get("/by_upload/{upload_id}")
def get_accounts_by_upload_id(
    upload_id: int,
    skip: int = Query(0, ge=0),
    limit: int = Query(1000, ge=1, le=10000),
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(current_user),
):
    """
    Get all accounts for a specific upload.
    
    Path: /accounts/by_upload/{upload_id}
    
    Query Parameters:
    - skip: Pagination offset (default: 0)
    - limit: Max results (default: 1000, max: 10000)
    
    Examples:
    - /accounts/by_upload/1                (all accounts for upload 1)
    - /accounts/by_upload/1?skip=50&limit=100  (accounts for upload 1, offset 50, max 100)
    """
    assert_upload_owned(db, upload_id, user)
    accounts = get_accounts_by_upload(db, upload_id, skip, limit)
    total = get_accounts_count(db, upload_id)
    
    return {
        "status": "success",
        "upload_id": upload_id,
        "total_count": total,
        "returned": len(accounts),
        "skip": skip,
        "limit": limit,
        "data": [account_to_dict(acc) for acc in accounts],
    }

# ===== UPDATE=====
@router.put("/update/{account_id}")
def update_account_endpoint(
    account_id: int,
    label: str = None,
    debit: float = None,
    credit: float = None,
    solde_debit: float = None,
    solde_credit: float = None,
    solde_final: float = None,
    solde_final_debit: float = None,
    solde_final_credit: float = None,
    opening_debit: float = None,
    opening_credit: float = None,
    db: Session = Depends(get_db),
):
    """Update account + auto-recalculate bilan if exists"""
    try:
        # All business logic is in the service function
        result = update_account_with_bilan(
            db,
            account_id,
            label=label,
            debit=debit,
            credit=credit,
            solde_debit=solde_debit,
            solde_credit=solde_credit,
            solde_final=solde_final,
            solde_final_debit=solde_final_debit,
            solde_final_credit=solde_final_credit,
            opening_debit=opening_debit,
            opening_credit=opening_credit,
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
 
 
# ===== DELETE =====
@router.delete("/delete/{account_id}")
def delete_account_endpoint(
    account_id: int,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(current_user),
):
    """Delete account + auto-recalculate bilan if exists"""
    logger.info("accounts/delete account_id=%s by user_id=%s", account_id, user.id)
    try:
        # All business logic is in the service function
        result = delete_account_with_bilan(db, account_id)
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.delete("/upload/{upload_id}")
def delete_accounts_by_upload_endpoint(
    upload_id: int,
    confirm: bool = Query(False, description="Set to true to confirm deletion"),
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(current_user),
):
    """
    Delete all accounts for a specific upload.
    
    Requires confirmation: ?confirm=true
    """
    if not confirm:
        raise HTTPException(
            status_code=400,
            detail="Deletion requires confirmation. Set ?confirm=true"
        )

    logger.info("accounts/delete-by-upload upload_id=%s by user_id=%s", upload_id, user.id)
    assert_upload_owned(db, upload_id, user)
    count = delete_accounts_by_upload(db, upload_id)
    return {
        "status": "success",
        "deleted_count": count,
        "message": f"Deleted {count} accounts from upload {upload_id}"
    }
