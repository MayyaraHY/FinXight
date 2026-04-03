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
    solde_debit = Column(Numeric(20, 2), nullable=True)
    solde_credit = Column(Numeric(20, 2), nullable=True)
    solde_final = Column(Numeric(20, 2), nullable=True)

    # Optional opening balances
    opening_debit = Column(Numeric(20, 2), nullable=True)
    opening_credit = Column(Numeric(20, 2), nullable=True)

    created_at = Column(DateTime, server_default=func.now())