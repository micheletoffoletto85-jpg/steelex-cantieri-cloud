import os
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text
from sqlalchemy.orm import Session
from sqlalchemy.sql import func
from typing import List, Optional
from pydantic import BaseModel
from app.database import Base, get_db
from app.models.cantiere import Cantiere
from app.models.utente import Utente
from app.auth import get_current_user
from app.storage import salva_file

# Modello inline — tabella creata dalla migrazione in main.py
class ArchivioDocs(Base):
    __tablename__ = "archivio_docs"
    id          = Column(Integer, primary_key=True, index=True)
    cantiere_id = Column(Integer, ForeignKey("cantieri.id"), nullable=False)
    nome        = Column(String(300), nullable=False)
    categoria   = Column(String(50), default="varie")
    descrizione = Column(Text, nullable=True)
    file_url    = Column(String(500), nullable=False)
    tipo_file   = Column(String(10), nullable=True)   # pdf, dwg, jpg, png, …
    caricato_da = Column(Integer, ForeignKey("utenti.id"), nullable=True)
    caricato_il = Column(DateTime(timezone=True), server_default=func.now())

router = APIRouter(prefix="/cantieri", tags=["Archivio Documenti"])

CATEGORIE = ["progetto", "strutturale", "contratti", "autorizzazioni", "relazioni", "foto", "varie"]

def _check(cantiere_id, db, user):
    c = db.query(Cantiere).filter(Cantiere.id == cantiere_id).first()
    if not c: raise HTTPException(404, "Cantiere non trovato")
    if user.ruolo not in ("admin", "capo_cantiere", "artigiano", "fornitore", "cliente"):
        raise HTTPException(403)
    return c

class DocOut(BaseModel):
    id: int; cantiere_id: int; nome: str; categoria: str
    descrizione: Optional[str]; file_url: str; tipo_file: Optional[str]
    caricato_da: Optional[int]; caricato_il: Optional[datetime]
    class Config: from_attributes = True

@router.get("/{cantiere_id}/archivio", response_model=List[DocOut])
def lista(cantiere_id: int, categoria: Optional[str] = None, cerca: Optional[str] = None,
          db: Session = Depends(get_db), user: Utente = Depends(get_current_user)):
    _check(cantiere_id, db, user)
    q = db.query(ArchivioDocs).filter(ArchivioDocs.cantiere_id == cantiere_id)
    if categoria: q = q.filter(ArchivioDocs.categoria == categoria)
    if cerca:     q = q.filter(ArchivioDocs.nome.ilike(f"%{cerca}%"))
    return q.order_by(ArchivioDocs.caricato_il.desc()).all()

@router.post("/{cantiere_id}/archivio", response_model=DocOut, status_code=201)
async def upload(cantiere_id: int, file: UploadFile = File(...),
                 categoria: str = Query("varie"), nome: str = Query(""),
                 descrizione: str = Query(""),
                 db: Session = Depends(get_db), user: Utente = Depends(get_current_user)):
    _check(cantiere_id, db, user)
    if user.ruolo == "cliente": raise HTTPException(403, "Sola lettura")
    ext = os.path.splitext(file.filename or "")[1].lower().lstrip(".") or "bin"
    url, _ = salva_file(await file.read(), f"archivio/{cantiere_id}", f".{ext}")
    doc = ArchivioDocs(
        cantiere_id=cantiere_id,
        nome=nome or file.filename or "documento",
        categoria=categoria if categoria in CATEGORIE else "varie",
        descrizione=descrizione or None,
        file_url=url,
        tipo_file=ext,
        caricato_da=user.id,
    )
    db.add(doc); db.commit(); db.refresh(doc)
    return doc

@router.delete("/{cantiere_id}/archivio/{doc_id}", status_code=204)
def elimina(cantiere_id: int, doc_id: int,
            db: Session = Depends(get_db), user: Utente = Depends(get_current_user)):
    _check(cantiere_id, db, user)
    if user.ruolo not in ("admin", "capo_cantiere"): raise HTTPException(403)
    d = db.query(ArchivioDocs).filter(ArchivioDocs.id == doc_id, ArchivioDocs.cantiere_id == cantiere_id).first()
    if not d: raise HTTPException(404)
    db.delete(d); db.commit()
