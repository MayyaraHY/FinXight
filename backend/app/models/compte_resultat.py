from sqlalchemy import Column, Integer, ForeignKey, DateTime, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from app.db.cnx import Base


class CompteResultat(Base):
    __tablename__ = "compte_resultats"

    id         = Column(Integer, primary_key=True, index=True)
    upload_id  = Column(Integer, ForeignKey("uploads.id", ondelete="CASCADE"),
                        nullable=False, unique=True)
    data       = Column(JSONB, nullable=False)
    created_at = Column(DateTime, server_default=func.now())

    upload = relationship("Upload")