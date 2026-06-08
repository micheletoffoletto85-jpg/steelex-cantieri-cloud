from sqlalchemy import Column, Integer, String, Float, Date, DateTime, Enum, ForeignKey, Text, JSON, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum
from app.database import Base


class StatoOrdine(str, enum.Enum):
    bozza = "bozza"
    inviato = "inviato"
    confermato = "confermato"
    evaso = "evaso"
    annullato = "annullato"

class CategoriaOrdine(str, enum.Enum):
    materiali = "materiali"
    manodopera = "manodopera"
    nolo = "nolo"
    servizi = "servizi"
    altro = "altro"

class StatoFattura(str, enum.Enum):
    ricevuta = "ricevuta"
    da_pagare = "da_pagare"
    pagata = "pagata"
    contestata = "contestata"

class StatoSAL(str, enum.Enum):
    bozza = "bozza"
    emesso = "emesso"
    pagato = "pagato"

class CategoriaSpesa(str, enum.Enum):
    materiali = "materiali"
    manodopera = "manodopera"
    nolo = "nolo"
    servizi = "servizi"
    trasporto = "trasporto"
    altro = "altro"

class StatoFase(str, enum.Enum):
    pianificata = "pianificata"
    in_corso = "in_corso"
    completata = "completata"
    in_ritardo = "in_ritardo"
    sospesa = "sospesa"

class StatoPreventivo(str, enum.Enum):
    bozza = "bozza"
    inviato = "inviato"
    accettato = "accettato"
    rifiutato = "rifiutato"

class StatoBolla(str, enum.Enum):
    aperta = "aperta"
    fatturata = "fatturata"


class OrdineAcquisto(Base):
    __tablename__ = "ordini_acquisto"

    id = Column(Integer, primary_key=True, index=True)
    cantiere_id = Column(Integer, ForeignKey("cantieri.id", ondelete="CASCADE"), nullable=False)
    fornitore_id = Column(Integer, ForeignKey("utenti.id"), nullable=True)
    fornitore_nome = Column(String, nullable=False)  # nome libero o dal sistema
    descrizione = Column(Text, nullable=False)
    categoria = Column(Enum(CategoriaOrdine, native_enum=False), default=CategoriaOrdine.materiali)
    importo = Column(Float, nullable=False, default=0.0)
    iva_perc = Column(Float, default=22.0)
    importo_totale = Column(Float, nullable=False, default=0.0)
    stato = Column(Enum(StatoOrdine, native_enum=False), default=StatoOrdine.bozza)
    data_ordine = Column(Date)
    data_consegna_prevista = Column(Date)
    note = Column(Text)
    creato_da = Column(Integer, ForeignKey("utenti.id"))
    creato_il = Column(DateTime(timezone=True), server_default=func.now())

    cantiere = relationship("Cantiere", back_populates="ordini")
    fatture = relationship("FatturaFornitore", back_populates="ordine")


class FatturaFornitore(Base):
    __tablename__ = "fatture_fornitori"

    id = Column(Integer, primary_key=True, index=True)
    cantiere_id = Column(Integer, ForeignKey("cantieri.id", ondelete="CASCADE"), nullable=False)
    ordine_id = Column(Integer, ForeignKey("ordini_acquisto.id"), nullable=True)
    fornitore_nome = Column(String, nullable=False)
    numero_fattura = Column(String)
    descrizione = Column(Text)
    importo_netto = Column(Float, nullable=False, default=0.0)
    iva_perc = Column(Float, default=22.0)
    importo_iva = Column(Float, default=0.0)
    importo_totale = Column(Float, nullable=False, default=0.0)
    data_fattura = Column(Date)
    data_scadenza = Column(Date)
    stato = Column(Enum(StatoFattura, native_enum=False), default=StatoFattura.ricevuta)
    pdf_url = Column(String)
    creato_il = Column(DateTime(timezone=True), server_default=func.now())

    cantiere = relationship("Cantiere", back_populates="fatture")
    ordine = relationship("OrdineAcquisto", back_populates="fatture")
    bolle = relationship("BollaConsegna", back_populates="fattura")


class SAL(Base):
    __tablename__ = "sal"

    id = Column(Integer, primary_key=True, index=True)
    cantiere_id = Column(Integer, ForeignKey("cantieri.id", ondelete="CASCADE"), nullable=False)
    numero = Column(Integer, nullable=False)
    titolo = Column(String, nullable=False)
    percentuale = Column(Float, default=0.0)  # % avanzamento a cui corrisponde
    importo = Column(Float, nullable=False, default=0.0)
    data = Column(Date)
    stato = Column(Enum(StatoSAL, native_enum=False), default=StatoSAL.bozza)
    note = Column(Text)
    creato_il = Column(DateTime(timezone=True), server_default=func.now())

    cantiere = relationship("Cantiere", back_populates="sal")
    fasi = relationship("FaseLavoro", back_populates="sal")


