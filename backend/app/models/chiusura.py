from sqlalchemy import Column, Integer, String, Text, Date, DateTime, ForeignKey, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class ChiusuraCantiere(Base):
    """Verbale di chiusura cantiere — documento relazionale (NON contabile) di fine
    lavori: relazione dei lavori svolti, selezione foto, dati di consegna e firme.

    NB: importare questo modello SOLO con import locali dentro le funzioni dei
    router (mai a livello di modulo/main.py) — altrimenti Base.metadata.create_all()
    lo crea prima che ci arrivi la migrazione Alembic, che fallisce trovando la
    tabella già esistente. Stesso pattern di FotoCantiere / PreventivoArtigiano."""
    __tablename__ = "chiusure_cantiere"

    id = Column(Integer, primary_key=True, index=True)
    cantiere_id = Column(Integer, ForeignKey("cantieri.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)

    # Contenuto del verbale
    relazione        = Column(Text)                      # descrizione dei lavori eseguiti (bozza AI + modifiche)
    consegne         = Column(Text)                      # elenco consegne al committente
    foto_ids         = Column(JSON, default=list)        # id di foto_cantiere selezionate, nell'ordine scelto
    foto_copertina_id = Column(Integer, nullable=True)   # foto di copertina (id foto_cantiere)

    # Dati di chiusura (precompilati dal cantiere, modificabili)
    committente_nome = Column(String)                    # default = cantiere.cliente
    direzione_lavori = Column(String)                    # nome DL (può non essere un utente del sistema)
    responsabile_nome = Column(String)                   # nome responsabile di cantiere
    data_ultimazione = Column(Date, nullable=True)       # data di fine lavori dichiarata nel verbale

    stato       = Column(String(20), default="bozza")   # bozza | definitivo
    numero      = Column(String(40), nullable=True)     # es. "2026 / 014" (assegnato alla conferma)

    creato_da   = Column(Integer, ForeignKey("utenti.id"))
    creato_il   = Column(DateTime(timezone=True), server_default=func.now())
    aggiornato_il = Column(DateTime(timezone=True), onupdate=func.now())

    cantiere = relationship("Cantiere")
    autore   = relationship("Utente")
