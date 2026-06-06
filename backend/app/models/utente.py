from sqlalchemy import Column, Integer, String, Boolean, DateTime, Enum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum
from app.database import Base

class RuoloUtente(str, enum.Enum):
    admin = "admin"
    capo_cantiere = "capo_cantiere"
    artigiano = "artigiano"
    fornitore = "fornitore"
    cliente = "cliente"

class Utente(Base):
    __tablename__ = "utenti"

    id = Column(Integer, primary_key=True, index=True)
    nome = Column(String, nullable=False)
    cognome = Column(String, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    ruolo = Column(Enum(RuoloUtente, native_enum=False), default=RuoloUtente.capo_cantiere)
    attivo = Column(Boolean, default=True)
    creato_il = Column(DateTime(timezone=True), server_default=func.now())
    aggiornato_il = Column(DateTime(timezone=True), onupdate=func.now())

    cantieri = relationship("Cantiere", back_populates="responsabile")
    diari = relationship("DiarioGiornaliero", back_populates="autore")
