"""Controlli di accesso comuni.

- accesso_cantiere_da_path: dipendenza montata sui router del cantiere (main.py).
  Per ogni indirizzo che contiene {cantiere_id} verifica che l'utente possa
  vedere QUEL cantiere (admin/capo cantiere/amministrazione tutti, commerciale
  quelli che ha portato, gli altri solo se assegnati nel Team). Prima molte
  sezioni (diario, ore, chiusura…) non lo controllavano: bastava cambiare il
  numero nell'indirizzo per leggere un altro cantiere.
- solo_ruoli: alza 403 se il ruolo non è tra quelli ammessi.
"""
from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models.utente import Utente

# Staff interno FR: vede costi, tariffe, catalogo prezzi
RUOLI_INTERNI = {"admin", "amministrazione", "capo_cantiere"}
# Chi usa la rubrica artigiani/fornitori (come il menu "Rubrica") + commerciale
RUOLI_RUBRICA = {"admin", "amministrazione", "capo_cantiere", "capo_cantiere_sub", "direzione_lavori"}


def ruolo(user: Utente) -> str:
    r = user.ruolo
    return getattr(r, "value", None) or str(r).split(".")[-1]


def solo_ruoli(user: Utente, ammessi, messaggio: str = "Non autorizzato"):
    if ruolo(user) not in ammessi:
        raise HTTPException(403, messaggio)


def verifica_cantiere(db: Session, cantiere_id: int, user: Utente):
    from app.models.cantiere import Cantiere
    from app.routers.cantieri import _check_accesso
    c = db.query(Cantiere).filter(Cantiere.id == cantiere_id).first()
    if not c:
        raise HTTPException(404, "Cantiere non trovato")
    _check_accesso(c, user)
    return c


# Sezioni del cantiere che l'app non mostra a clienti e fornitori: chiuse anche
# lato server (team con telefoni ed email, foto, diario, ore, chiusura, misure…).
_SEZIONI_NEGATE = {
    "cliente": {"team", "artigiani", "foto", "diari", "ore-extra", "chiusura", "misure", "materiali",
                "note-campo", "economia", "spese", "ordini", "bolle", "fatture", "preventivi-artigiani"},
    "fornitore": {"team", "artigiani", "foto", "diari", "ore-extra", "chiusura", "misure", "materiali",
                  "economia", "spese", "ordini", "fatture", "preventivi-artigiani"},
}


def accesso_cantiere_da_path(request: Request, db: Session = Depends(get_db),
                             user: Utente = Depends(get_current_user)):
    cid = request.path_params.get("cantiere_id")
    if cid is None:
        return
    try:
        cid = int(cid)
    except (TypeError, ValueError):
        raise HTTPException(422, "Cantiere non valido")
    verifica_cantiere(db, cid, user)
    negate = _SEZIONI_NEGATE.get(ruolo(user))
    if negate:
        parti = request.url.path.split("/")
        try:
            sezione = parti[parti.index(str(cid)) + 1]
        except (ValueError, IndexError):
            sezione = ""
        if sezione in negate:
            raise HTTPException(403, "Sezione non disponibile per il tuo profilo")
