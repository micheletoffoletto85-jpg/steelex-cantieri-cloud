from sqlalchemy import Column, Integer, String, Date, DateTime, ForeignKey, Text, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class NonConformita(Base):
    __tablename__ = "non_conformita"

    id             = Column(Integer, primary_key=True, index=True)
    cantiere_id    = Column(Integer, ForeignKey("cantieri.id", ondelete="CASCADE"), nullable=False)
    descrizione    = Column(Text, nullable=False)
    foto_url       = Column(String(500))
    responsabile_id = Column(Integer, ForeignKey("utenti.id"), nullable=True)
    scadenza       = Column(Date)
    stato          = Column(String(20), default="aperta")   # aperta / chiusa
    nota_chiusura  = Column(Text)
    creato_da      = Column(Integer, ForeignKey("utenti.id"), nullable=False)
    creato_il      = Column(DateTime(timezone=True), server_default=func.now())
    chiusa_il      = Column(DateTime(timezone=True))

    cantiere       = relationship("Cantiere", foreign_keys=[cantiere_id], backref="non_conformita")
    responsabile   = relationship("Utente", foreign_keys=[responsabile_id])
    autore         = relationship("Utente", foreign_keys=[creato_da])
