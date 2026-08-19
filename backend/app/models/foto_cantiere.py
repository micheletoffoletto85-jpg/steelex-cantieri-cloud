from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class FotoCantiere(Base):
    """Galleria foto curata del cantiere — ordine e visibilità cliente gestiti dallo staff.
    Indipendente da diario/pin (che restano il registro giornaliero, non toccato).

    NB: importare questo modello SOLO con import locali dentro le funzioni dei
    router (mai a livello di modulo/main.py) — altrimenti Base.metadata.create_all()
    lo crea prima che ci arrivi la migrazione Alembic 0003, che fallisce trovandolo
    già esistente. Vedi commento in main.py sulla lista modelli congelata."""
    __tablename__ = "foto_cantiere"

    id = Column(Integer, primary_key=True, index=True)
    cantiere_id = Column(Integer, ForeignKey("cantieri.id"), nullable=False, index=True)
    url = Column(String, nullable=False)
    ordine = Column(Integer, default=0, nullable=False)
    visibile_cliente = Column(Boolean, default=False, nullable=False)
    nota = Column(Text)
    autore_id = Column(Integer, ForeignKey("utenti.id"))
    creato_il = Column(DateTime(timezone=True), server_default=func.now())

    autore = relationship("Utente")
