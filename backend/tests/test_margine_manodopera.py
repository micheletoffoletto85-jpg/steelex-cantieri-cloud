# Margine previsionale: la manodopera (Gantt Operatori / ore registrate) va tolta
from datetime import date
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models import utente, cantiere, diario, documento, economico, notifica, raccolta_docs, nota_campo, fornitore_rating, artigiano, non_conformita, notifica_inapp, rapportino, programmazione, assegnazione  # noqa: F401
from app.database import Base
from app.models.cantiere import Cantiere
from app.models.utente import Utente
from app.models.artigiano import Artigiano
from app.models.assegnazione import AssegnazioneOperatore
from app.models.diario import OreExtra
from app.routers.economico import manodopera_prevista


def _db():
    eng = create_engine("sqlite://")
    Base.metadata.create_all(eng, tables=[
        Utente.__table__, Cantiere.__table__, Artigiano.__table__,
        AssegnazioneOperatore.__table__,
    ])
    return sessionmaker(bind=eng)()


def _utente(db, nome, costo=None):
    u = Utente(nome=nome, cognome="X", email=f"{nome}@t.it", password_hash="x",
               ruolo="artigiano", attivo=True, costo_orario=costo)
    db.add(u); db.flush()
    return u


def test_manodopera_dal_gantt():
    db = _db()
    mario = _utente(db, "mario", 30)
    luca = _utente(db, "luca", 40)
    c = Cantiere(nome="Moro", cliente="Nicola Moro")
    altro = Cantiere(nome="Altro", cliente="Y")
    db.add_all([c, altro]); db.flush()
    a_luca = Artigiano(nome="Luca", cognome="X", categoria="altro", utente_id=luca.id, attivo=True)
    a_senza = Artigiano(nome="Gino", cognome="Senza", categoria="altro", attivo=True)
    db.add_all([a_luca, a_senza]); db.flush()
    db.add_all([
        # mario: giornata intera = 8h × 30
        AssegnazioneOperatore(utente_id=mario.id, data=date(2026, 12, 1), turno="M", tipo="cantiere", cantiere_id=c.id),
        AssegnazioneOperatore(utente_id=mario.id, data=date(2026, 12, 1), turno="P", tipo="cantiere", cantiere_id=c.id),
        # luca via rubrica: 4h × 40
        AssegnazioneOperatore(artigiano_id=a_luca.id, data=date(2026, 12, 2), turno="M", tipo="cantiere", cantiere_id=c.id),
        # artigiano senza account: tariffa di default
        AssegnazioneOperatore(artigiano_id=a_senza.id, data=date(2026, 12, 2), turno="P", tipo="cantiere", cantiere_id=c.id),
        # non contano: altro cantiere, ferie
        AssegnazioneOperatore(utente_id=mario.id, data=date(2026, 12, 3), turno="M", tipo="cantiere", cantiere_id=altro.id),
        AssegnazioneOperatore(utente_id=luca.id, data=date(2026, 12, 4), turno="M", tipo="ferie"),
    ])
    db.commit()

    from app.config import settings
    default = settings.COSTO_ORARIO_DEFAULT
    m = manodopera_prevista(db, c.id, [])
    assert m["ore_pianificate"] == 16
    assert m["costo_pianificato"] == round(8 * 30 + 4 * 40 + 4 * default, 2)
    assert m["fonte"] == "gantt"
    assert m["costo"] == m["costo_pianificato"]


def test_ore_registrate_superano_il_gantt():
    db = _db()
    c = Cantiere(nome="Moro", cliente="X")
    db.add(c); db.commit()
    ore = [
        OreExtra(cantiere_id=c.id, operaio_nome="A", ore=10, totale=300, data=date(2026, 12, 1)),
        # extra preventivo: ha un ricavo a parte, non entra nel previsionale
        OreExtra(cantiere_id=c.id, operaio_nome="B", ore=5, totale=150, data=date(2026, 12, 1), extra_preventivo=True),
    ]
    m = manodopera_prevista(db, c.id, ore)
    assert m["fonte"] == "ore_registrate"
    assert m["costo"] == 300
    assert m["ore_registrate"] == 10


def test_nessuna_manodopera():
    db = _db()
    c = Cantiere(nome="Vuoto", cliente="X")
    db.add(c); db.commit()
    m = manodopera_prevista(db, c.id, [])
    assert m["fonte"] == "nessuna" and m["costo"] == 0
