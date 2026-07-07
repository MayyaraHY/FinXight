from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, func
from app.db.cnx import Base


class CorrectionLog(Base):
    __tablename__ = "correction_logs"

    id = Column(Integer, primary_key=True, index=True)
    upload_id = Column(Integer, ForeignKey("uploads.id", ondelete="CASCADE"), nullable=False, index=True)
    anomaly_id = Column(String, nullable=False)
    compte_code = Column(String, nullable=True)
    field = Column(String, nullable=True)
    old_value = Column(String, nullable=True)
    new_value = Column(String, nullable=True)
    note = Column(String, nullable=True)
    corrected_at = Column(DateTime, server_default=func.now())
