"""Rapportini: luoghi generici (corso, magazzino…) mai abbinati a un cantiere per
l'indirizzo, spostamento fuori cantiere da qualsiasi stato, ritocchi su cantieri conclusi."""
import os

os.environ.setdefault("DATABASE_URL", "postgresql://u:p@localhost:1/test")
os.environ.setdefault("SECRET_KEY", "x" * 40)

from types import SimpleNamespace as NS  # noqa: E402

import pytest  # noqa: E402
from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402

from app.routers import rapportini as R  # noqa: E402

CONDOMINIO = NS(id=2, nome="Condominio maria", indirizzo="Corso felice e fortunato 79")
MOSSANO = NS(id=7, nome="Mossano", indirizzo="via degli alpini")


@pytest.mark.parametrize("luogo", ["corso", "Corso", "magazzino", "ufficio", "trasferta", "corso formazione"])
def test_luoghi_generici_restano_fuori_cantiere(luogo):
    assert R._match_cantiere(luogo, [CONDOMINIO, MOSSANO]) is None


def test_indirizzo_vale_solo_per_la_parte_che_identifica():
    assert R._match_cantiere("corso felice", [CONDOMINIO, MOSSANO]) == 2
    assert R._match_cantiere("via degli alpini", [CONDOMINIO, MOSSANO]) == 7
    assert R._match_cantiere("via", [CONDOMINIO, MOSSANO]) is None
    # il nome continua a funzionare come prima
    assert R._match_cantiere("condominio maria", [CONDOMINIO, MOSSANO]) == 2
    assert R._match_cantiere("Mosano", [CONDOMINIO, MOSSANO]) == 7


# ── Spostamento fuori cantiere e ritocchi (DB in memoria) ─────────────────────

@pytest.fixture()
def db():
    import importlib, pkgutil
    import app.models
    from app.database import Base
    for m in pkgutil.iter_modules(app.models.__path__):   # registra tutte le tabelle
        importlib.import_module(f"app.models.{m.name}")
    eng = create_engine("sqlite://")
    try:
        Base.metadata.create_all(eng)
    except Exception as e:  # schema con tipi solo-Postgres
        pytest.skip(f"schema non creabile su sqlite: {e}")
    s = sessionmaker(bind=eng)()
    yield s
    s.close()


def _setup(db):
    from app.models.utente import Utente
    from app.models.cantiere import Cantiere
    admin = Utente(id=1, nome="Admin", cognome="STX", email="a@x.it", ruolo="admin", password_hash="x")
    op = Utente(id=5, nome="Marco", cognome="Milella", email="m@x.it", ruolo="artigiano", password_hash="x")
    aperto = Cantiere(id=2, nome="Condominio maria", cliente="Condominio", indirizzo="Corso felice e fortunato 79", stato="in_corso")
    chiuso = Cantiere(id=6, nome="Cortese", cliente="Cortese", stato="completato")
    db.add_all([admin, op, aperto, chiuso])
    db.commit()
    return admin


def _rapportino(db, **kw):
    from app.models.rapportino import RapportinoOperativo
    r = RapportinoOperativo(operativo_id=5, data_lavoro="2026-11-18", ore_lavorate=8,
                            descrizione_lavori="Corso presso 626 Service", riassunto="Corso 626",
                            stato="inviato", **kw)
    db.add(r)
    db.commit()
    return r


def test_validato_sul_cantiere_sbagliato_si_sposta_fuori(db):
    from app.models.diario import DiarioGiornaliero, OreExtra
    from app.models.ore_lavorate import OreLavorate
    admin = _setup(db)
    r = _rapportino(db, cantiere_id=2, fuori_cantiere=False)
    R._esegui_validazione(db, r, 2, admin)
    db.commit()
    assert r.diario_id and db.query(OreExtra).filter(OreExtra.cantiere_id == 2).count() > 0

    out = R.assegna_cantiere_rapportino(r.id, R.AssegnaBody(cantiere_id=None), db=db, user=admin)
    assert out["fuori_cantiere"] is True and out["cantiere_id"] is None
    assert db.query(DiarioGiornaliero).filter(DiarioGiornaliero.cantiere_id == 2).count() == 0
    assert db.query(OreExtra).filter(OreExtra.cantiere_id == 2).count() == 0
    # le ore restano nel registro personale, senza cantiere
    righe = db.query(OreLavorate).filter(OreLavorate.rapportino_id == r.id).all()
    assert righe and float(righe[0].ore) == 8


def test_da_validare_si_valida_fuori_cantiere(db):
    admin = _setup(db)
    r = _rapportino(db, cantiere_id=2, fuori_cantiere=False)
    out = R.valida_rapportino(r.id, R.ValidaBody(fuori_cantiere=True), db=db, user=admin)
    assert out["stato"] == "validato" and out["cantiere_id"] is None and out["fuori_cantiere"] is True


def test_ritocco_su_cantiere_concluso(db):
    from app.models.diario import DiarioGiornaliero
    admin = _setup(db)
    r = _rapportino(db, cantiere_id=None, fuori_cantiere=True)
    out = R.assegna_cantiere_rapportino(r.id, R.AssegnaBody(cantiere_id=6), db=db, user=admin)
    assert out["ritocco"] is True
    R._esegui_validazione(db, r, 6, admin)
    db.commit()
    d = db.query(DiarioGiornaliero).filter(DiarioGiornaliero.id == r.diario_id).first()
    assert d.cantiere_id == 6
    assert "Ritocco su cantiere concluso" in (d.attivita or "")
    assert [c["id"] for c in R.lista_cantieri_conclusi(db=db, user=admin)] == [6]
