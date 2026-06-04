from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime, timezone
from app.database import get_db
from app.models.checklist import ChecklistItem
from app.models.utente import Utente
from app.schemas.checklist import ChecklistItemCreate, ChecklistItemUpdate, ChecklistItemOut
from app.auth import get_current_user

router = APIRouter(prefix="/cantieri/{cantiere_id}/checklist", tags=["Checklist"])

@router.get("/", response_model=List[ChecklistItemOut])
def lista_checklist(cantiere_id: int, db: Session = Depends(get_db), user: Utente = Depends(get_current_user)):
    return db.query(ChecklistItem).filter(ChecklistItem.cantiere_id == cantiere_id).order_by(ChecklistItem.ordine).all()

@router.post("/", response_model=ChecklistItemOut, status_code=201)
def crea_item(cantiere_id: int, data: ChecklistItemCreate, db: Session = Depends(get_db), user: Utente = Depends(get_current_user)):
    item = ChecklistItem(**data.model_dump(), cantiere_id=cantiere_id)
    db.add(item)
    db.commit()
    db.refresh(item)
    return item

@router.put("/{item_id}", response_model=ChecklistItemOut)
def aggiorna_item(cantiere_id: int, item_id: int, data: ChecklistItemUpdate, db: Session = Depends(get_db), user: Utente = Depends(get_current_user)):
    item = db.query(ChecklistItem).filter(ChecklistItem.id == item_id, ChecklistItem.cantiere_id == cantiere_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item non trovato")
    for k, v in data.model_dump(exclude_none=True).items():
        setattr(item, k, v)
    if data.completato is True and not item.completato_da:
        item.completato_da = user.id
        item.completato_il = datetime.now(timezone.utc)
    elif data.completato is False:
        item.completato_da = None
        item.completato_il = None
    db.commit()
    db.refresh(item)
    return item

@router.delete("/{item_id}", status_code=204)
def elimina_item(cantiere_id: int, item_id: int, db: Session = Depends(get_db), user: Utente = Depends(get_current_user)):
    item = db.query(ChecklistItem).filter(ChecklistItem.id == item_id, ChecklistItem.cantiere_id == cantiere_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item non trovato")
    db.delete(item)
    db.commit()
