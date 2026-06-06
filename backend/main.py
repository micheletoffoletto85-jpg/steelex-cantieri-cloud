from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os

from app.config import settings
from app.database import engine, Base
from app.models import utente, cantiere, diario, documento, checklist, economico, notifica  # importa tutti i modelli
from app.routers import auth, utenti, cantieri, diari, checklist as checklist_router, trascrizioni, documenti, economico as economico_router, notifiche
from sqlalchemy import text

# Crea tabelle al primo avvio
Base.metadata.create_all(bind=engine)

# Migra colonne nuove su tabelle esistenti (idempotente)
def _migra():
    migrazioni = [
        # Diario: nuovi campi AI
        "ALTER TABLE diari_giornalieri ADD COLUMN IF NOT EXISTS fonte VARCHAR(20) DEFAULT 'manuale'",
        "ALTER TABLE diari_giornalieri ADD COLUMN IF NOT EXISTS testo_originale TEXT",
        "ALTER TABLE diari_giornalieri ADD COLUMN IF NOT EXISTS lingua_originale VARCHAR(10)",
        "ALTER TABLE diari_giornalieri ADD COLUMN IF NOT EXISTS voci_estratte JSONB DEFAULT '[]'",
    ]
    with engine.connect() as conn:
        for sql in migrazioni:
            try:
                conn.execute(text(sql))
            except Exception:
                pass  # colonna già presente o altro errore non bloccante
        conn.commit()

_migra()

app = FastAPI(
    title="STEELEX Cantieri API",
    description="Piattaforma gestione cantieri STEELEX",
    version="1.0.0",
    redirect_slashes=False,
)

cors_origins = settings.CORS_ORIGINS.split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=False,  # JWT in header, no cookie — no credentials needed
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
app.include_router(diari.ore_router, prefix="/api/v1")
app.include_router(checklist_router.router, prefix="/api/v1")
app.include_router(trascrizioni.router, prefix="/api/v1")
app.include_router(documenti.router, prefix="/api/v1")
app.include_router(economico_router.router, prefix="/api/v1")
app.include_router(notifiche.router, prefix="/api/v1")

@app.get("/")
def root():
    return {"status": "ok", "app": "STEELEX Cantieri API", "versione": "1.0.0"}

@app.get("/health")
def health():
    return {"status": "healthy"}
