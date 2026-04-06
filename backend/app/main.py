from fastapi import FastAPI
from app.controllers.upload_controller import router as upload_router
from app.controllers.account_controller import router as account_router
from app.controllers.bilan_controller import router as bilan_router
from app.db.cnx import Base, engine

app = FastAPI(title="Financial AI Engine")

# create tables automatically (for now)
Base.metadata.create_all(bind=engine)

app.include_router(upload_router)
app.include_router(account_router)
app.include_router(bilan_router)


@app.get("/")
def home():
    return {"message": "Financial AI Engine running"}