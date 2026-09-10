from sqlalchemy import Column, Integer, String, Float, Boolean, Date, DateTime, Text, JSON, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class MisuraContabilita(Base):
    """Riga del libretto delle misure di contabilità cantiere: una misura presa
    in cantiere, agganciata (di norma) a una voce del computo base.

    Serve a tenere traccia — con data, autore, dimensioni e foto — di ogni
    misura contabile fatta durante i lavori, così da non poter essere contestati
    in sede di contabilità finale. Il riepilogo per voce (qt a computo vs qt
    misurata) confluisce nel verbale di chiusura e in un PDF contabile dedicato.

    NB: importare questo modello SOLO con import locali dentro le funzioni dei
    router (mai a livello di modulo/main.py) — altrimenti Base.metadata.create_all()
    lo crea prima che ci arrivi la migrazione Alembic, che fallisce trovando la
    tabella già esistente. Stesso pattern di ChiusuraCantiere / FotoCantiere."""
    __tablename__ = "misure_contabilita"

    id = Column(Integer, primary_key=True, index=True)
    cantiere_id = Column(Integer, ForeignKey("cantieri.id", ondelete="CASCADE"), nullable=False, index=True)

    # Voce del computo di riferimento (id dentro il JSON preventivi.voci — può
    # essere int o stringa, lo teniamo come stringa). Gli altri campi sono uno
    # "scatto" al momento dell'inserimento: se il computo viene poi modificato
    # la misura resta comunque leggibile.
    voce_id           = Column(String)
    voce_descrizione  = Column(String)
    voce_um           = Column(String)
    voce_qt_computo   = Column(Float)

    descrizione       = Column(String, nullable=False)   # dove/cosa è stato misurato
    parti             = Column(Float, default=1.0)       # n. di parti uguali
    lunghezza         = Column(Float)
    larghezza         = Column(Float)
    altezza           = Column(Float)                    # altezza / spessore / peso
    quantita          = Column(Float, nullable=False, default=0.0)  # calcolata o forzata
    quantita_manuale  = Column(Boolean, default=False)   # True = quantità inserita a mano

    data_misura       = Column(Date)
    foto_urls         = Column(JSON, default=list)
    note              = Column(Text)

    misurato_da       = Column(Integer, ForeignKey("utenti.id"))
    misurato_da_nome  = Column(String)                   # snapshot leggibile

    creato_il         = Column(DateTime(timezone=True), server_default=func.now())
    aggiornato_il     = Column(DateTime(timezone=True), onupdate=func.now())

    cantiere = relationship("Cantiere")
    autore   = relationship("Utente")
