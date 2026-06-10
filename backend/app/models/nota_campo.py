from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum
from app.database import Base

class StatoNota(str, enum.Enum):
    bozza = "bozza"          # inserita da artigiano/fornitore, non ancora vista
    validata = "validata"    # capocantiere ha letto e approvato
    pubblicata = "pubblicata"  # visibile nel diario/cantiere

class NotaCampo(Base):
    __tablename__ = "note_campo"

    id            = Column(Integer, primary_key=True, index=True)
    cantiere_id   = Column(Integer, ForeignKey("cantieri.id", ondelete="CASCADE"), nullable=False)
    autore_id     = Column(Integer, ForeignKey("utenti.id"), nullable=False)
    testo         = Column(Text, nullable=False)
    stato         = Column(String(20), default=StatoNota.bozza)
    # voci di spesa estratte dal testo (es. "5 ore stuccature")
    voci_spesa    = Column(JSON, default=list)
    # flag per impedire doppia inserzione in economia
    spesa_inserita = Column(Boolean, default=False)
    spesa_id      = Column(Integer, ForeignKey("spese.id"), nullable=True)  # collegamento alla spesa creata
    # validazione
    validato_da   = Column(Integer, ForeignKey("utenti.id"), nullable=True)
    validato_il   = Column(DateTime(timezone=True), nullable=True)
    # note del capocantiere sulla validazione
    note_validazione = Column(Text, nullable=True)

    creato_il     = Column(DateTime(timezone=True), server_default=func.now())
    aggiornato_il = Column(DateTime(timezone=True), onupdate=func.now())
