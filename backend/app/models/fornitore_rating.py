from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.sql import func
from app.database import Base

class FornitoreRating(Base):
    __tablename__ = "fornitori_rating"

    id           = Column(Integer, primary_key=True, index=True)
    fornitore_id = Column(Integer, ForeignKey("utenti.id", ondelete="CASCADE"), nullable=False)
    cantiere_id  = Column(Integer, ForeignKey("cantieri.id", ondelete="SET NULL"), nullable=True)
    # positivo / negativo / neutro
    tipo         = Column(String(10), nullable=False, default="positivo")
    # categorie: puntualita, qualita, prezzo, comunicazione, sicurezza
    categoria    = Column(String(30), nullable=False, default="qualita")
    punteggio    = Column(Integer, nullable=False, default=3)  # 1-5
    testo        = Column(Text, nullable=True)
    creato_da    = Column(Integer, ForeignKey("utenti.id"), nullable=False)
    creato_il    = Column(DateTime(timezone=True), server_default=func.now())
