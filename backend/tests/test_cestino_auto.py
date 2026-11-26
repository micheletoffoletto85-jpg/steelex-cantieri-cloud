"""Cestino automatico: ogni eliminazione fatta da un utente (DELETE) si ripristina."""
import os

os.environ.setdefault("DATABASE_URL", "postgresql://u:p@localhost:1/test")
os.environ.setdefault("SECRET_KEY", "x" * 40)

import sqlalchemy as sa  # noqa: E402
from sqlalchemy import event, Column, Integer, String, ForeignKey, JSON  # noqa: E402
from sqlalchemy.orm import declarative_base, sessionmaker, relationship  # noqa: E402

from app.models import utente, cantiere, diario, documento, economico, notifica, raccolta_docs, nota_campo, fornitore_rating, artigiano, non_conformita, notifica_inapp, rapportino, programmazione, assegnazione, sicurezza  # noqa: F401,E402
from app import cestino_auto  # noqa: E402
from app.models.sicurezza import ElementoCestino, FileInCestino  # noqa: E402

B = declarative_base()


class Prev(B):
    __tablename__ = "comm_preventivi"
    id = Column(Integer, primary_key=True)
    numero = Column(String)
    voci = relationship("Voce", cascade="all, delete-orphan")


class Voce(B):
    __tablename__ = "comm_preventivo_voci"
    id = Column(Integer, primary_key=True)
    preventivo_id = Column(Integer, ForeignKey("comm_preventivi.id", ondelete="CASCADE"), nullable=False)
    descrizione = Column(String)


class Diario(B):
    __tablename__ = "diari_giornalieri"
    id = Column(Integer, primary_key=True)
    foto = Column(JSON, default=list)


class Segnaposto(B):
    __tablename__ = "foto_cantiere_eliminate"
    id = Column(Integer, primary_key=True)
    url = Column(String)


def _sessione():
    eng = sa.create_engine("sqlite://")

    @event.listens_for(eng, "connect")
    def _fk(c, _):
        c.execute("PRAGMA foreign_keys=ON")
    B.metadata.create_all(eng)
    ElementoCestino.__table__.create(eng)
    FileInCestino.__table__.create(eng)
    S = sessionmaker(bind=eng)
    cestino_auto.collega(S)
    return S


def _come_richiesta(metodo, percorso):
    cestino_auto.richiesta_corrente.set(cestino_auto.nuova_richiesta(metodo, percorso, None))


def test_preventivo_eliminato_con_le_voci_si_ripristina():
    S = _sessione()
    db = S()
    db.add(Prev(id=28, numero="003/2026", voci=[Voce(id=1, descrizione="Controsoffitto"), Voce(id=2, descrizione="Pittura")]))
    db.commit()

    _come_richiesta("DELETE", "/api/v1/commerciale/preventivi/28")
    db.delete(db.get(Prev, 28))
    db.commit()
    assert db.query(Voce).count() == 0
    e = db.query(ElementoCestino).one()
    assert e.nome == "Preventivo: 003/2026" and e.righe == 3

    _come_richiesta("POST", "/api/v1/sicurezza/cestino/1/ripristina")
    cestino_auto.ripristina_voce(db.connection(), e.dati)
    db.commit()
    assert db.get(Prev, 28).numero == "003/2026"
    assert sorted(v.descrizione for v in db.query(Voce)) == ["Controsoffitto", "Pittura"]


def test_foto_tolta_dalla_lista_e_segnaposto():
    S = _sessione()
    db = S()
    db.add(Diario(id=5, foto=["a.jpg", "b.jpg"]))
    db.commit()

    _come_richiesta("DELETE", "/api/v1/cantieri/1/diari/5/foto")
    d = db.get(Diario, 5)
    d.foto = ["a.jpg"]
    db.add(Segnaposto(url="b.jpg"))
    db.commit()
    e = db.query(ElementoCestino).one()
    assert e.dati["ripristina_valori"][0]["valori"]["foto"] == ["a.jpg", "b.jpg"]
    assert e.dati["aggiunte"][0]["tabella"] == "foto_cantiere_eliminate"

    cestino_auto.ripristina_voce(db.connection(), e.dati)
    db.commit()
    db.expire_all()
    assert db.get(Diario, 5).foto == ["a.jpg", "b.jpg"]
    assert db.query(Segnaposto).count() == 0


def test_modifiche_normali_non_vanno_nel_cestino():
    S = _sessione()
    db = S()
    db.add(Prev(id=1, numero="1", voci=[Voce(id=1, descrizione="x")]))
    db.commit()
    _come_richiesta("PUT", "/api/v1/commerciale/preventivi/1")   # salvataggio che riscrive le voci
    db.delete(db.get(Voce, 1))
    db.commit()
    assert db.query(ElementoCestino).count() == 0
