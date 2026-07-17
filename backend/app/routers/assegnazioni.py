from datetime import date, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.database import get_db
from app.models.assegnazione import AssegnazioneOperatore
from app.models.artigiano import Artigiano
from app.models.cantiere import Cantiere
from app.models.utente import Utente
from app.auth import get_current_user

router = APIRouter(prefix="/assegnazioni", tags=["Assegnazioni"])

RUOLI_ADMIN = {"admin", "capo_cantiere", "capo_cantiere_sub", "amministrazione", "direzione_lavori"}
RUOLI_OPERATIVI = {"artigiano", "capo_cantiere", "capo_cantiere_sub"}

# Programmazione libera: attività fuori cantiere
TIPI_ASSEGNAZIONE = {"cantiere", "ferie", "corso", "permesso", "altro"}


def _dict(a: AssegnazioneOperatore) -> dict:
    if a.artigiano_id:
        nome = f"{a.artigiano.nome} {a.artigiano.cognome}" if a.artigiano else None
    elif a.utente_id:
        nome = f"{a.utente.nome} {a.utente.cognome}" if a.utente else None
    else:
        nome = None
    return {
        "id": a.id,
        "artigiano_id": a.artigiano_id,
        "utente_id": a.utente_id,
        "nome": nome,
        "data": a.data.isoformat() if a.data else None,
        "turno": a.turno,
        "tipo": a.tipo or "cantiere",
        "cantiere_id": a.cantiere_id,
        "cantiere_nome": a.cantiere.nome if a.cantiere else None,
        "lavorazione": a.lavorazione,
        "note": a.note,
    }


@router.get("/operatori")
def lista_operatori(
    db: Session = Depends(get_db),
    user: Utente = Depends(get_current_user),
):
    """Lista unificata: artigiani attivi + utenti operativi interni."""
    if user.ruolo not in RUOLI_ADMIN:
        raise HTTPException(403)

    artigiani = (
        db.query(Artigiano)
        .filter(Artigiano.attivo == True)
        .order_by(Artigiano.cognome, Artigiano.nome)
        .all()
    )
    # ID utenti già presenti in rubrica artigiani → non duplicare
    utenti_in_rubrica = {a.utente_id for a in artigiani if a.utente_id}
    utenti_op = (
        db.query(Utente)
        .filter(
            Utente.ruolo.in_(list(RUOLI_OPERATIVI)),
            Utente.attivo == True,
            ~Utente.id.in_(utenti_in_rubrica) if utenti_in_rubrica else True,
        )
        .order_by(Utente.cognome, Utente.nome)
        .all()
    )

    result = []
    for a in artigiani:
        result.append({
            "tipo": "artigiano",
            "id": a.id,
            "nome": f"{a.nome} {a.cognome}",
            "azienda": a.azienda,
            "categoria": a.categoria,
        })
    for u in utenti_op:
        result.append({
            "tipo": "utente",
            "id": u.id,
            "nome": f"{u.nome} {u.cognome}",
            "azienda": None,
            "categoria": u.ruolo.replace("_", " "),
        })
    return result


@router.get("")
def lista_assegnazioni(
    anno: Optional[int] = None,
    mese: Optional[int] = None,
    data_inizio: Optional[date] = None,
    data_fine: Optional[date] = None,
    db: Session = Depends(get_db),
    user: Utente = Depends(get_current_user),
):
    if user.ruolo not in RUOLI_ADMIN:
        raise HTTPException(403)
    if data_inizio and data_fine:
        primo, ultimo = data_inizio, data_fine
    elif anno and mese:
        from calendar import monthrange
        primo = date(anno, mese, 1)
        ultimo = date(anno, mese, monthrange(anno, mese)[1])
    else:
        raise HTTPException(422, "Specificare anno+mese oppure data_inizio+data_fine")
    rows = (
        db.query(AssegnazioneOperatore)
        .filter(AssegnazioneOperatore.data >= primo, AssegnazioneOperatore.data <= ultimo)
        .all()
    )
    return [_dict(r) for r in rows]


class AssegnazioneBody(BaseModel):
    artigiano_id: Optional[int] = None
    utente_id: Optional[int] = None
    data: date
    turno: str
    tipo: Optional[str] = "cantiere"
    cantiere_id: Optional[int] = None
    lavorazione: Optional[str] = None
    note: Optional[str] = None