class PreventivoCantiere(Base):
    """Preventivo inviato al cliente, con righe di voci e ricarico."""
    __tablename__ = "preventivi"

    id = Column(Integer, primary_key=True, index=True)
    cantiere_id = Column(Integer, ForeignKey("cantieri.id", ondelete="CASCADE"), nullable=False)
    numero = Column(String)                         # es. "2024/001"
    data = Column(Date)
    validita_giorni = Column(Integer, default=30)
    # voci: [{id, descrizione, categoria, qt, um, costo_unitario, ricarico_perc, prezzo_unitario, totale}]
    voci = Column(JSON, default=list)
    subtotale = Column(Float, default=0.0)          # somma prezzi cliente
    costo_totale = Column(Float, default=0.0)       # somma costi base (privato)
    iva_perc = Column(Float, default=22.0)
    totale = Column(Float, default=0.0)             # subtotale + IVA
    acconto_perc = Column(Float, default=30.0)
    acconto_importo = Column(Float, default=0.0)
    acconto_ricevuto = Column(Float, default=0.0)
    data_acconto = Column(Date)
    stato = Column(Enum(StatoPreventivo, native_enum=False), default=StatoPreventivo.bozza)
    pdf_url = Column(String)
    note = Column(Text)
    creato_il = Column(DateTime(timezone=True), server_default=func.now())

    cantiere = relationship("Cantiere", back_populates="preventivi")


class BollaConsegna(Base):
    """DDT ricevuto dal fornitore al momento della consegna materiali."""
    __tablename__ = "bolle_consegna"

    id = Column(Integer, primary_key=True, index=True)
    cantiere_id = Column(Integer, ForeignKey("cantieri.id", ondelete="CASCADE"), nullable=False)
    fattura_id = Column(Integer, ForeignKey("fatture_fornitori.id"), nullable=True)
    fornitore_nome = Column(String, nullable=False)
    numero_bolla = Column(String)
    data = Column(Date)
    importo_stimato = Column(Float, default=0.0)
    descrizione = Column(Text)
    foto_url = Column(String)
    stato = Column(Enum(StatoBolla, native_enum=False), default=StatoBolla.aperta)
    creato_il = Column(DateTime(timezone=True), server_default=func.now())

    cantiere = relationship("Cantiere", back_populates="bolle")
    fattura = relationship("FatturaFornitore", back_populates="bolle")


class Spesa(Base):
    """Registro semplice delle spese — sostituisce Ordini + Bolle + Fatture."""
    __tablename__ = "spese"

    id = Column(Integer, primary_key=True, index=True)
    cantiere_id = Column(Integer, ForeignKey("cantieri.id", ondelete="CASCADE"), nullable=False)
    descrizione = Column(String, nullable=False)
    fornitore = Column(String)
    categoria = Column(Enum(CategoriaSpesa, native_enum=False), default=CategoriaSpesa.materiali)
    importo = Column(Float, nullable=False, default=0.0)
    data = Column(Date)
    note = Column(String)
    allegato_url = Column(String)          # foto o PDF allegato
    allegato_tipo = Column(String)         # "foto" o "pdf"
    creato_da = Column(Integer, ForeignKey("utenti.id"))
    creato_il = Column(DateTime(timezone=True), server_default=func.now())

    cantiere = relationship("Cantiere", back_populates="spese")


class FaseLavoro(Base):
    """Fase/attività del cronoprogramma (riga del diagramma di Gantt)."""
    __tablename__ = "fasi_lavoro"

    id = Column(Integer, primary_key=True, index=True)
    cantiere_id = Column(Integer, ForeignKey("cantieri.id", ondelete="CASCADE"), nullable=False)
    sal_id = Column(Integer, ForeignKey("sal.id"), nullable=True)  # SAL di riferimento
    nome = Column(String, nullable=False)
    categoria = Column(String, default="lavorazione")  # lavorazione, fornitura, collaudo, admin
    colore = Column(String, default="#FF6B00")  # hex color
    ordine = Column(Integer, default=0)
    data_inizio = Column(Date)
    data_fine_prevista = Column(Date)
    data_fine_reale = Column(Date)
    percentuale = Column(Float, default=0.0)
    stato = Column(Enum(StatoFase, native_enum=False), default=StatoFase.pianificata)
    note = Column(String)
    creato_il = Column(DateTime(timezone=True), server_default=func.now())

    visibile_cliente = Column(Boolean, default=False)  # condividi fase con il cliente

    cantiere = relationship("Cantiere", back_populates="fasi")
    sal = relationship("SAL", back_populates="fasi")
