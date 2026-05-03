from fastapi import FastAPI
from sqlalchemy import text
from app.controllers.upload_controller import router as upload_router
from app.controllers.account_controller import router as account_router
from app.controllers.bilan_controller import router as bilan_router
from app.controllers.ai_controller import router as ai_router
from app.db.cnx import Base, engine
from app.cors.cors_config import setup_cors

app = FastAPI(title="Financial AI Engine")

#cors config
setup_cors(app)

# create tables automatically (for now)
Base.metadata.create_all(bind=engine)

# Ensure columns added in later migrations exist (safe to run on every startup)
with engine.connect() as _conn:
    _conn.execute(text(
        "ALTER TABLE IF EXISTS anomalies ADD COLUMN IF NOT EXISTS anomalies JSON"
    ))
    _conn.execute(text(
        "ALTER TABLE IF EXISTS anomalies "
        "ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()"
    ))
    _conn.commit()

app.include_router(upload_router)
app.include_router(account_router)
app.include_router(bilan_router)
app.include_router(ai_router)


@app.get("/")
def home():
    return {"message": "Financial AI Engine running"}

@app.get("/test")
def test():
    return {"message": "Backend is connected 🚀"}