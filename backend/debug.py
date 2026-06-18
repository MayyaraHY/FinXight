from app.db.cnx import SessionLocal
from app.services.bilan_service import BilanService

print("DEBUG SCRIPT STARTED")

db = SessionLocal()

service = BilanService(db)

print("STARTING TEST 164")

result = service.calculate_and_save(164)

print("DONE")
print(result)