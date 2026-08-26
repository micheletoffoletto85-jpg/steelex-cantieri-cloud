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

    # Dati estratti da Claude — allineato a FR: form strutturato (descrizione_lavori/
    # descrizione_extra/materiale_extra) oltre alla dettatura, non solo estrazione IA
    cantiere_rilevato     = Column(String(300))   # nome cantiere come detto dall'operativo
    descrizione_lavori    = Column(Text, nullable=True)    # descrizione lavori svolti (form o IA)
    foto_avanzamento_urls = Column(JSON, default=list)     # foto stato avanzamento
    descrizione_extra     = Column(Text, nullable=True)    # lavori/note extra (non extra_preventivo)
    foto_extra_urls       = Column(JSON, default=list)     # foto extra
    ore_extra             = Column(Float, nullable=True)   # ore extra rispetto standard
    materiale_extra       = Column(Text, nullable=True)    # materiale extra usato
    ore_lavorate          = Column(Float, nullable=True)
    # Colleghi citati come presenti/al lavoro insieme all'operativo ma senza un proprio
    # rapportino — [{"nome": "...", "ore": numero_o_null}]. Le loro ore vanno comunque
    # registrate nel cantiere, non solo quelle di chi ha inviato il rapportino
    colleghi_ore      = Column(JSON, default=list)
    lavorazioni       = Column(JSON, default=list)   # ["posa cartongesso", ...]
    materiali         = Column(JSON, default=list)   # ["cartongesso 12.5mm", ...]
    criticita         = Column(Text, nullable=True)
    spese_extra       = Column(JSON, default=list)   # [{"descrizione": "...", "importo": 0}]
    riassunto         = Column(Text)

    # Lavorazione extra rispetto al preventivo originale (da fatturare a parte) — diverso
    # da descrizione_extra/materiale_extra, che sono note libere di lavori insoliti: questo
    # è un flag esplicito per marcare/filtrare cosa va oltre il preventivo col cliente
    extra_preventivo      = Column(Boolean, default=False)
    extra_preventivo_nota = Column(Text, nullable=True)

    # Foto allegate — foto_urls è la colonna storica pre-form-strutturato, non più scritta
    # da codice nuovo (le foto vanno in foto_avanzamento_urls/foto_extra_urls) ma lasciata
    # per non perdere gli URL delle foto dei rapportini già esistenti
    foto_urls         = Column(JSON, default=list)

    # Stato validazione
    stato             = Column(String(20), default="inviato")  # inviato | validato | rifiutato | diviso
    fuori_cantiere    = Column(Boolean, default=False)
    validato_da_id    = Column(Integer, ForeignKey("utenti.id"), nullable=True)
    validato_il       = Column(DateTime, nullable=True)
    note_admin        = Column(Text, nullable=True)

    # Multi-cantiere: quando il rapportino parla di piu' cantieri, Claude elenca qui
    # i segmenti rilevati ({cantiere, cantiere_id, ore, lavorazioni, riassunto}) cosi'
    # l'admin puo' dividerlo in piu' rapportini con l'endpoint /dividi
    multi_cantiere    = Column(Boolean, default=False)
    segmenti_cantieri = Column(JSON, nullable=True)

    # Riga ore_extra creata automaticamente alla validazione (per spostarla/aggiornarla
    # se il rapportino viene poi riassegnato o modificato)
    ore_extra_id      = Column(Integer, ForeignKey("ore_extra.id"), nullable=True)

    # Riga nel registro ore personale dell'operativo, creata automaticamente alla
    # validazione a partire da ore_lavorate (per aggiornarla se il rapportino viene
    # poi modificato o diviso)
    ore_lavorate_id   = Column(Integer, ForeignKey("ore_lavorate.id"), nullable=True)

    operativo    = relationship("Utente", foreign_keys=[operativo_id])
    validato_da  = relationship("Utente", foreign_keys=[validato_da_id])
    cantiere     = relationship("Cantiere", foreign_keys=[cantiere_id])
