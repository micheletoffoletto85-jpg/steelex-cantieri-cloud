from sqlalchemy import Column, Integer, String, Text, Float, Boolean, DateTime, ForeignKey, JSON
from sqlalchemy.orm import relationship
from datetime import datetime
from app.database import Base


class RapportinoOperativo(Base):
    __tablename__ = "rapportini_operativi"

    id             = Column(Integer, primary_key=True, index=True)
    operativo_id   = Column(Integer, ForeignKey("utenti.id"), nullable=False)
    cantiere_id    = Column(Integer, ForeignKey("cantieri.id"), nullable=True)   # null = fuori cantiere
    diario_id      = Column(Integer, ForeignKey("diari_giornalieri.id"), nullable=True)  # after validation

    creato_il      = Column(DateTime, default=datetime.utcnow)
    data_lavoro    = Column(String(10))   # YYYY-MM-DD

    # Testi
    testo_originale = Column(Text)        # trascrizione Whisper
    testo_elaborato = Column(Text)        # testo ordinato da Claude (lingua originale)
    testo_italiano  = Column(Text)        # traduzione finale italiana
    lingua_originale = Column(String(10), default="it")

    # Dati estratti da Claude
    cantiere_rilevato = Column(String(300))   # nome cantiere come detto dall'operativo
    ore_lavorate      = Column(Float, nullable=True)
    lavorazioni       = Column(JSON, default=list)   # ["posa cartongesso", ...]
    materiali         = Column(JSON, default=list)   # ["cartongesso 12.5mm", ...]
    criticita         = Column(Text, nullable=True)
    spese_extra       = Column(JSON, default=list)   # [{"descrizione": "...", "importo": 0}]
    riassunto         = Column(Text)

    # Stato validazione
    stato             = Column(String(20), default="inviato")  # inviato | validato | rifiutato
    fuori_cantiere    = Column(Boolean, default=False)
    validato_da_id    = Column(Integer, ForeignKey("utenti.id"), nullable=True)
    validato_il       = Column(DateTime, nullable=True)
    note_admin        = Column(Text, nullable=True)

    operativo    = relationship("Utente", foreign_keys=[operativo_id])
    validato_da  = relationship("Utente", foreign_keys=[validato_da_id])
    cantiere     = relationship("Cantiere", foreign_keys=[cantiere_id])
