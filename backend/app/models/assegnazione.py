from sqlalchemy import Column, Integer, String, Text, DateTime, Date, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class AssegnazioneOperatore(Base):
    __tablename__ = "assegnazioni_operatore"

    id           = Column(Integer, primary_key=True, index=True)
    artigiano_id = Column(Integer, ForeignKey("artigiani.id", ondelete="CASCADE"), nullable=True)
    utente_id    = Column(Integer, ForeignKey("utenti.id",    ondelete="CASCADE"), nullable=True)
    data         = Column(Date, nullable=False)
    turno        = Column(String(1), nullable=False)   # 'M' o 'P'
    tipo         = Column(String(20), nullable=False, server_default="cantiere")  # cantiere | ferie | corso | permesso | altro
    cantiere_id  = Column(Integer, ForeignKey("cantieri.id", ondelete="SET NULL"), nullable=True)
    lavorazione  = Column(String(200), nullable=True)
    note         = Column(Text, nullable=True)
    creato_da    = Column(Integer, ForeignKey("utenti.id"), nullable=True)
    creato_il    = Column(DateTime(timezone=True), server_default=func.now())

    artigiano = relationship("Artigiano", foreign_keys=[artigiano_id])
    utente    = relationship("Utente",    foreign_keys=[utente_id])
    cantiere  = relationship("Cantiere",  foreign_keys=[cantiere_id])
