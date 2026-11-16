# Una foto del diario eliminata dal Tab Foto non deve ricomparire al riallineamento
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models import utente, cantiere, diario, documento, economico, notifica, raccolta_docs, nota_campo, fornitore_rating, artigiano, non_conformita, notifica_inapp, rapportino, programmazione, assegnazione  # noqa: F401 — registra tutti i modelli
from app.database import Base
from app.models.foto_cantiere import FotoCantiere, FotoCantiereEliminata
from app.routers.diari import _sync_foto_archivio


def _sessione():
    eng = create_engine("sqlite://")
    Base.metadata.create_all(eng, tables=[FotoCantiere.__table__, FotoCantiereEliminata.__table__])
    return sessionmaker(bind=eng)()


def test_foto_eliminata_non_ricompare():
    db = _sessione()
    urls = ["https://r2/foto/1/a.jpg", "https://r2/foto/1/b.jpg"]
    assert _sync_foto_archivio(db, 1, urls) == 2
    db.commit()
    # eliminazione come fa l'endpoint DELETE
    f = db.query(FotoCantiere).filter(FotoCantiere.url == urls[0]).first()
    db.add(FotoCantiereEliminata(cantiere_id=1, url=f.url))
    db.delete(f)
    db.commit()
    # ricarico: il riallineamento non la ricrea
    assert _sync_foto_archivio(db, 1, urls) == 0
    assert [u for (u,) in db.query(FotoCantiere.url).all()] == [urls[1]]
    # lo stesso url su un altro cantiere resta indipendente
    assert _sync_foto_archivio(db, 2, urls[:1]) == 1
