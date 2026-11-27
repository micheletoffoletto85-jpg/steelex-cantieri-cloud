# Margine previsionale: la manodopera si conta UNA volta (computo / Gantt / ore
# registrate, vale la più alta)
from datetime import date
from types import SimpleNamespace
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models import utente, cantiere, diario, documento, economico, notifica, raccolta_docs, nota_campo, fornitore_rating, artigiano, non_conformita, notifica_inapp, rapportino, programmazione, assegnazione  # noqa: F401
from app.database import Base
from app.models.cantiere import Cantiere
from app.models.utente import Utente
from app.models.artigiano import Artigiano
from app.models.assegnazione import AssegnazioneOperatore
from app.models.diario import OreExtra
from app.routers.economico import manodopera_prevista, manodopera_nel_computo, provvigione_perc, _calcola_riepilogo, _ore_per_turno


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


def test_gantt_solo_operatori_con_account():
    db = _db()
    mario = _utente(db, "mario", 30)
    c = Cantiere(nome="C", cliente="X"); altro = Cantiere(nome="A", cliente="Y")
    db.add_all([c, altro]); db.flush()
    esterno = Artigiano(nome="Ditta", cognome="Esterna", categoria="altro", attivo=True)
    db.add(esterno); db.flush()
    db.add_all([
        AssegnazioneOperatore(utente_id=mario.id, data=date(2026, 12, 1), turno="M", tipo="cantiere", cantiere_id=c.id),
        AssegnazioneOperatore(utente_id=mario.id, data=date(2026, 12, 1), turno="P", tipo="cantiere", cantiere_id=c.id),
        # ditta esterna senza account: pagata a preventivo, non a ore
        AssegnazioneOperatore(artigiano_id=esterno.id, data=date(2026, 12, 1), turno="M", tipo="cantiere", cantiere_id=c.id),
        AssegnazioneOperatore(utente_id=mario.id, data=date(2026, 12, 2), turno="M", tipo="cantiere", cantiere_id=altro.id),
        AssegnazioneOperatore(utente_id=mario.id, data=date(2026, 12, 3), turno="M", tipo="ferie"),
    ])
    db.commit()
    m = manodopera_prevista(db, c.id, [])
    assert m["ore_pianificate"] == 2 * _ore_per_turno()
    assert m["costo_pianificato"] == round(2 * _ore_per_turno() * 30, 2)


def test_ore_registrate_escluse_extra():
    db = _db()
    c = Cantiere(nome="C", cliente="X"); db.add(c); db.commit()
    ore = [
        OreExtra(cantiere_id=c.id, operaio_nome="A", ore=10, totale=300, data=date(2026, 12, 1)),
        OreExtra(cantiere_id=c.id, operaio_nome="B", ore=5, totale=150, data=date(2026, 12, 1), extra_preventivo=True),
    ]
    m = manodopera_prevista(db, c.id, ore)
    assert m["costo_registrato"] == 300 and m["ore_registrate"] == 10


def test_voci_manodopera_del_computo():
    voci = [{"categoria": "Materiali", "qt": 1, "totale_costo": 500},
            {"categoria": "Manodopera", "qt": 1, "totale_costo": 400}]
    assert manodopera_nel_computo(SimpleNamespace(), voci)["costo"] == 400
    assert provvigione_perc(None) == 0


def _computo(voci, sub, costo):
    return SimpleNamespace(tipo="base", stato="accettato", subtotale=sub, totale=sub * 1.22,
                           costo_totale=costo, voci=voci)


def test_manodopera_del_computo_sostituita_dal_gantt():
    """Il computo ha già 400 € di manodopera: se il Gantt ne prevede di più vale
    il Gantt (al posto, non in aggiunta); se ne prevede meno vale il computo."""
    db = _db()
    mario = _utente(db, "mario", 30)
    c = Cantiere(nome="C", cliente="X", budget=2000)
    db.add(c); db.flush()
    for g in (date(2026, 12, 1), date(2026, 12, 2)):
        for t in ("M", "P"):
            db.add(AssegnazioneOperatore(utente_id=mario.id, data=g, turno=t, tipo="cantiere", cantiere_id=c.id))
    db.commit(); db.refresh(c)
    voci = [{"categoria": "Materiali", "qt": 1, "totale_costo": 500, "totale_cliente": 1200},
            {"categoria": "Manodopera", "qt": 1, "totale_costo": 400, "totale_cliente": 800}]
    rv = _calcola_riepilogo(db, SimpleNamespace(ruolo="admin"), c, [_computo(voci, 2000, 900)], [], [], [], [])
    gantt = round(4 * _ore_per_turno() * 30, 2)
    assert rv.costo_materiali_previsto == 500
    assert rv.manodopera_prevista == max(gantt, 400)
    assert rv.costo_previsto_totale == round(500 + max(gantt, 400), 2)
    assert rv.provvigione_prevista == 0

    # senza Gantt: resta la manodopera del computo, niente doppio conteggio
    db2 = _db()
    c2 = Cantiere(nome="C2", cliente="X", budget=2000); db2.add(c2); db2.commit(); db2.refresh(c2)
    rv2 = _calcola_riepilogo(db2, SimpleNamespace(ruolo="admin"), c2, [_computo(voci, 2000, 900)], [], [], [], [])
    assert rv2.manodopera_prevista_fonte == "listino"
    assert rv2.costo_previsto_totale == 900
    assert rv2.margine_previsionale == 1100
