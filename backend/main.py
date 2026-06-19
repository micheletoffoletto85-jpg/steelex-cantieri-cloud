from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
import os

from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.config import settings
from app.database import engine, Base
from app.models import utente, cantiere, diario, documento, checklist, economico, notifica, raccolta_docs, nota_campo, fornitore_rating, artigiano, non_conformita, notifica_inapp, rapportino  # importa tutti i modelli
from app.routers import auth, utenti, cantieri, diari, checklist as checklist_router, trascrizioni, documenti, economico as economico_router, notifiche
from app.routers import raccolta_docs as raccolta_docs_router
from app.routers import archivio as archivio_router
from app.routers import files as files_router
from app.routers import note_campo as note_campo_router
from app.routers import fornitori_rating as fornitori_rating_router
from app.routers import artigiani as artigiani_router
from app.routers import non_conformita as nc_router
from app.routers import dashboard as dashboard_router
from app.routers import rapportini as rapportini_router
from sqlalchemy import text

# Crea tabelle al primo avvio
Base.metadata.create_all(bind=engine)

# Migra colonne nuove su tabelle esistenti (idempotente)
# Ogni statement usa connessione separata: in PostgreSQL un errore in transazione
# blocca tutti i comandi successivi (InFailedSqlTransaction).
def _migra():
    migrazioni = [
        "ALTER TABLE diari_giornalieri ADD COLUMN IF NOT EXISTS fonte VARCHAR(20) DEFAULT 'manuale'",
        "ALTER TABLE diari_giornalieri ADD COLUMN IF NOT EXISTS testo_originale TEXT",
        "ALTER TABLE diari_giornalieri ADD COLUMN IF NOT EXISTS lingua_originale VARCHAR(10)",
        "ALTER TABLE diari_giornalieri ADD COLUMN IF NOT EXISTS voci_estratte JSONB DEFAULT '[]'",
        """CREATE TABLE IF NOT EXISTS cantiere_artigiani (
            cantiere_id INTEGER NOT NULL REFERENCES cantieri(id) ON DELETE CASCADE,
            utente_id   INTEGER NOT NULL REFERENCES utenti(id)   ON DELETE CASCADE,
            PRIMARY KEY (cantiere_id, utente_id)
        )""",
        """CREATE TABLE IF NOT EXISTS archivio_docs (
            id          SERIAL PRIMARY KEY,
            cantiere_id INTEGER NOT NULL REFERENCES cantieri(id) ON DELETE CASCADE,
            nome        VARCHAR(300) NOT NULL,
            categoria   VARCHAR(50) DEFAULT 'varie',
            descrizione TEXT,
            file_url    VARCHAR(500) NOT NULL,
            tipo_file   VARCHAR(10),
            caricato_da INTEGER REFERENCES utenti(id),
            caricato_il TIMESTAMPTZ DEFAULT NOW()
        )""",
        "ALTER TABLE diari_giornalieri ADD COLUMN IF NOT EXISTS condividi_cliente BOOLEAN DEFAULT FALSE",
        "ALTER TABLE fasi_lavoro ADD COLUMN IF NOT EXISTS visibile_cliente BOOLEAN DEFAULT FALSE",
        """CREATE TABLE IF NOT EXISTS richieste_documenti (
            id           SERIAL PRIMARY KEY,
            cantiere_id  INTEGER NOT NULL REFERENCES cantieri(id) ON DELETE CASCADE,
            titolo       VARCHAR(200) NOT NULL,
            descrizione  TEXT,
            assegnato_a  INTEGER REFERENCES utenti(id),
            scadenza     DATE,
            stato        VARCHAR(20) DEFAULT 'richiesto',
            file_url     VARCHAR(500),
            note_rifiuto TEXT,
            creato_da    INTEGER REFERENCES utenti(id),
            creato_il    TIMESTAMPTZ DEFAULT NOW(),
            caricato_il  TIMESTAMPTZ
        )""",
        # Tutti i valori enum ruoloutente (idempotente — IF NOT EXISTS)
        "ALTER TYPE ruoloutente ADD VALUE IF NOT EXISTS 'artigiano'",
        "ALTER TYPE ruoloutente ADD VALUE IF NOT EXISTS 'fornitore'",
        "ALTER TYPE ruoloutente ADD VALUE IF NOT EXISTS 'cliente'",
        "ALTER TYPE ruoloutente ADD VALUE IF NOT EXISTS 'capo_cantiere_sub'",
        "ALTER TYPE ruoloutente ADD VALUE IF NOT EXISTS 'direzione_lavori'",
        # Nuovi ruoli estesi
        "ALTER TABLE utenti ADD COLUMN IF NOT EXISTS tipo_professione VARCHAR(50)",
        # Imposta visibile_cliente = FALSE dove è NULL (righe precedenti alla migration)
        "UPDATE fasi_lavoro SET visibile_cliente = FALSE WHERE visibile_cliente IS NULL",
        # Nuovi ruoli (enum PostgreSQL — IF NOT EXISTS per idempotenza)
        "ALTER TYPE ruoloutente ADD VALUE IF NOT EXISTS 'architetto'",
        "ALTER TYPE ruoloutente ADD VALUE IF NOT EXISTS 'responsabile_sicurezza'",
        "ALTER TYPE ruoloutente ADD VALUE IF NOT EXISTS 'amministrazione'",
        # Tabella note di campo
        """CREATE TABLE IF NOT EXISTS note_campo (
            id               SERIAL PRIMARY KEY,
            cantiere_id      INTEGER NOT NULL REFERENCES cantieri(id) ON DELETE CASCADE,
            autore_id        INTEGER NOT NULL REFERENCES utenti(id),
            testo            TEXT NOT NULL,
            stato            VARCHAR(20) DEFAULT 'bozza',
            voci_spesa       JSONB DEFAULT '[]',
            spesa_inserita   BOOLEAN DEFAULT FALSE,
            spesa_id         INTEGER REFERENCES spese(id),
            validato_da      INTEGER REFERENCES utenti(id),
            validato_il      TIMESTAMPTZ,
            note_validazione TEXT,
            creato_il        TIMESTAMPTZ DEFAULT NOW(),
            aggiornato_il    TIMESTAMPTZ
        )""",
        # Tabella rating fornitori/artigiani
        """CREATE TABLE IF NOT EXISTS fornitori_rating (
            id           SERIAL PRIMARY KEY,
            fornitore_id INTEGER NOT NULL REFERENCES utenti(id) ON DELETE CASCADE,
            cantiere_id  INTEGER REFERENCES cantieri(id) ON DELETE SET NULL,
            tipo         VARCHAR(10) NOT NULL DEFAULT 'positivo',
            categoria    VARCHAR(30) NOT NULL DEFAULT 'qualita',
            punteggio    INTEGER NOT NULL DEFAULT 3,
            testo        TEXT,
            creato_da    INTEGER NOT NULL REFERENCES utenti(id),
            creato_il    TIMESTAMPTZ DEFAULT NOW()
        )""",
        # Tabella permessi categorie documenti
        """CREATE TABLE IF NOT EXISTS doc_categoria_permessi (
            id          SERIAL PRIMARY KEY,
            cantiere_id INTEGER NOT NULL REFERENCES cantieri(id) ON DELETE CASCADE,
            utente_id   INTEGER NOT NULL REFERENCES utenti(id) ON DELETE CASCADE,
            categoria   VARCHAR(50) NOT NULL,
            can_read    BOOLEAN DEFAULT TRUE,
            can_write   BOOLEAN DEFAULT FALSE,
            UNIQUE (cantiere_id, utente_id, categoria)
        )""",
        # Migra categoria archivio_docs verso le 4 categorie ufficiali
        "UPDATE archivio_docs SET categoria = 'operativita' WHERE categoria NOT IN ('sicurezza','relazioni_disegni','amministrazione','operativita')",
        # Validazione diario: artigiani inseriscono bozze, capocantiere pubblica
        "ALTER TABLE diari_giornalieri ADD COLUMN IF NOT EXISTS stato_validazione VARCHAR(20) DEFAULT 'pubblicata'",
        # Rubrica artigiani standalone (senza account app)
        """CREATE TABLE IF NOT EXISTS artigiani (
            id          SERIAL PRIMARY KEY,
            nome        VARCHAR(100) NOT NULL,
            cognome     VARCHAR(100) NOT NULL,
            azienda     VARCHAR(200),
            categoria   VARCHAR(50) NOT NULL DEFAULT 'altro',
            telefono    VARCHAR(30),
            email       VARCHAR(150),
            note        TEXT,
            attivo      BOOLEAN NOT NULL DEFAULT TRUE,
            creato_da   INTEGER REFERENCES utenti(id),
            creato_il   TIMESTAMPTZ DEFAULT NOW()
        )""",
        """CREATE TABLE IF NOT EXISTS feedback_artigiani (
            id           SERIAL PRIMARY KEY,
            artigiano_id INTEGER NOT NULL REFERENCES artigiani(id) ON DELETE CASCADE,
            cantiere_id  INTEGER REFERENCES cantieri(id) ON DELETE SET NULL,
            voto         VARCHAR(10) NOT NULL DEFAULT 'su',
            nota         TEXT,
            autore_id    INTEGER NOT NULL REFERENCES utenti(id),
            creato_il    TIMESTAMPTZ DEFAULT NOW()
        )""",
        "ALTER TABLE artigiani ADD COLUMN IF NOT EXISTS utente_id INTEGER REFERENCES utenti(id) ON DELETE SET NULL",
        "UPDATE artigiani SET categoria = 'carpenteria_metallica' WHERE categoria = 'saldatura'",
        # Scadenze documenti artigiani
        "ALTER TABLE artigiani ADD COLUMN IF NOT EXISTS durc_scadenza DATE",
        "ALTER TABLE artigiani ADD COLUMN IF NOT EXISTS attestato_sicurezza_scadenza DATE",
        "ALTER TABLE artigiani ADD COLUMN IF NOT EXISTS attestato_primo_soccorso_scadenza DATE",
        "ALTER TABLE artigiani ADD COLUMN IF NOT EXISTS durc_url VARCHAR(500)",
        "ALTER TABLE artigiani ADD COLUMN IF NOT EXISTS attestato_sicurezza_url VARCHAR(500)",
        "ALTER TABLE artigiani ADD COLUMN IF NOT EXISTS attestato_primo_soccorso_url VARCHAR(500)",
        # Notifiche in-app
        """CREATE TABLE IF NOT EXISTS notifiche_inapp (
            id          SERIAL PRIMARY KEY,
            user_id     INTEGER NOT NULL REFERENCES utenti(id) ON DELETE CASCADE,
            cantiere_id INTEGER REFERENCES cantieri(id) ON DELETE CASCADE,
            tipo        VARCHAR(30) DEFAULT 'info',
            titolo      VARCHAR(200) NOT NULL,
            corpo       TEXT,
            url         VARCHAR(300),
            letta       BOOLEAN DEFAULT FALSE,
            creato_il   TIMESTAMPTZ DEFAULT NOW()
        )""",
        "CREATE INDEX IF NOT EXISTS idx_notifiche_inapp_user ON notifiche_inapp(user_id, letta, creato_il DESC)",
        # Extra preventivo nel diario
        "ALTER TABLE diari_giornalieri ADD COLUMN IF NOT EXISTS extra_preventivo BOOLEAN DEFAULT FALSE",
        "ALTER TABLE diari_giornalieri ADD COLUMN IF NOT EXISTS extra_preventivo_nota TEXT",
        # Autorizzazione pagamento fatture
        "ALTER TABLE fatture_fornitori ADD COLUMN IF NOT EXISTS autorizzata BOOLEAN DEFAULT FALSE",
        "ALTER TABLE fatture_fornitori ADD COLUMN IF NOT EXISTS autorizzata_da INTEGER REFERENCES utenti(id)",
        "ALTER TABLE fatture_fornitori ADD COLUMN IF NOT EXISTS autorizzata_il TIMESTAMPTZ",
        # Registro Non Conformità
        """CREATE TABLE IF NOT EXISTS non_conformita (
            id               SERIAL PRIMARY KEY,
            cantiere_id      INTEGER NOT NULL REFERENCES cantieri(id) ON DELETE CASCADE,
            descrizione      TEXT NOT NULL,
            foto_url         VARCHAR(500),
            responsabile_id  INTEGER REFERENCES utenti(id),
            scadenza         DATE,
            stato            VARCHAR(20) DEFAULT 'aperta',
            nota_chiusura    TEXT,
            creato_da        INTEGER NOT NULL REFERENCES utenti(id),
            creato_il        TIMESTAMPTZ DEFAULT NOW(),
            chiusa_il        TIMESTAMPTZ
        )""",
        # Ruolo operativo interno
        "ALTER TYPE ruoloutente ADD VALUE IF NOT EXISTS 'operativo'",
        # Rapportini operativi interni
        """CREATE TABLE IF NOT EXISTS rapportini_operativi (
            id                SERIAL PRIMARY KEY,
            operativo_id      INTEGER NOT NULL REFERENCES utenti(id),
            cantiere_id       INTEGER REFERENCES cantieri(id) ON DELETE SET NULL,
            diario_id         INTEGER REFERENCES diari_giornalieri(id) ON DELETE SET NULL,
            creato_il         TIMESTAMPTZ DEFAULT NOW(),
            data_lavoro       VARCHAR(10),
            testo_originale   TEXT,
            testo_elaborato   TEXT,
            testo_italiano    TEXT,
            lingua_originale  VARCHAR(10) DEFAULT 'it',
            cantiere_rilevato VARCHAR(300),
            ore_lavorate      FLOAT,
            lavorazioni       JSONB DEFAULT '[]',
            materiali         JSONB DEFAULT '[]',
            criticita         TEXT,
            spese_extra       JSONB DEFAULT '[]',
            riassunto         TEXT,
            stato             VARCHAR(20) DEFAULT 'inviato',
            fuori_cantiere    BOOLEAN DEFAULT FALSE,
            validato_da_id    INTEGER REFERENCES utenti(id),
            validato_il       TIMESTAMPTZ,
            note_admin        TEXT
        )""",
    ]
    for sql in migrazioni:
        try:
            with engine.connect() as conn:
                conn.execute(text(sql))
                conn.commit()
        except Exception:
            pass  # colonna/tabella già presente

