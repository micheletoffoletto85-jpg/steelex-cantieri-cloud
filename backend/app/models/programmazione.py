from sqlalchemy import Column, Integer, JSON, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from datetime import datetime
from app.database import Base


class ProgrammazioneSettimana(Base):
    __tablename__ = "programmazione_settimana"
    __table_args__ = (
        UniqueConstraint("operativo_id", "anno", "settimana", name="uq_prog_operativo_settimana"),
    )

    id           = Column(Integer, primary_key=True, index=True)
    admin_id     = Column(Integer, ForeignKey("utenti.id"), nullable=False)
    operativo_id = Column(Integer, ForeignKey("utenti.id"), nullable=False)
    anno         = Column(Integer, nullable=False)
    settimana    = Column(Integer, nullable=False)   # numero settimana ISO
    giorni        = Column(JSON, default=dict)         # {"lun": {"cantiere_id": 5, "lavorazione": "...", "note": "..."}, ...}
    creato_il     = Column(DateTime, default=datetime.utcnow)
    aggiornato_il = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    notificato_il = Column(DateTime, nullable=True)

    admin     = relationship("Utente", foreign_keys=[admin_id])
    operativo = relationship("Utente", foreign_keys=[operativo_id])
