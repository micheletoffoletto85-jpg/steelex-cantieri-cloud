from sqlalchemy import Column, Integer, String, Float, Date, DateTime, Enum, ForeignKey, Text
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
