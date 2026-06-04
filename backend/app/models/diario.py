from sqlalchemy import Column, Integer, String, Date, DateTime, ForeignKey, Text, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base

class DiarioGiornaliero(Base):
    __tablename__ = "diari_giornalieri"

    id = Column(Integer, primary_key=True, index=True)
    cantiere_id = Column(Integer, ForeignKey("cantieri.id"), nullable=False)
    autore_id = Column(Integer, ForeignKey("utenti.id"), nullable=False)
    data = Column(Date, nullable=False)
    attivita = Column(Text)
    problemi = Column(Text)
    meteo = Column(String(50))
    operai_presenti = Column(Integer, default=0)
    foto_urls = Column(JSON, default=list)
    creato_il = Column(DateTime(timezone=True), server_default=func.now())

    cantiere = relationship("Cantiere", back_populates="diari")
    autore = relationship("Utente", back_populates="diari")
