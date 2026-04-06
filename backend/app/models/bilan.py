from sqlalchemy import Column, Integer, ForeignKey, DateTime, func
from sqlalchemy.dialects.postgresql import JSON  # if using PostgreSQL
# If using SQLite/MySQL → use JSON from sqlalchemy (fallback)

from sqlalchemy.orm import relationship
from app.db.cnx import Base


class Bilan(Base):
    __tablename__ = "bilans"

    id = Column(Integer, primary_key=True, index=True)

    # Link to upload
    upload_id = Column(Integer, ForeignKey("uploads.id", ondelete="CASCADE"), nullable=False)

    # Full bilan stored as JSON
    data = Column(JSON, nullable=False)

    created_at = Column(DateTime, server_default=func.now())

    # Optional relationship
    upload = relationship("Upload")