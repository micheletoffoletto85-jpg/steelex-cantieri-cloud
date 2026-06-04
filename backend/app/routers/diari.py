from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from typing import List
from datetime import date
import os, uuid, shutil
from app.database import get_db
from app.models.diario import DiarioGiornaliero
from app.models.cantiere import Cantiere
from app.models.utente import Utente
from app.schemas.diario import DiarioCreate, DiarioOut, DiarioUpdate
from app.auth import get_current_user
from app.config import settings

router = APIRouter(prefix="/cantieri/{cantiere_id}/diari", tags=["Diario Giornaliero"])

@router.get("/", response_model=List[DiarioOut])
def lista_diari(cantiere_id: int, db: Session = Depends(get_db), user: Utente = Depends(get_current_user)):
    return db.query(DiarioGiornaliero).filter(DiarioGiornaliero.cantiere_id == cantiere_id).order_by(DiarioGiornaliero.data.desc()).all()

@router.post("/", response_model=DiarioOut, status_code=201)
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
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    filename = f"{uuid.uuid4()}{os.path.splitext(file.filename)[1]}"
    filepath = os.path.join(settings.UPLOAD_DIR, filename)
    with open(filepath, "wb") as f:
        shutil.copyfileobj(file.file, f)
    urls = list(diario.foto_urls or [])
    urls.append(f"/uploads/{filename}")
    diario.foto_urls = urls
    db.commit()
    db.refresh(diario)
    return diario
