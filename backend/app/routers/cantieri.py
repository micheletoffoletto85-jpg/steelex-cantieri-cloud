from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from app.database import get_db
from app.models.cantiere import Cantiere, StatoCantiere
from app.models.utente import Utente, RuoloUtente
from app.schemas.cantiere import CantiereCreate, CantiereOut, CantiereUpdate
from app.auth import get_current_user

router = APIRouter(prefix="/cantieri", tags=["Cantieri"])

def _check_accesso(cantiere: Cantiere, user: Utente):
    if user.ruolo == RuoloUtente.admin:
        return
    if user.ruolo == RuoloUtente.capo_cantiere and cantiere.responsabile_id == user.id:
        return
    # fornitore e cliente: sola lettura su tutti i cantieri
    if user.ruolo in (RuoloUtente.fornitore, RuoloUtente.cliente):
        return
    raise HTTPException(status_code=403, detail="Accesso negato")

@router.get("", response_model=List[CantiereOut])
def lista_cantieri(
    stato: Optional[StatoCantiere] = None,
    db: Session = Depends(get_db),
    user: Utente = Depends(get_current_user),
):
    q = db.query(Cantiere)
    if user.ruolo == RuoloUtente.capo_cantiere:
        q = q.filter(Cantiere.responsabile_id == user.id)
    # fornitore e cliente vedono tutti i cantieri in sola lettura
    if stato:
        q = q.filter(Cantiere.stato == stato)
    return q.order_by(Cantiere.creato_il.desc()).all()

@router.post("", response_model=CantiereOut, status_code=201)
def crea_cantiere(data: CantiereCreate, db: Session = Depends(get_db), user: Utente = Depends(get_current_user)):
    if user.ruolo not in [RuoloUtente.admin, RuoloUtente.capo_cantiere]:
        raise HTTPException(status_code=403, detail="Non autorizzato")
    cantiere = Cantiere(**data.model_dump())
    if not cantiere.responsabile_id:
        cantiere.responsabile_id = user.id
    db.add(cantiere)
    db.commit()
    db.refresh(cantiere)
    return cantiere

@router.get("/{cantiere_id}", response_model=CantiereOut)
def get_cantiere(cantiere_id: int, db: Session = Depends(get_db), user: Utente = Depends(get_current_user)):
    cantiere = db.query(Cantiere).filter(Cantiere.id == cantiere_id).first()
    if not cantiere:
        raise HTTPException(status_code=404, detail="Cantiere non trovato")
    _check_accesso(cantiere, user)
    return cantiere

@router.put("/{cantiere_id}", response_model=CantiereOut)
def aggiorna_cantiere(cantiere_id: int, data: CantiereUpdate, db: Session = Depends(get_db), user: Utente = Depends(get_current_user)):
    cantiere = db.query(Cantiere).filter(Cantiere.id == cantiere_id).first()
    if not cantiere:
        raise HTTPException(status_code=404, detail="Cantiere non trovato")
    _check_accesso(cantiere, user)
    for k, v in data.model_dump(exclude_none=True).items():
        setattr(cantiere, k, v)
    db.commit()
    db.refresh(cantiere)
    return cantiere

@router.delete("/{cantiere_id}", status_code=204)
def elimina_cantiere(cantiere_id: int, db: Session = Depends(get_db), user: Utente = Depends(get_current_user)):
    from app.models.utente import RuoloUtente
    if user.ruolo != RuoloUtente.admin:
        raise HTTPException(status_code=403, detail="Solo admin può eliminare cantieri")
    cantiere = db.query(Cantiere).filter(Cantiere.id == cantiere_id).first()
    if not cantiere:
        raise HTTPException(status_code=404, detail="Cantiere non trovato")
    db.delete(cantiere)
    db.commit()
