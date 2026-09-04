from sqlalchemy import Column, Integer, Numeric, Date, Text, DateTime, ForeignKey
from sqlalchemy.sql import func
from app.database import Base


class OreLavorate(Base):
    """Registro ore personale per utente (pagina 'Ore lavorate') — la tabella esiste già
    in produzione (creata dalla vecchia lista _migra() in main.py), qui solo il mapping
    ORM per poterla aggiornare dai rapportini."""
    __tablename__ = "ore_lavorate"

    id            = Column(Integer, primary_key=True, index=True)
    utente_id     = Column(Integer, ForeignKey("utenti.id", ondelete="CASCADE"), nullable=True)
    # Operatore esterno occasionale ("socio") senza account: quando utente_id è NULL
    # il nome dettato nel rapportino resta qui, così le sue ore compaiono comunque
    # nel registro Ore lavorate.
    operatore_nome = Column(Text, nullable=True)
    data          = Column(Date, nullable=False)
    ore           = Column(Numeric(5, 2), nullable=False)   # ore di lavoro effettive
    ore_viaggio   = Column(Numeric(5, 2), nullable=True)    # quota viaggio/trasferta (se presente)
    descrizione   = Column(Text, nullable=False)
    creato_il     = Column(DateTime(timezone=True), server_default=func.now())
    aggiornato_il = Column(DateTime(timezone=True), nullable=True)
    rapportino_id = Column(Integer, ForeignKey("rapportini_operativi.id", ondelete="SET NULL"), nullable=True)
