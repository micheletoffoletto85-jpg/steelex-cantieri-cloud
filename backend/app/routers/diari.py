from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from typing import List
from datetime import date
import os
from app.database import get_db
from app.models.diario import DiarioGiornaliero
from app.models.cantiere import Cantiere
from app.models.utente import Utente
from app.schemas.diario import DiarioCreate, DiarioOut, DiarioUpdate
from app.auth import get_current_user
from app.config import settings
from app.storage import salva_file

router = APIRouter(prefix="/cantieri/{cantiere_id}/diari", tags=["Diario Giornaliero"])

@router.get("", response_model=List[DiarioOut])
def lista_diari(cantiere_id: int, db: Session = Depends(get_db), user: Utente = Depends(get_current_user)):
    if user.ruolo.value == "cliente":
        raise HTTPException(status_code=403, detail="Accesso non consentito")
    return db.query(DiarioGiornaliero).filter(DiarioGiornaliero.cantiere_id == cantiere_id).order_by(DiarioGiornaliero.data.desc()).all()

@router.post("", response_model=DiarioOut, status_code=201)
def crea_diario(cantiere_id: int, data: DiarioCreate, db: Session = Depends(get_db), user: Utente = Depends(get_current_user)):
    diario = DiarioGiornaliero(**data.model_dump(), autore_id=user.id, cantiere_id=cantiere_id)
    db.add(diario)
    db.commit()
    db.refresh(diario)
    return diario

@router.put("/{diario_id}", response_model=DiarioOut)
def aggiorna_diario(cantiere_id: int, diario_id: int, data: DiarioUpdate, db: Session = Depends(get_db), user: Utente = Depends(get_current_user)):
    diario = db.query(DiarioGiornaliero).filter(DiarioGiornaliero.id == diario_id, DiarioGiornaliero.cantiere_id == cantiere_id).first()
    if not diario:
        raise HTTPException(status_code=404, detail="Diario non trovato")
    for k, v in data.model_dump(exclude_none=True).items():
        setattr(diario, k, v)
    db.commit()
    db.refresh(diario)
    return diario

@router.post("/{diario_id}/foto", response_model=DiarioOut)
async def upload_foto(cantiere_id: int, diario_id: int, file: UploadFile = File(...), db: Session = Depends(get_db), user: Utente = Depends(get_current_user)):
    diario = db.query(DiarioGiornaliero).filter(DiarioGiornaliero.id == diario_id).first()
    if not diario:
        raise HTTPException(status_code=404, detail="Diario non trovato")
    ext = os.path.splitext(file.filename or "foto.jpg")[1] or ".jpg"
    contenuto = await file.read()
    url, _ = salva_file(contenuto, f"foto/{cantiere_id}", ext)
    urls = list(diario.foto_urls or [])
    urls.append(url)
    diario.foto_urls = urls
    db.commit()
    db.refresh(diario)
    return diario
