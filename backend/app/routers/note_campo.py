"""
Note di campo: artigiani/fornitori inseriscono note → capocantiere valida e pubblica.
Le voci di spesa identificate possono essere inserite in economia una sola volta.
"""
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel
from app.database import get_db
from app.models.nota_campo import NotaCampo, StatoNota
from app.models.cantiere import Cantiere
from app.models.utente import Utente, RuoloUtente
from app.models.economico import Spesa, CategoriaSpesa
from app.auth import get_current_user

router = APIRouter(prefix="/cantieri", tags=["Note Campo"])

_RUOLI_VALIDA = (RuoloUtente.admin, RuoloUtente.capo_cantiere, RuoloUtente.amministrazione)
_RUOLI_INSERISCE = (RuoloUtente.artigiano, RuoloUtente.fornitore, RuoloUtente.capo_cantiere_sub)


def _check_accesso(cantiere_id: int, db: Session, user: Utente) -> Cantiere:
    c = db.query(Cantiere).filter(Cantiere.id == cantiere_id).first()
    if not c:
        raise HTTPException(404, "Cantiere non trovato")
    if user.ruolo == RuoloUtente.admin:
        return c
    if user.ruolo == RuoloUtente.capo_cantiere and c.responsabile_id == user.id:
        return c
    if user.id in [u.id for u in c.artigiani]:
        return c
    raise HTTPException(403, "Accesso negato al cantiere")


class VoceSpesa(BaseModel):
    descrizione: str
    quantita: Optional[float] = None
    unita: Optional[str] = None
    importo: Optional[float] = None


class NotaCampoCreate(BaseModel):
    testo: str
    voci_spesa: Optional[List[VoceSpesa]] = []


class NotaCampoOut(BaseModel):
    id: int
    cantiere_id: int
    autore_id: int
    autore_nome: Optional[str] = None
    testo: str
    stato: str
    voci_spesa: Optional[list] = []
    spesa_inserita: bool
    spesa_id: Optional[int] = None
    validato_da: Optional[int] = None
    validato_il: Optional[datetime] = None
    note_validazione: Optional[str] = None
    creato_il: Optional[datetime] = None

    class Config:
        from_attributes = True


class ValidaBody(BaseModel):
    stato: str  # "validata" o "pubblicata" o "bozza" (rifiuto)
    note_validazione: Optional[str] = None


class InserisciSpesaBody(BaseModel):
    descrizione: str
    importo: float
    data: Optional[str] = None
    voce_index: Optional[int] = None  # indice in voci_spesa per tracciabilità


# ─── ENDPOINTS ───────────────────────────────────────────────────────────────

@router.get("/{cantiere_id}/note-campo", response_model=List[NotaCampoOut])
def lista_note(
    cantiere_id: int,
    stato: Optional[str] = None,
    db: Session = Depends(get_db),
    user: Utente = Depends(get_current_user),
):
    _check_accesso(cantiere_id, db, user)
    q = db.query(NotaCampo).filter(NotaCampo.cantiere_id == cantiere_id)

    # artigiani/fornitori vedono solo le proprie note
    if user.ruolo in _RUOLI_INSERISCE:
        q = q.filter(NotaCampo.autore_id == user.id)
    # capocantiere/admin vedono tutte
    if stato:
        q = q.filter(NotaCampo.stato == stato)

    note = q.order_by(NotaCampo.creato_il.desc()).all()
    result = []
    for n in note:
        autore = db.query(Utente).filter(Utente.id == n.autore_id).first()
        out = NotaCampoOut.model_validate(n)
        out.autore_nome = f"{autore.nome} {autore.cognome}" if autore else None
        result.append(out)
    return result


@router.post("/{cantiere_id}/note-campo", response_model=NotaCampoOut, status_code=201)
def crea_nota(
    cantiere_id: int,
    body: NotaCampoCreate,
    db: Session = Depends(get_db),
    user: Utente = Depends(get_current_user),
):
    _check_accesso(cantiere_id, db, user)
    nota = NotaCampo(
        cantiere_id=cantiere_id,
        autore_id=user.id,
        testo=body.testo,
        voci_spesa=[v.model_dump() for v in (body.voci_spesa or [])],
        stato=StatoNota.bozza,
    )
    db.add(nota)
    db.commit()
    db.refresh(nota)
    out = NotaCampoOut.model_validate(nota)
    out.autore_nome = f"{user.nome} {user.cognome}"
    return out


