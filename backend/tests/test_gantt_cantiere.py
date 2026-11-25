# Date e team del cantiere presi dal Gantt Operatori (proposta + conferma)
from datetime import date
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models import utente, cantiere, diario, documento, economico, notifica, raccolta_docs, nota_campo, fornitore_rating, artigiano, non_conformita, notifica_inapp, rapportino, programmazione, assegnazione  # noqa: F401
from app.database import Base
from app.models.cantiere import Cantiere, cantiere_artigiani
from app.models.utente import Utente
from app.models.artigiano import Artigiano
from app.models.assegnazione import AssegnazioneOperatore
from app.routers.cantieri import proposta_dal_gantt, applica_gantt


def _db():
    eng = create_engine("sqlite://")
    Base.metadata.create_all(eng, tables=[
        Utente.__table__, Cantiere.__table__, cantiere_artigiani,
        Artigiano.__table__, AssegnazioneOperatore.__table__,
    ])
    return sessionmaker(bind=eng)()


def _utente(db, nome, ruolo="artigiano"):
    u = Utente(nome=nome, cognome="X", email=f"{nome}@t.it", password_hash="x", ruolo=ruolo, attivo=True)
    db.add(u); db.flush()
    return u


def test_proposta_e_conferma():
    db = _db()
    mario = _utente(db, "mario")
    luca = _utente(db, "luca")
    cliente = _utente(db, "cli", "cliente")
    c = Cantiere(nome="Moro", cliente="Nicola Moro")
    c.artigiani.append(cliente)
    db.add(c); db.flush()
    # artigiano rubrica collegato a luca + uno senza account
    a_luca = Artigiano(nome="Luca", cognome="X", categoria="altro", utente_id=luca.id, attivo=True)
    a_senza = Artigiano(nome="Gino", cognome="Senza", categoria="altro", attivo=True)
    db.add_all([a_luca, a_senza]); db.flush()
    db.add_all([
        AssegnazioneOperatore(utente_id=mario.id, data=date(2026, 12, 3), turno="M", tipo="cantiere", cantiere_id=c.id),
        AssegnazioneOperatore(artigiano_id=a_luca.id, data=date(2026, 12, 1), turno="P", tipo="cantiere", cantiere_id=c.id),
        AssegnazioneOperatore(artigiano_id=a_senza.id, data=date(2026, 12, 10), turno="M", tipo="cantiere", cantiere_id=c.id),
        # ferie: non conta
        AssegnazioneOperatore(utente_id=mario.id, data=date(2026, 12, 20), turno="M", tipo="ferie"),
    ])
    db.commit()

    p = proposta_dal_gantt(db, c)
    assert p["data_inizio"] == "2026-12-01"
    assert p["data_fine"] == "2026-12-10"
    assert p["giornate"] == 3
    assert {u["nome"] for u in p["da_aggiungere"]} == {"mario", "luca"}
    assert p["senza_account"] == ["Gino Senza"]
    assert p["da_confermare"]

    r = applica_gantt(db, c)
    assert r["aggiunti"] == 2
    db.refresh(c)
    assert c.data_inizio == date(2026, 12, 1)
    assert c.data_fine_prevista == date(2026, 12, 10)
    # il cliente resta nel team
    assert {u.nome for u in c.artigiani} == {"cli", "mario", "luca"}
    # dopo la conferma non c'è più niente da confermare
    assert not proposta_dal_gantt(db, c)["da_confermare"]


def test_cantiere_senza_gantt():
    db = _db()
    c = Cantiere(nome="Vuoto", cliente="X")
    db.add(c); db.commit()
    p = proposta_dal_gantt(db, c)
    assert p["data_inizio"] is None and p["giornate"] == 0
    assert not p["da_confermare"]
