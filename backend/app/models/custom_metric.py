from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, Numeric, String, func
from sqlalchemy.dialects.postgresql import UUID
from app.db.cnx import Base


class CustomMetric(Base):
    __tablename__ = "custom_metrics"

    id            = Column(Integer, primary_key=True, index=True)
    # NULL company_id = a global, user-scoped library metric (applies to every
    # company the user owns). A non-null company_id is a legacy company-scoped row.
    company_id    = Column(Integer, ForeignKey("companies.id", ondelete="CASCADE"), nullable=True, index=True)
    user_id       = Column(UUID(as_uuid=True), nullable=False, index=True)
    name          = Column(String, nullable=False)
    formula       = Column(String, nullable=False)
    kind          = Column(String, nullable=False)            # 'kpi' | 'ratio'
    format        = Column(String, nullable=True)             # 'currency' | 'ratio' | 'percent'
    higher_better = Column(Boolean, nullable=False, default=True)
    threshold     = Column(Numeric(20, 4), nullable=True)
    created_at    = Column(DateTime, server_default=func.now())
