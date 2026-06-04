from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base

class Documento(Base):
    __tablename__ = "documenti"

    id = Column(Integer, primary_key=True, index=True)
    cantiere_id = Column(Integer, ForeignKey("cantieri.id"), nullable=False)
    nome = Column(String, nullable=False)
    tipo = Column(String(10))  # pdf, dxf, jpg, png
    url = Column(String, nullable=False)
    dimensione = Column(Integer)  # byte
    versione = Column(Integer, default=1)
    pin_dati = Column(JSON, default=list)  # [{x, y, nota, autore}]
    caricato_da = Column(Integer, ForeignKey("utenti.id"))
    creato_il = Column(DateTime(timezone=True), server_default=func.now())

    cantiere = relationship("Cantiere", back_populates="documenti")
