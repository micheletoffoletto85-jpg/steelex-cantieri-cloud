from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey
from sqlalchemy.sql import func
from app.database import Base


class NotificaInApp(Base):
    __tablename__ = "notifiche_inapp"

    id          = Column(Integer, primary_key=True, index=True)
    user_id     = Column(Integer, ForeignKey("utenti.id", ondelete="CASCADE"), nullable=False, index=True)
    cantiere_id = Column(Integer, ForeignKey("cantieri.id", ondelete="CASCADE"), nullable=True)
    tipo        = Column(String(30), default="info")   # info | warning | extra_preventivo | nc | fattura
    titolo      = Column(String(200), nullable=False)
    corpo       = Column(Text, nullable=True)
    url         = Column(String(300), nullable=True)
    letta       = Column(Boolean, default=False, nullable=False)
    creato_il   = Column(DateTime(timezone=True), server_default=func.now(), index=True)
