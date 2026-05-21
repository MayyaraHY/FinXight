from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from app.core.config import settings

engine = create_engine(settings.DATABASE_URL)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

from app.models.upload import Upload
from app.models.account import Account
from app.models.bilan import Bilan
from app.models.anomaly import Anomaly
from app.models.compte_resultat import CompteResultat
from app.models.company import Company