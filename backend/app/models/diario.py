from sqlalchemy import Column, Integer, BigInteger, String, Date, DateTime, ForeignKey, Text, JSON, Float, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base

class DiarioGiornaliero(Base):
    __tablename__ = "diari_giornalieri"

    id = Column(Integer, primary_key=True, index=True)
    cantiere_id = Column(Integer, ForeignKey("cantieri.id"), nullable=False)
    autore_id = Column(Integer, ForeignKey("utenti.id"), nullable=False)
    data = Column(Date, nullable=False)
    attivita = Column(Text)
    problemi = Column(Text)
    meteo = Column(String(50))
    operai_presenti = Column(Integer, default=0)
    foto_urls = Column(JSON, default=list)
    creato_il = Column(DateTime(timezone=True), server_default=func.now())
    # Campi per registrazione vocale AI
    condividi_cliente = Column(Boolean, default=False)  # mostra al cliente nella pagina aggiornamenti
    fonte = Column(String(20), default="manuale")       # manuale | voce
    testo_originale = Column(Text)                      # testo grezzo prima della traduzione
    lingua_originale = Column(String(10))               # es. "ro", "en", "it"
    voci_estratte = Column(JSON, default=list)          # voci contabilizzabili estratte da Claude
    stato_validazione = Column(String(20), default="pubblicata")  # bozza | pubblicata
    extra_preventivo = Column(Boolean, default=False)   # lavorazione extra rispetto al preventivo
    extra_preventivo_nota = Column(Text, nullable=True)

    cantiere = relationship("Cantiere", back_populates="diari")
    autore = relationship("Utente", back_populates="diari")
    ore_extra = relationship("OreExtra", back_populates="diario", cascade="all, delete-orphan", order_by="OreExtra.id")


class OreExtra(Base):
    """Ore di lavoro extra registrate dagli artigiani nel diario vocale."""
    __tablename__ = "ore_extra"

    id = Column(Integer, primary_key=True, index=True)
    cantiere_id = Column(Integer, ForeignKey("cantieri.id"), nullable=False)
    diario_id = Column(Integer, ForeignKey("diari_giornalieri.id"), nullable=True)
    operaio_nome = Column(String(200), nullable=False)
    # Operatore/utente a cui è collegata questa riga ore (per aggiornare il suo registro
    # ore personale) — null se il nome citato non corrisponde a nessun utente
    utente_id = Column(Integer, ForeignKey("utenti.id", ondelete="SET NULL"), nullable=True)
    ore = Column(Float, nullable=False)
    attivita = Column(Text)
    tariffa_oraria = Column(Float, default=0.0)
    totale = Column(Float, default=0.0)
    data = Column(Date, nullable=False)
    approvato = Column(Boolean, default=False)
    note = Column(Text)
    # Lavorazione extra rispetto al preventivo — a livello di singola riga ore: un rapportino
    # può avere colleghi con ore normali e uno con ore extra preventivo, non è un flag unico
    # per tutta la nota diario
    extra_preventivo = Column(Boolean, default=False)
    extra_preventivo_nota = Column(Text, nullable=True)
    # id della voce creata nel computo quando la riga è segnata extra preventivo
    # (per aggiornarla/rimuoverla se la riga cambia o viene de-selezionata).
    # BIGINT: gli id voce sono timestamp in ms (~1.8e12), fuori range per INTEGER
    voce_extra_id = Column(BigInteger, nullable=True)
    creato_da = Column(Integer, ForeignKey("utenti.id"))
    creato_il = Column(DateTime(timezone=True), server_default=func.now())

    cantiere = relationship("Cantiere")
    diario = relationship("DiarioGiornaliero", back_populates="ore_extra")
    creatore = relationship("Utente", foreign_keys=[creato_da])
    operatore = relationship("Utente", foreign_keys=[utente_id])
