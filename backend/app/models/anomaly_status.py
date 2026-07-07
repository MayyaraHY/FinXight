from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, func, UniqueConstraint
from app.db.cnx import Base


class AnomalyStatus(Base):
    """
    Per-anomaly UI state (ignored / deleted) keyed by the frontend anomaly_id
    (e.g. "bilan-2", "ai-0"). Anomalies are regenerated from live sources on every
    load, so this table lets an "ignore" or "delete" action survive regeneration.
    """
    __tablename__ = "anomaly_statuses"

    id = Column(Integer, primary_key=True, index=True)
    upload_id = Column(Integer, ForeignKey("uploads.id", ondelete="CASCADE"), nullable=False, index=True)
    anomaly_id = Column(String, nullable=False)
    status = Column(String, nullable=False)  # "ignored" | "deleted"
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint("upload_id", "anomaly_id", name="uq_anomaly_status_upload_anomaly"),
    )
