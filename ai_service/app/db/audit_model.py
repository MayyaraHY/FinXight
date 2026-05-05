from sqlalchemy import Column, Integer, String, Text, DateTime, Float
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.sql import func

class Base(DeclarativeBase):
    pass

class AIRequest(Base):
    __tablename__ = "ai_requests"
    id = Column(Integer, primary_key=True)
    endpoint = Column(String(50))          # /chat, /anomalies/detect, /bilan/analyze
    prompt_tokens = Column(Integer)
    response_tokens = Column(Integer)
    latency_ms = Column(Float)
    error = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())