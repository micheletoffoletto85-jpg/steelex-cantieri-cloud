from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel
from datetime import date, datetime
from app.database import get_db
from app.models.non_conformita import NonConformita
from app.models.utente import Utente
from app.auth import get_current_user

router = APIRouter(prefix="/non-conformita", tags=["NonConformita"])

_RUOLI_SCRIVE = {"admin", "capo_cantiere", "capo_cantiere_sub", "direzione_lavori", "amministrazione"}


class NCCreate(BaseModel):
    cantiere_id: int
    descrizione: str
    foto_url: Optional[str] = None
    responsabile_id: Optional[int] = None
    scadenza: Optional[date] = None

class NCChiudi(BaseModel):
    nota_chiusura: Optional[str] = None

class NCOut(BaseModel):
    id: int
    cantiere_id: int
    descrizione: str
    foto_url: Optional[str] = None
    responsabile_id: Optional[int] = None
    responsabile_nome: Optional[str] = None
    scadenza: Optional[date] = None
    stato: str
    nota_chiusura: Optional[str] = None
    creato_da: int
    autore_nome: Optional[str] = None
    creato_il: Optional[datetime] = None
    chiusa_il: Optional[datetime] = None
    scaduta: bool = False
    class Config: from_attributes = True


def _out(nc: NonConformita, db: Session) -> NCOut:
    resp_nome = None
    if nc.responsabile_id:
        u = db.query(Utente).filter(Utente.id == nc.responsabile_id).first()
        if u: resp_nome = f"{u.nome} {u.cognome}".strip()
    autore = db.query(Utente).filter(Utente.id == nc.creato_da).first()
    autore_nome = f"{autore.nome} {autore.cognome}".strip() if autore else None
    scaduta = bool(nc.scadenza and nc.stato == "aperta" and nc.scadenza < date.today())
    return NCOut(
        id=nc.id, cantiere_id=nc.cantiere_id, descrizione=nc.descrizione,
        foto_url=nc.foto_url, responsabile_id=nc.responsabile_id,
        responsabile_nome=resp_nome, scadenza=nc.scadenza, stato=nc.stato,
        nota_chiusura=nc.nota_chiusura, creato_da=nc.creato_da,
        autore_nome=autore_nome, creato_il=nc.creato_il,
        chiusa_il=nc.chiusa_il, scaduta=scaduta,
    )


@router.get("/cantiere/{cantiere_id}", response_model=List[NCOut])
def lista_nc(cantiere_id: int, db: Session = Depends(get_db), user: Utente = Depends(get_current_user)):
    ncs = db.query(NonConformita).filter(NonConformita.cantiere_id == cantiere_id)\
            .order_by(NonConformita.creato_il.desc()).all()
    return [_out(nc, db) for nc in ncs]


@router.post("", response_model=NCOut, status_code=201)
def crea_nc(body: NCCreate, db: Session = Depends(get_db), user: Utente = Depends(get_current_user)):
    if user.ruolo.value not in _RUOLI_SCRIVE:
        raise HTTPException(403, "Non autorizzato")
    nc = NonConformita(**body.model_dump(), creato_da=user.id)
    db.add(nc); db.commit(); db.refresh(nc)
    return _out(nc, db)


@router.post("/{nc_id}/chiudi", response_model=NCOut)
def chiudi_nc(nc_id: int, body: NCChiudi, db: Session = Depends(get_db), user: Utente = Depends(get_current_user)):
    if user.ruolo.value not in _RUOLI_SCRIVE:
        raise HTTPException(403, "Non autorizzato")
    nc = db.query(NonConformita).filter(NonConformita.id == nc_id).first()
    if not nc: raise HTTPException(404, "NC non trovata")
    nc.stato = "chiusa"
    nc.nota_chiusura = body.nota_chiusura
    nc.chiusa_il = datetime.utcnow()
    db.commit(); db.refresh(nc)
    return _out(nc, db)


@router.delete("/{nc_id}", status_code=204)
def elimina_nc(nc_id: int, db: Session = Depends(get_db), user: Utente = Depends(get_current_user)):
    if user.ruolo.value not in {"admin"}:
        raise HTTPException(403, "Solo admin")
    nc = db.query(NonConformita).filter(NonConformita.id == nc_id).first()
    if not nc: raise HTTPException(404)
    db.delete(nc); db.commit()
