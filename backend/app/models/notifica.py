from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.sql import func
from app.database import Base


class PushSubscription(Base):
    """Sottoscrizione push per un utente (un dispositivo = una subscription)."""
    __tablename__ = "push_subscriptions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("utenti.id", ondelete="CASCADE"), nullable=False)
    endpoint = Column(String, nullable=False)
    p256dh = Column(String, nullable=False)   # chiave pubblica dispositivo
    auth = Column(String, nullable=False)      # token auth dispositivo
    creato_il = Column(DateTime(timezone=True), server_default=func.now())
