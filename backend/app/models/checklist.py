from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base

class ChecklistItem(Base):
    __tablename__ = "checklist_items"

    id = Column(Integer, primary_key=True, index=True)
    cantiere_id = Column(Integer, ForeignKey("cantieri.id"), nullable=False)
    testo = Column(String, nullable=False)
    completato = Column(Boolean, default=False)
    completato_da = Column(Integer, ForeignKey("utenti.id"), nullable=True)
    completato_il = Column(DateTime(timezone=True), nullable=True)
    ordine = Column(Integer, default=0)
    creato_il = Column(DateTime(timezone=True), server_default=func.now())

    cantiere = relationship("Cantiere", back_populates="checklist")
