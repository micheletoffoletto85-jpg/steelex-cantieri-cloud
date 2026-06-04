from sqlalchemy import Column, Integer, String, Float, Date, DateTime, Enum, ForeignKey, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum
from app.database import Base

class StatoCantiere(str, enum.Enum):
    preventivo = "preventivo"
    in_corso = "in_corso"
    sospeso = "sospeso"
    completato = "completato"
    annullato = "annullato"

class Cantiere(Base):
    __tablename__ = "cantieri"

    id = Column(Integer, primary_key=True, index=True)
    nome = Column(String, nullable=False)
    cliente = Column(String, nullable=False)
    indirizzo = Column(String)
    citta = Column(String)
    provincia = Column(String(2))
    stato = Column(Enum(StatoCantiere, native_enum=False), default=StatoCantiere.preventivo)
    avanzamento = Column(Float, default=0.0)  # 0-100%
    data_inizio = Column(Date)
    data_fine_prevista = Column(Date)
    data_fine_reale = Column(Date)
    budget = Column(Float, default=0.0)
    note = Column(Text)
    responsabile_id = Column(Integer, ForeignKey("utenti.id"))
    creato_il = Column(DateTime(timezone=True), server_default=func.now())
    aggiornato_il = Column(DateTime(timezone=True), onupdate=func.now())

    responsabile = relationship("Utente", back_populates="cantieri")
    diari = relationship("DiarioGiornaliero", back_populates="cantiere", cascade="all, delete-orphan")
    documenti = relationship("Documento", back_populates="cantiere", cascade="all, delete-orphan")
    checklist = relationship("ChecklistItem", back_populates="cantiere", cascade="all, delete-orphan")
