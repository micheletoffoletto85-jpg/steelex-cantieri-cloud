"""Programma settimanale personale.

La programmazione operativa si fa SOLO nel Gantt Operatori (router assegnazioni):
questo router espone la scheda personale /mia che ogni account legge in dashboard.
La vecchia pagina di compilazione manuale è stata rimossa (2026-07-17); la tabella
programmazione_settimana resta come ripiego di sola lettura per le settimane storiche.
"""
from datetime import date, timedelta
from typing import Optional
from fastapi import APIRouter, Depends
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.programmazione import ProgrammazioneSettimana
from app.models.assegnazione import AssegnazioneOperatore
from app.models.artigiano import Artigiano
from app.models.utente import Utente
from app.models.cantiere import Cantiere
from app.auth import get_current_user

router = APIRouter(prefix="/programmazione", tags=["Programmazione"])

GIORNI_ORDINE = ["lun", "mar", "mer", "gio", "ven", "sab", "dom"]

TIPI_LIBERI_LABEL = {"ferie": "Ferie", "corso": "Corso", "permesso": "Permesso", "altro": "Fuori cantiere"}


def _settimana_corrente():
    iso = date.today().isocalendar()
    return iso[0], iso[1]   # anno, settimana


def _prog_dict(p: ProgrammazioneSettimana, db: Session) -> dict:
    giorni_out = {}
    for g, info in (p.giorni or {}).items():
        cantiere_nome = None
        if info.get("cantiere_id"):
            c = db.query(Cantiere).filter(Cantiere.id == info["cantiere_id"]).first()
            cantiere_nome = c.nome if c else None
        giorni_out[g] = {
            "cantiere_id": info.get("cantiere_id"),
            "cantiere_nome": cantiere_nome or info.get("cantiere_nome"),
            "lavorazione": info.get("lavorazione"),
            "note": info.get("note"),
        }
    return {
        "id": p.id,
        "operativo_id": p.operativo_id,
        "operativo_nome": f"{p.operativo.nome} {p.operativo.cognome}" if p.operativo else None,
        "anno": p.anno,
        "settimana": p.settimana,
        "notificato_il": p.notificato_il.isoformat() if getattr(p, 'notificato_il', None) else None,
        "giorni": giorni_out,
        "aggiornato_il": p.aggiornato_il.isoformat() if p.aggiornato_il else None,
    }


def _ass_info(a: AssegnazioneOperatore) -> dict:
    tipo = a.tipo or "cantiere"
    return {
        "tipo": tipo,
        "cantiere_id": a.cantiere_id,
        # Per le attività libere l'etichetta del tipo prende il posto del cantiere
        "cantiere_nome": a.cantiere.nome if a.cantiere else TIPI_LIBERI_LABEL.get(tipo),
        "lavorazione": a.lavorazione,
        "note": a.note,
    }


@router.get("/mia")
def mia_programmazione(
    anno: Optional[int] = None,
    settimana: Optional[int] = None,
    db: Session = Depends(get_db),
    user: Utente = Depends(get_current_user),
):
    """Programma settimanale personale.

    Fonte primaria: le assegnazioni del Gantt Operatori (turni M/P).
    Ripiego: la programmazione manuale storica, per i giorni senza assegnazioni.
    """
    if not anno or not settimana:
        anno, settimana = _settimana_corrente()

    # Programmazione manuale (base di partenza, se esiste)
    prog = db.query(ProgrammazioneSettimana).filter(
        ProgrammazioneSettimana.operativo_id == user.id,
        ProgrammazioneSettimana.anno == anno,
        ProgrammazioneSettimana.settimana == settimana,
    ).first()
    giorni_out = _prog_dict(prog, db)["giorni"] if prog else {}

    # Assegnazioni Gantt: l'account può essere un utente interno
    # o collegato a una scheda della rubrica artigiani
    lunedi = date.fromisocalendar(anno, settimana, 1)
    artigiano_ids = [
        a.id for a in db.query(Artigiano).filter(Artigiano.utente_id == user.id).all()
    ]
    condizioni = [AssegnazioneOperatore.utente_id == user.id]
    if artigiano_ids:
        condizioni.append(AssegnazioneOperatore.artigiano_id.in_(artigiano_ids))
    assegnazioni = (
        db.query(AssegnazioneOperatore)
        .filter(
            AssegnazioneOperatore.data >= lunedi,
            AssegnazioneOperatore.data <= lunedi + timedelta(days=6),
            or_(*condizioni),
        )
        .all()
    )

    # Le assegnazioni Gantt sovrascrivono il giorno corrispondente
    for a in assegnazioni:
        giorno = GIORNI_ORDINE[a.data.isoweekday() - 1]
        info = giorni_out.get(giorno) or {}
        if info.get("fonte") != "gantt":
            info = {"fonte": "gantt", "turni": {}}
        info["turni"][a.turno] = _ass_info(a)
        # Campi piatti retro-compatibili: mattina se c'è, altrimenti pomeriggio
        principale = info["turni"].get("M") or info["turni"].get("P")
        info.update(principale)
        giorni_out[giorno] = info

    if not giorni_out:
        return None

    return {
        "id": prog.id if prog else None,
        "operativo_id": user.id,
        "operativo_nome": f"{user.nome} {user.cognome}",
        "anno": anno,
        "settimana": settimana,
        "notificato_il": prog.notificato_il.isoformat() if prog and getattr(prog, "notificato_il", None) else None,
        "giorni": giorni_out,
        "aggiornato_il": prog.aggiornato_il.isoformat() if prog and prog.aggiornato_il else None,
    }
