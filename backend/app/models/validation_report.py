from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, func
from sqlalchemy.dialects.postgresql import JSON
from sqlalchemy.orm import relationship

from app.db.cnx import Base


class ValidationReport(Base):
    """
    Per-upload PCGT validation report (1:1 per upload, latest wins).

    `status` tracks the async background task lifecycle so the UI can show a
    "computing…" state:
        pending -> the validation task has been scheduled / is running
        done    -> `data` holds the finished report
        failed  -> the task errored (data may be empty); upload is unaffected
    """
    __tablename__ = "validation_reports"

    id = Column(Integer, primary_key=True, index=True)

    upload_id = Column(
        Integer, ForeignKey("uploads.id", ondelete="CASCADE"), nullable=False, index=True
    )

    status = Column(String(20), nullable=False, server_default="pending")

    # { "summary": {total, valid, warnings, errors}, "lines": [...] }
    data = Column(JSON, nullable=True)

    created_at = Column(DateTime, server_default=func.now())

    upload = relationship("Upload")
