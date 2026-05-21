from sqlalchemy import Column, Integer, String, DateTime, func
from sqlalchemy.dialects.postgresql import UUID
from app.db.base import Base

class Company(Base):
    __tablename__ = "companies"

    id         = Column(Integer, primary_key=True, index=True)
    user_id    = Column(UUID(as_uuid=True), nullable=False, index=True)
    name       = Column(String, nullable=False)
    created_at = Column(DateTime, server_default=func.now())