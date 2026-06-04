from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os

from app.config import settings
from app.database import engine, Base
from app.models import utente, cantiere, diario, documento  # importa tutti i modelli
from app.routers import auth, utenti, cantieri, diari

# Crea tabelle al primo avvio
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="STEELEX Cantieri API",
    description="Piattaforma gestione cantieri STEELEX",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS.split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Servi i file caricati
os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=settings.UPLOAD_DIR), name="uploads")

app.include_router(auth.router, prefix="/api/v1")
app.include_router(utenti.router, prefix="/api/v1")
app.include_router(cantieri.router, prefix="/api/v1")
app.include_router(diari.router, prefix="/api/v1")

@app.get("/")
def root():
    return {"status": "ok", "app": "STEELEX Cantieri API", "versione": "1.0.0"}

@app.get("/health")
def health():
    return {"status": "healthy"}
