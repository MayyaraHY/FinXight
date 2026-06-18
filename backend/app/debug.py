# debug_bilan.py

from app.db.cnx import SessionLocal
from app.services.bilan_service import BilanService

db = SessionLocal()

try:
    service = BilanService(db)
    result = service.calculate_and_save(164)
    print(result)
finally:
    db.close()