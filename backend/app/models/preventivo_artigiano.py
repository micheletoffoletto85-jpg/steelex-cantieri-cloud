from sqlalchemy import Column, Integer, String, Float, Date, DateTime, Text, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class PreventivoArtigiano(Base):
    """Preventivo ricevuto da un artigiano/subappaltatore per una lavorazione del cantiere.
    Serve al previsionale: costo atteso della manodopera esterna da incrociare col computo
    cliente per stimare il margine.

    NB: importare questo modello SOLO con import locali dentro le funzioni dei router
    (mai a livello di modulo / main.py / alembic env.py) — altrimenti
    Base.metadata.create_all() lo crea prima che ci arrivi la migrazione Alembic 0011,
    che fallirebbe trovando la tabella già esistente. Stesso pattern di FotoCantiere.
    """
    __tablename__ = "preventivi_artigiani"

    id = Column(Integer, primary_key=True, index=True)
    cantiere_id = Column(Integer, ForeignKey("cantieri.id", ondelete="CASCADE"), nullable=False, index=True)
    artigiano_nome = Column(String(200), nullable=False)   # nome libero o ragione sociale
    lavorazione = Column(String(300))                      # categoria / descrizione breve
    descrizione = Column(Text)                             # dettaglio della fornitura
    importo = Column(Float, nullable=False, default=0.0)   # importo del preventivo (IVA esclusa)
    stato = Column(String(20), default="ricevuto")         # ricevuto | accettato | rifiutato
    data = Column(Date)
    pdf_url = Column(String)
    note = Column(Text)
    creato_da = Column(Integer, ForeignKey("utenti.id"))
    creato_il = Column(DateTime(timezone=True), server_default=func.now())

    cantiere = relationship("Cantiere")
