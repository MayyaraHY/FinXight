from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Boolean
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from datetime import datetime
from app.db.cnx import Base

class Upload(Base):
    __tablename__ = "uploads"

    id = Column(Integer, primary_key=True, index=True)

    # Soft FK to user-service's users.id. No SQL FK declared because the
    # referenced table lives in a different Postgres database; integrity is
    # enforced by the application (every insert pulls user.id from the JWT).
    # Nullable for legacy rows that existed before auth was introduced —
    # listing endpoints filter by user_id so unowned rows are invisible.
    user_id = Column(UUID(as_uuid=True), nullable=True, index=True)

    filename = Column(String, nullable=False)
    file_path = Column(String, nullable=False)
    display_filename = Column(String, nullable=True)  # Custom display name (optional, defaults to filename)
    status = Column(String, default="uploaded")
    created_at = Column(DateTime, default=datetime.utcnow)

    company_id   = Column(Integer, ForeignKey("companies.id", ondelete="SET NULL"), nullable=True, index=True)
    period_year  = Column(Integer, nullable=True)   # e.g. 2024
    period_month = Column(Integer, nullable=True)

    # True when the source file contained a "Rubrique" column. Reconciliation
    # warnings are only meaningful when this flag is set.
    has_rubrique_column = Column(Boolean, nullable=False, server_default="false")

    accounts = relationship(
        "Account",
        back_populates="upload",
        cascade="all, delete",
        passive_deletes=True,
    )
