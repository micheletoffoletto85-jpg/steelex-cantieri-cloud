"""Andamento annuale: acquisito per mese di accettazione, chiusi, costi, ore."""
import os
from datetime import date, datetime, timezone

os.environ.setdefault("DATABASE_URL", "postgresql://u:p@localhost:1/test")
os.environ.setdefault("SECRET_KEY", "x" * 40)

from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402

from app.models import utente, cantiere, diario, documento, economico, notifica, raccolta_docs, nota_campo, fornitore_rating, artigiano, non_conformita, notifica_inapp, rapportino, programmazione, assegnazione, sicurezza, ore_lavorate, chiusura, foto_cantiere, preventivo_artigiano, contabilita_misura  # noqa: F401,E402
from app.database import Base  # noqa: E402
from app.models.cantiere import Cantiere, StatoCantiere  # noqa: E402
from app.models.diario import OreExtra  # noqa: E402
from app.models.economico import Spesa  # noqa: E402
from app.routers.andamento import calcola_anno  # noqa: E402


def _db():
    eng = create_engine("sqlite://")
    Base.metadata.create_all(eng)
    return sessionmaker(bind=eng)()


def test_andamento_2026():
    db = _db()
    moro = Cantiere(id=42, nome="Moro", cliente="Nicola Moro", stato=StatoCantiere.in_corso, budget=2200, data_inizio=date(2026, 11, 25))
    vecchio = Cantiere(id=17, nome="Brunelli", cliente="B", stato=StatoCantiere.completato, budget=0)
    prova = Cantiere(id=24, nome="Prova", cliente="P", stato=StatoCantiere.archiviato, budget=3500)
    from app.models.utente import Utente
    db.add(Utente(id=1, nome="M", cognome="T", email="m@t.it", password_hash="x", ruolo="admin", attivo=True))
    db.add_all([moro, vecchio, prova])
    db.flush()
    db.add_all([
        OreExtra(cantiere_id=17, operaio_nome="A", ore=8, totale=240, data=date(2026, 7, 30)),
        OreExtra(cantiere_id=17, operaio_nome="A", ore=8, totale=240, data=date(2026, 8, 21)),
        OreExtra(cantiere_id=42, operaio_nome="M", ore=16, totale=480, data=date(2026, 11, 26)),
        Spesa(cantiere_id=42, descrizione="lastre", importo=300, data=date(2026, 11, 26)),
        Spesa(cantiere_id=24, descrizione="prova", importo=99, data=date(2026, 9, 1)),
    ])
    db.commit()

    r = calcola_anno(db, 2026)
    assert r["mesi"]["acquisito"][10] == 2200          # novembre: iniziato il 25/11
    assert r["mesi"]["cantieri_acquisiti"][6] == 1     # Brunelli: primo giorno di lavoro a luglio
    assert r["kpi"]["cantieri_senza_importo"] == 1
    assert r["mesi"]["chiusi"][7] == 1                 # chiuso ad agosto (ultimo giorno di lavoro)
    assert r["mesi"]["ore"][10] == 16 and r["kpi"]["ore"] == 32
    assert r["mesi"]["costi"][10] == 780
    assert all(c["id"] != 24 for c in r["cantieri"])   # l'archiviato non conta
    assert r["kpi"]["portafoglio"] == 2200
    assert r["preventivi"] is None
