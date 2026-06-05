from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app.database import get_db
from app.models.utente import Utente
from app.schemas.utente import UtenteCreate, UtenteOut, UtenteUpdate
from app.auth import get_current_user, require_admin, hash_password

router = APIRouter(prefix="/utenti", tags=["Utenti"])

@router.get("", response_model=List[UtenteOut])
def lista_utenti(db: Session = Depends(get_db), _=Depends(require_admin)):
    return db.query(Utente).all()

@router.post("", response_model=UtenteOut, status_code=201)
def crea_utente(data: UtenteCreate, db: Session = Depends(get_db), _=Depends(require_admin)):
    if db.query(Utente).filter(Utente.email == data.email).first():
        raise HTTPException(status_code=400, detail="Email già registrata")
    try:
        utente = Utente(**data.model_dump(exclude={"password"}), password_hash=hash_password(data.password))
        db.add(utente)
        db.commit()
        db.refresh(utente)
        return utente
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/{utente_id}", response_model=UtenteOut)
def aggiorna_utente(utente_id: int, data: UtenteUpdate, db: Session = Depends(get_db), _=Depends(require_admin)):
    utente = db.query(Utente).filter(Utente.id == utente_id).first()
    if not utente:
        raise HTTPException(status_code=404, detail="Utente non trovato")
    update_data = data.model_dump(exclude_none=True)
    if "password" in update_data:
        utente.password_hash = hash_password(update_data.pop("password"))
    for k, v in update_data.items():
        setattr(utente, k, v)
    db.commit()
    db.refresh(utente)
    return utente

@router.delete("/{utente_id}", status_code=204)
def elimina_utente(utente_id: int, db: Session = Depends(get_db), current_user=Depends(require_admin)):
    if utente_id == current_user.id:
        raise HTTPException(status_code=400, detail="Non puoi eliminare te stesso")
    utente = db.query(Utente).filter(Utente.id == utente_id).first()
    if not utente:
        raise HTTPException(status_code=404, detail="Utente non trovato")
    db.delete(utente)
    db.commit()
