from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Boolean, Date, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class Artigiano(Base):
    __tablename__ = "artigiani"

    id          = Column(Integer, primary_key=True, index=True)
    nome        = Column(String(100), nullable=False)
    cognome     = Column(String(100), nullable=False)
    azienda     = Column(String(200), nullable=True)
    categoria   = Column(String(50), nullable=False, default="altro")
    # tags separati da virgola: "porte,falegname,serramenti"
    tags        = Column(Text, nullable=True)
    telefono    = Column(String(30), nullable=True)
    email       = Column(String(150), nullable=True)
    note        = Column(Text, nullable=True)
    attivo      = Column(Boolean, default=True, nullable=False)
    utente_id   = Column(Integer, ForeignKey("utenti.id", ondelete="SET NULL"), nullable=True)
    creato_da   = Column(Integer, ForeignKey("utenti.id"), nullable=True)
    creato_il   = Column(DateTime(timezone=True), server_default=func.now())

    # 3 documenti principali — link Google Drive + scadenza
    durc_scadenza               = Column(Date, nullable=True)
    durc_drive_url              = Column(String(500), nullable=True)
    primo_soccorso_scadenza     = Column(Date, nullable=True)
    primo_soccorso_drive_url    = Column(String(500), nullable=True)
    visura_camerale_scadenza    = Column(Date, nullable=True)
    visura_camerale_drive_url   = Column(String(500), nullable=True)

    # Link cartella Google Drive con tutti i documenti dell'artigiano
    drive_folder_url            = Column(String(500), nullable=True)

    # Campi legacy (mantenuti per retrocompatibilità, non usati nella UI)
    attestato_sicurezza_scadenza        = Column(Date, nullable=True)
    attestato_primo_soccorso_scadenza   = Column(Date, nullable=True)
    durc_url                            = Column(String(500), nullable=True)
    attestato_sicurezza_url             = Column(String(500), nullable=True)
    attestato_primo_soccorso_url        = Column(String(500), nullable=True)

    feedback         = relationship("FeedbackArtigiano", back_populates="artigiano", cascade="all, delete-orphan")
    cantieri_assoc   = relationship("CantiereArtigiano", back_populates="artigiano", cascade="all, delete-orphan")


class FeedbackArtigiano(Base):
    __tablename__ = "feedback_artigiani"

    id           = Column(Integer, primary_key=True, index=True)
    artigiano_id = Column(Integer, ForeignKey("artigiani.id", ondelete="CASCADE"), nullable=False)
    cantiere_id  = Column(Integer, ForeignKey("cantieri.id", ondelete="SET NULL"), nullable=True)
    # su | medio | giu
    voto         = Column(String(10), nullable=False, default="su")
    nota         = Column(Text, nullable=True)
    autore_id    = Column(Integer, ForeignKey("utenti.id"), nullable=False)
    creato_il    = Column(DateTime(timezone=True), server_default=func.now())

    artigiano    = relationship("Artigiano", back_populates="feedback")


class CantiereArtigiano(Base):
    """Artigiani (rubrica) assegnati a un cantiere."""
    __tablename__ = "cantieri_artigiani"
    __table_args__ = (UniqueConstraint("cantiere_id", "artigiano_id", name="uq_cantiere_artigiano"),)

    id           = Column(Integer, primary_key=True, index=True)
    cantiere_id  = Column(Integer, ForeignKey("cantieri.id", ondelete="CASCADE"), nullable=False)
    artigiano_id = Column(Integer, ForeignKey("artigiani.id", ondelete="CASCADE"), nullable=False)
    note         = Column(Text, nullable=True)
    aggiunto_il  = Column(DateTime(timezone=True), server_default=func.now())

    artigiano    = relationship("Artigiano", back_populates="cantieri_assoc")
