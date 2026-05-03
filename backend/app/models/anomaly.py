from sqlalchemy import Column, Integer, ForeignKey, JSON, DateTime
from sqlalchemy.sql import func
from app.db.cnx import Base


class Anomaly(Base):
    __tablename__ = "anomalies"

    id = Column(Integer, primary_key=True, index=True)
    upload_id = Column(
        Integer, ForeignKey("uploads.id", ondelete="CASCADE"), nullable=False, index=True
    )
    anomalies = Column(JSON, nullable=False, default=list)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
