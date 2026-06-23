from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Boolean, Date
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class Artigiano(Base):
    __tablename__ = "artigiani"

    id          = Column(Integer, primary_key=True, index=True)
    nome        = Column(String(100), nullable=False)
    cognome     = Column(String(100), nullable=False)
    azienda     = Column(String(200), nullable=True)
    categoria   = Column(String(50), nullable=False, default="altro")
    telefono    = Column(String(30), nullable=True)
    email       = Column(String(150), nullable=True)
    note        = Column(Text, nullable=True)
    attivo      = Column(Boolean, default=True, nullable=False)
    utente_id   = Column(Integer, ForeignKey("utenti.id", ondelete="SET NULL"), nullable=True)
    creato_da   = Column(Integer, ForeignKey("utenti.id"), nullable=True)
    creato_il   = Column(DateTime(timezone=True), server_default=func.now())
    durc_scadenza                       = Column(Date, nullable=True)
    attestato_sicurezza_scadenza        = Column(Date, nullable=True)
    attestato_primo_soccorso_scadenza   = Column(Date, nullable=True)
    durc_url                            = Column(String(500), nullable=True)
    attestato_sicurezza_url             = Column(String(500), nullable=True)
    attestato_primo_soccorso_url        = Column(String(500), nullable=True)

    feedback    = relationship("FeedbackArtigiano", back_populates="artigiano", cascade="all, delete-orphan")


class FeedbackArtigiano(Base):
    __tablename__ = "feedback_artigiani"

    id           = Column(Integer, primary_key=True, index=True)
    artigiano_id = Column(Integer, ForeignKey("artigiani.id", ondelete="CASCADE"), nullable=False)
    cantiere_id  = Column(Integer, ForeignKey("cantieri.id", ondelete="SET NULL"), nullable=True)
    # su | medio | giu
    voto         = Column(String(10), nullable=False, default="su")
    nota         = Column(Text, nullable=True)
    autore_id    = Column(Integer, ForeignKey("utenti.id"), nullable=False)
    creato_il    = Column(DateTime(timezone=True), server_default=func.now())

    artigiano    = relationship("Artigiano", back_populates="feedback")