_migra()

from app.storage import configura_cors_r2
configura_cors_r2()

limiter = Limiter(key_func=get_remote_address)

app = FastAPI(
    title="STEELEX Cantieri API",
    description="Piattaforma gestione cantieri STEELEX",
    version="1.0.0",
    redirect_slashes=False,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

cors_origins = [o.strip() for o in settings.CORS_ORIGINS.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=False,  # JWT in header, no cookie
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept"],
)

# Crea cartella upload (usata solo in sviluppo — produzione usa R2)
os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
# NOTA: NON montiamo più StaticFiles — i file sono serviti via endpoint autenticato /uploads/*

app.include_router(auth.router, prefix="/api/v1")
app.include_router(utenti.router, prefix="/api/v1")
app.include_router(cantieri.router, prefix="/api/v1")
app.include_router(diari.router, prefix="/api/v1")
app.include_router(diari.ore_router, prefix="/api/v1")
app.include_router(diari.foto_router, prefix="/api/v1")
app.include_router(checklist_router.router, prefix="/api/v1")
app.include_router(trascrizioni.router, prefix="/api/v1")
app.include_router(documenti.router, prefix="/api/v1")
app.include_router(economico_router.router, prefix="/api/v1")
app.include_router(notifiche.router, prefix="/api/v1")
app.include_router(raccolta_docs_router.router, prefix="/api/v1")
app.include_router(archivio_router.router, prefix="/api/v1")
app.include_router(files_router.router)
app.include_router(note_campo_router.router, prefix="/api/v1")
app.include_router(fornitori_rating_router.router, prefix="/api/v1")
app.include_router(artigiani_router.router, prefix="/api/v1")
app.include_router(nc_router.router, prefix="/api/v1")
app.include_router(dashboard_router.router, prefix="/api/v1")
app.include_router(rapportini_router.router, prefix="/api/v1")

@app.get("/")
def root():
    return {"status": "ok", "app": "STEELEX Cantieri API", "versione": "1.0.0"}

@app.get("/health")
def health():
    return {"status": "healthy"}