@router.put("/{cantiere_id}/note-campo/{nota_id}/valida", response_model=NotaCampoOut)
def valida_nota(
    cantiere_id: int,
    nota_id: int,
    body: ValidaBody,
    db: Session = Depends(get_db),
    user: Utente = Depends(get_current_user),
):
    if user.ruolo not in _RUOLI_VALIDA:
        raise HTTPException(403, "Solo il capo cantiere o admin può validare note")
    nota = db.query(NotaCampo).filter(
        NotaCampo.id == nota_id, NotaCampo.cantiere_id == cantiere_id
    ).first()
    if not nota:
        raise HTTPException(404, "Nota non trovata")

    if body.stato not in ("validata", "pubblicata", "bozza"):
        raise HTTPException(400, "Stato non valido")

    nota.stato = body.stato
    nota.validato_da = user.id
    nota.validato_il = datetime.utcnow()
    nota.note_validazione = body.note_validazione
    db.commit()
    db.refresh(nota)
    autore = db.query(Utente).filter(Utente.id == nota.autore_id).first()
    out = NotaCampoOut.model_validate(nota)
    out.autore_nome = f"{autore.nome} {autore.cognome}" if autore else None
    return out


@router.post("/{cantiere_id}/note-campo/{nota_id}/inserisci-spesa", response_model=NotaCampoOut)
def inserisci_spesa_da_nota(
    cantiere_id: int,
    nota_id: int,
    body: InserisciSpesaBody,
    db: Session = Depends(get_db),
    user: Utente = Depends(get_current_user),
):
    """Inserisce la voce di spesa in economia. Può essere eseguito una sola volta."""
    if user.ruolo not in _RUOLI_VALIDA:
        raise HTTPException(403, "Solo capo cantiere o admin può inserire spese da note")

    nota = db.query(NotaCampo).filter(
        NotaCampo.id == nota_id, NotaCampo.cantiere_id == cantiere_id
    ).first()
    if not nota:
        raise HTTPException(404, "Nota non trovata")
    if nota.spesa_inserita:
        raise HTTPException(409, "Spesa già inserita in economia per questa nota")
    if nota.stato not in (StatoNota.validata, StatoNota.pubblicata):
        raise HTTPException(400, "Valida la nota prima di inserire la spesa")

    from datetime import date
    spesa = Spesa(
        cantiere_id=cantiere_id,
        descrizione=body.descrizione,
        importo=body.importo,
        data=date.fromisoformat(body.data) if body.data else date.today(),
        categoria=CategoriaSpesa.manodopera,
        creato_da=user.id,
        note=f"Da nota campo #{nota_id} — {nota.autore_id}",
    )
    db.add(spesa)
    db.flush()

    nota.spesa_inserita = True
    nota.spesa_id = spesa.id
    db.commit()
    db.refresh(nota)
    autore = db.query(Utente).filter(Utente.id == nota.autore_id).first()
    out = NotaCampoOut.model_validate(nota)
    out.autore_nome = f"{autore.nome} {autore.cognome}" if autore else None
    return out


@router.delete("/{cantiere_id}/note-campo/{nota_id}", status_code=204)
def elimina_nota(
    cantiere_id: int,
    nota_id: int,
    db: Session = Depends(get_db),
    user: Utente = Depends(get_current_user),
):
    nota = db.query(NotaCampo).filter(
        NotaCampo.id == nota_id, NotaCampo.cantiere_id == cantiere_id
    ).first()
    if not nota:
        raise HTTPException(404, "Nota non trovata")
    # solo autore o admin/capocantiere
    if user.ruolo not in _RUOLI_VALIDA and nota.autore_id != user.id:
        raise HTTPException(403, "Non autorizzato")
    db.delete(nota)
    db.commit()