@router.put("")
def upsert_assegnazione(
    body: AssegnazioneBody,
    db: Session = Depends(get_db),
    user: Utente = Depends(get_current_user),
):
    if user.ruolo not in RUOLI_ADMIN:
        raise HTTPException(403)
    if body.turno not in ("M", "P"):
        raise HTTPException(422, "turno deve essere 'M' o 'P'")
    if not body.artigiano_id and not body.utente_id:
        raise HTTPException(422, "artigiano_id o utente_id obbligatorio")
    tipo = body.tipo or "cantiere"
    if tipo not in TIPI_ASSEGNAZIONE:
        raise HTTPException(422, f"tipo deve essere uno di: {', '.join(sorted(TIPI_ASSEGNAZIONE))}")

    q = db.query(AssegnazioneOperatore).filter(
        AssegnazioneOperatore.data == body.data,
        AssegnazioneOperatore.turno == body.turno,
    )
    if body.artigiano_id:
        q = q.filter(AssegnazioneOperatore.artigiano_id == body.artigiano_id)
    else:
        q = q.filter(AssegnazioneOperatore.utente_id == body.utente_id)

    existing = q.first()

    # Una cella "vuota" è tipo cantiere senza cantiere né lavorazione né note;
    # le attività libere (ferie, corso...) restano valide anche senza cantiere
    vuota = tipo == "cantiere" and body.cantiere_id is None and body.lavorazione is None and body.note is None

    if existing:
        if vuota:
            db.delete(existing)
            db.commit()
            return {"deleted": True}
        existing.tipo = tipo
        existing.cantiere_id = body.cantiere_id if tipo == "cantiere" else None
        existing.lavorazione = body.lavorazione
        existing.note = body.note
        db.commit()
        db.refresh(existing)
        return _dict(existing)
    else:
        if vuota:
            return {"noop": True}
        row = AssegnazioneOperatore(
            artigiano_id=body.artigiano_id,
            utente_id=body.utente_id,
            data=body.data,
            turno=body.turno,
            tipo=tipo,
            cantiere_id=body.cantiere_id if tipo == "cantiere" else None,
            lavorazione=body.lavorazione,
            note=body.note,
            creato_da=user.id,
        )
        db.add(row)
        db.commit()
        db.refresh(row)
        return _dict(row)


GIORNI_LABEL = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"]
TIPI_LIBERI_LABEL = {"ferie": "Ferie", "corso": "Corso", "permesso": "Permesso", "altro": "Fuori cantiere"}


class PubblicaBody(BaseModel):
    anno: int
    settimana: int


@router.post("/pubblica-settimana")
def pubblica_settimana(
    body: PubblicaBody,
    db: Session = Depends(get_db),
    user: Utente = Depends(get_current_user),
):
    """Notifica a ogni operatore il suo programma della settimana, letto dal Gantt.

    Gli artigiani della rubrica senza account collegato non possono ricevere
    notifiche: il loro numero è riportato in `senza_account`.
    """
    if user.ruolo not in RUOLI_ADMIN:
        raise HTTPException(403)
    try:
        lunedi = date.fromisocalendar(body.anno, body.settimana, 1)
    except ValueError:
        raise HTTPException(422, "Settimana non valida")

    rows = (
        db.query(AssegnazioneOperatore)
        .filter(
            AssegnazioneOperatore.data >= lunedi,
            AssegnazioneOperatore.data <= lunedi + timedelta(days=6),
        )
        .all()
    )
    if not rows:
        raise HTTPException(404, "Nessuna assegnazione in questa settimana")

    # Risolve l'account utente di ogni assegnazione (diretto o via rubrica artigiani)
    artigiano_ids = {r.artigiano_id for r in rows if r.artigiano_id}
    link_utente = {}
    if artigiano_ids:
        for a in db.query(Artigiano).filter(Artigiano.id.in_(artigiano_ids)).all():
            if a.utente_id:
                link_utente[a.id] = a.utente_id

    per_utente = {}      # uid -> {data -> {turno -> testo}}
    senza_account = set()
    for r in rows:
        uid = r.utente_id or link_utente.get(r.artigiano_id)
        if not uid:
            if r.artigiano_id:
                senza_account.add(r.artigiano_id)
            continue
        dove = r.cantiere.nome if r.cantiere else TIPI_LIBERI_LABEL.get(r.tipo or "cantiere", "—")
        testo = dove + (f" ({r.lavorazione})" if r.lavorazione else "")
        per_utente.setdefault(uid, {}).setdefault(r.data, {})[r.turno] = testo

    from app.routers.notifiche import invia_notifica
    notificati = 0
    for uid, giorni in per_utente.items():
        righe = []
        for d in sorted(giorni):
            turni = giorni[d]
            label = GIORNI_LABEL[d.isoweekday() - 1]
            if "M" in turni and "P" in turni and turni["M"] != turni["P"]:
                righe.append(f"{label}: M {turni['M']} · P {turni['P']}")
            else:
                righe.append(f"{label}: {turni.get('M') or turni.get('P')}")
        corpo = f"Settimana {body.settimana}:\n" + "\n".join(righe)
        invia_notifica(db, [uid], "📅 Programma settimana", corpo, "/")
        notificati += 1

    return {"ok": True, "notificati": notificati, "senza_account": len(senza_account)}


@router.delete("/{ass_id}")
def elimina_assegnazione(
    ass_id: int,
    db: Session = Depends(get_db),
    user: Utente = Depends(get_current_user),
):
    if user.ruolo not in RUOLI_ADMIN:
        raise HTTPException(403)
    row = db.query(AssegnazioneOperatore).filter(AssegnazioneOperatore.id == ass_id).first()
    if not row:
        raise HTTPException(404)
    db.delete(row)
    db.commit()
    return {"ok": True}
