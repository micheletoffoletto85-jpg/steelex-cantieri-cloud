"""Registro attività ("diario di bordo"): ogni modifica fatta nell'app
(creazioni, modifiche, eliminazioni) viene annotata con chi, quando e cosa.
Le sole letture non si registrano. Il corpo delle richieste NON si salva
(niente password o dati personali nel registro)."""
import re
import threading

from jose import jwt

from app.config import settings
from app.database import SessionLocal

_METODI = {"POST", "PUT", "PATCH", "DELETE"}
# rumore che non serve nel diario di bordo
_SALTA = re.compile(r"^/api/v1/(auth/refresh|notifiche/(push|subscribe|sottoscrivi)|error-log)")
_NOMI: dict[int, str] = {}
_lock = threading.Lock()

_VERBI = {"POST": "Aggiunto", "PUT": "Modificato", "PATCH": "Modificato", "DELETE": "Eliminato"}

# (metodo, regex sul percorso senza /api/v1) → descrizione leggibile
_REGOLE = [
    ("POST", r"^/auth/login", "Accesso all'app"),
    ("DELETE", r"^/cantieri/\d+$", "ELIMINATO IL CANTIERE (finito nel cestino)"),
    ("POST", r"^/cantieri$", "Creato un cantiere"),
    ("PUT", r"^/cantieri/\d+$", "Modificata la scheda cantiere"),
    ("POST", r"^/sicurezza/cestino/\d+/ripristina", "Ripristinato dal cestino"),
    ("POST", r"^/commerciale/preventivi/\d+/stato", "Cambiato lo stato del preventivo"),
    ("POST", r"^/commerciale/preventivi/importa$", "Caricato un preventivo fatto fuori dall'app"),
    ("DELETE", r"^/commerciale/preventivi/\d+$", "Eliminato un preventivo"),
    (None, r"^/assegnazioni", "Gantt Operatori"),
    (None, r"^/rapportini", "Rapportini"),
    (None, r"/diari", "Diario di cantiere"),
    (None, r"/foto", "Foto"),
    (None, r"/documenti|/archivio", "Documenti"),
    (None, r"^/utenti", "Utenti"),
    (None, r"/preventivi-artigiani", "Preventivi artigiani"),
    (None, r"^/commerciale/preventivi", "Preventivo commerciale"),
    (None, r"^/commerciale/listino", "Listino"),
    (None, r"/sal|/fatture|/ordini|/spese|/economia|/contabilita", "Economia"),
    (None, r"/misure", "Misure"),
]


def descrivi(metodo: str, percorso: str) -> str:
    p = percorso[len("/api/v1"):] if percorso.startswith("/api/v1") else percorso
    for m, rx, testo in _REGOLE:
        if re.search(rx, p) and (m is None or m == metodo):
            return testo if m else f"{_VERBI.get(metodo, metodo)} · {testo}"
    pezzi = [x for x in p.strip("/").split("/") if x and not x.isdigit()]
    return f"{_VERBI.get(metodo, metodo)} · {' / '.join(pezzi[:3]) or p}"


def _utente_da_token(header: str):
    if not header or not header.lower().startswith("bearer "):
        return None
    try:
        dati = jwt.decode(header[7:], settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        return int(dati.get("sub")) if dati.get("type") == "access" else None
    except Exception:
        return None


def _cantiere(p: str):
    m = re.search(r"/cantieri/(\d+)", p)
    return int(m.group(1)) if m else None


def da_registrare(metodo: str, percorso: str) -> bool:
    return metodo in _METODI and percorso.startswith("/api/v1/") and not _SALTA.match(percorso)


def annota(metodo: str, percorso: str, esito: int, auth_header: str, ip: str):
    """Scrive una riga nel registro. Gira fuori dalla richiesta: se fallisce non
    disturba nessuno."""
    from app.models.sicurezza import RegistroAttivita
    from app.models.utente import Utente
    db = SessionLocal()
    try:
        uid = _utente_da_token(auth_header)
        nome = None
        if uid:
            with _lock:
                nome = _NOMI.get(uid)
            if nome is None:
                u = db.query(Utente).filter(Utente.id == uid).first()
                nome = f"{u.nome} {u.cognome}".strip() if u else f"utente {uid}"
                with _lock:
                    _NOMI[uid] = nome
        db.add(RegistroAttivita(
            utente_id=uid, utente_nome=nome, metodo=metodo, percorso=percorso[:400], esito=esito,
            descrizione=descrivi(metodo, percorso)[:400], cantiere_id=_cantiere(percorso), ip=(ip or "")[:64]))
        db.commit()
    except Exception as e:  # il registro non deve mai far cadere l'app
        print(f"[REGISTRO] non annotato: {e}", flush=True)
        db.rollback()
    finally:
        db.close()
