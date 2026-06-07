from sqlalchemy import Column, Integer, String, Date, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base

class RichiestaDocumento(Base):
    __tablename__ = "richieste_documenti"

    id            = Column(Integer, primary_key=True, index=True)
    cantiere_id   = Column(Integer, ForeignKey("cantieri.id"), nullable=False)
    titolo        = Column(String(200), nullable=False)
    descrizione   = Column(Text, nullable=True)
    assegnato_a   = Column(Integer, ForeignKey("utenti.id"), nullable=True)  # None = chiunque del cantiere
    scadenza      = Column(Date, nullable=True)
    stato         = Column(String(20), default="richiesto")  # richiesto / caricato / approvato / rifiutato
    file_url      = Column(String(500), nullable=True)
    note_rifiuto  = Column(Text, nullable=True)
    creato_da     = Column(Integer, ForeignKey("utenti.id"), nullable=True)
    creato_il     = Column(DateTime(timezone=True), server_default=func.now())
    caricato_il   = Column(DateTime(timezone=True), nullable=True)

    cantiere      = relationship("Cantiere", foreign_keys=[cantiere_id], backref="richieste_documenti")
    assegnato     = relationship("Utente", foreign_keys=[assegnato_a])
    creato        = relationship("Utente", foreign_keys=[creato_da])
