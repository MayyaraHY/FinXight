from sqlalchemy import Column, Integer, String, Numeric, ForeignKey, func, DateTime
from sqlalchemy.orm import relationship
from app.db.cnx import Base

class Account(Base):
    __tablename__ = "accounts"

    id = Column(Integer, primary_key=True, index=True)

    # Link to uploaded file
    upload_id = Column(Integer, ForeignKey("uploads.id", ondelete="CASCADE"), nullable=False)
    upload = relationship("Upload", back_populates="accounts")

    # Required financial fields
    account_code = Column(String(50), nullable=False, index=True)  # Must be present and valid
    label = Column(String, nullable=True)  # Optional but important

    # Financial columns (all optional but preserved if present)
    debit = Column(Numeric(20, 2), nullable=True)
    credit = Column(Numeric(20, 2), nullable=True)
    
    # Period balances
    solde_debit = Column(Numeric(20, 2), nullable=True)      # Solde pér Dbt
    solde_credit = Column(Numeric(20, 2), nullable=True)     # Solde pér Cdt
    
    # Final balances (FIXED: Added these two columns!)
    solde_final_debit = Column(Numeric(20, 2), nullable=True)   # Solde fin Dbt
    solde_final_credit = Column(Numeric(20, 2), nullable=True)  # Solde fin Cdt
    
    # Legacy column (for backward compatibility, but mostly unused now)
    solde_final = Column(Numeric(20, 2), nullable=True)

    # Optional opening balances
    opening_debit = Column(Numeric(20, 2), nullable=True)
    opening_credit = Column(Numeric(20, 2), nullable=True)

    # Rubrique from the source file (e.g. Sage/ERP export classification).
    # Persisted as-is; never used for amount routing (rules win). Used only
    # for per-line reconciliation warnings (see app/core/reconciliation.py).
    source_rubrique = Column(String(255), nullable=True)

    created_at = Column(DateTime, server_default=func.now())