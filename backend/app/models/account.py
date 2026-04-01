from sqlalchemy import Column, Integer, String, Numeric, ForeignKey
from datetime import datetime

from app.db.cnx import Base


class Account(Base):
    __tablename__ = "accounts"

    id = Column(Integer, primary_key=True, index=True)

    # Link to uploaded file
    upload_id = Column(Integer, ForeignKey("uploads.id", ondelete="CASCADE"), nullable=False)

    # Financial data
    account_code = Column(String(50), nullable=True, index=True)
    label = Column(String, nullable=True)
    value = Column(Numeric, nullable=True)

    created_at = Column(String, default=lambda: datetime.utcnow().isoformat())