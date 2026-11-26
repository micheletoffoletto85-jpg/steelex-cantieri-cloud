"""Rete di sicurezza dell'app: cestino (cose eliminate, ripristinabili),
registro attività (diario di bordo di chi ha fatto cosa) e chiavi per il
backup automatico dal PC dell'ufficio."""
from sqlalchemy import Column, Integer, String, DateTime, Boolean, JSON
from sqlalchemy.sql import func
from app.database import Base


class ElementoCestino(Base):
    __tablename__ = "cestino"

    id = Column(Integer, primary_key=True, index=True)
    tipo = Column(String(40), nullable=False)               # "cantiere"
    oggetto_id = Column(Integer, nullable=False, index=True)
    nome = Column(String(300))
    dati = Column(JSON, nullable=False)                     # fotografia completa delle righe
    righe = Column(Integer, default=0)
    eliminato_il = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    eliminato_da = Column(Integer, nullable=True)
    eliminato_da_nome = Column(String(200))
    ripristinato_il = Column(DateTime(timezone=True), nullable=True)
    ripristinato_da_nome = Column(String(200))
    richiesta = Column(String(40), index=True)              # una richiesta DELETE = una voce


class RegistroAttivita(Base):
    __tablename__ = "registro_attivita"

    id = Column(Integer, primary_key=True, index=True)
    quando = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    utente_id = Column(Integer, nullable=True, index=True)
    utente_nome = Column(String(200))
    metodo = Column(String(8), nullable=False)
    percorso = Column(String(400), nullable=False)
    esito = Column(Integer)                                 # codice HTTP
    descrizione = Column(String(400))
    cantiere_id = Column(Integer, nullable=True, index=True)
    ip = Column(String(64))


class ChiaveBackup(Base):
    __tablename__ = "chiavi_backup"

    id = Column(Integer, primary_key=True, index=True)
    nome = Column(String(120), nullable=False)
    impronta = Column(String(64), nullable=False, unique=True)   # sha256 della chiave
    creata_il = Column(DateTime(timezone=True), server_default=func.now())
    creata_da_nome = Column(String(200))
    ultimo_uso = Column(DateTime(timezone=True), nullable=True)
    attiva = Column(Boolean, nullable=False, default=True)


class FileInCestino(Base):
    """File (foto, PDF…) eliminati dall'app: restano su R2 finché si svuota il
    cestino o passano 90 giorni, così un ripristino li ritrova."""
    __tablename__ = "file_in_cestino"

    id = Column(Integer, primary_key=True, index=True)
    chiave = Column(String(500), nullable=False)
    richiesta = Column(String(40), index=True)
    creato_il = Column(DateTime(timezone=True), server_default=func.now(), index=True)
