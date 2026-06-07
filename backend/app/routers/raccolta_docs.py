from datetime import datetime, date
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel
from app.database import get_db
from app.models.raccolta_docs import RichiestaDocumento
from app.models.cantiere import Cantiere
from app.models.utente import Utente
from app.auth import get_current_user
from app.storage import salva_file

router = APIRouter(prefix="/cantieri", tags=["Raccolta Documenti"])

def _check(cantiere_id: int, db: Session, user: Utente):
    c = db.query(Cantiere).filter(Cantiere.id == cantiere_id).first()
    if not c:
        raise HTTPException(404, "Cantiere non trovato")
    if user.ruolo == "admin":
        return c
    if user.ruolo in ("capo_cantiere", "artigiano", "fornitore"):
        return c
    if user.ruolo == "cliente" and c.cliente_email == user.email:
        return c
    raise HTTPException(403, "Non autorizzato")

def _solo_staff(user: Utente):
    if user.ruolo not in ("admin", "capo_cantiere"):
        raise HTTPException(403, "Solo admin/capo cantiere")

# ─── SCHEMA ─────────────────────────────────────────────────────────────────

class RichiestaOut(BaseModel):
    id: int
    cantiere_id: int
    titolo: str
    descrizione: Optional[str]
    assegnato_a: Optional[int]
    assegnato_nome: Optional[str] = None
    scadenza: Optional[date]
    stato: str
    file_url: Optional[str]
    note_rifiuto: Optional[str]
    creato_il: Optional[datetime]
    caricato_il: Optional[datetime]
    class Config: from_attributes = True

class RichiestaCreate(BaseModel):
    titolo: str
    descrizione: Optional[str] = None
    assegnato_a: Optional[int] = None
    scadenza: Optional[date] = None

class RichiestaUpdate(BaseModel):
    stato: Optional[str] = None
    note_rifiuto: Optional[str] = None

def _to_out(r: RichiestaDocumento) -> dict:
    return {
        "id": r.id,
        "cantiere_id": r.cantiere_id,
        "titolo": r.titolo,
        "descrizione": r.descrizione,
        "assegnato_a": r.assegnato_a,
        "assegnato_nome": r.assegnato.nome if r.assegnato else None,
        "scadenza": r.scadenza,
        "stato": r.stato,
        "file_url": r.file_url,
        "note_rifiuto": r.note_rifiuto,
        "creato_il": r.creato_il,
        "caricato_il": r.caricato_il,
    }

# ─── ENDPOINTS ──────────────────────────────────────────────────────────────

@router.get("/{cantiere_id}/raccolta-docs")
def lista(cantiere_id: int, db: Session = Depends(get_db), user: Utente = Depends(get_current_user)):
    _check(cantiere_id, db, user)
    q = db.query(RichiestaDocumento).filter(RichiestaDocumento.cantiere_id == cantiere_id)
    # fornitore/artigiano vedono solo le proprie o quelle non assegnate
    if user.ruolo in ("fornitore", "artigiano"):
        q = q.filter((RichiestaDocumento.assegnato_a == user.id) | (RichiestaDocumento.assegnato_a == None))
    return [_to_out(r) for r in q.order_by(RichiestaDocumento.creato_il.desc()).all()]

@router.post("/{cantiere_id}/raccolta-docs", status_code=201)
def crea(cantiere_id: int, body: RichiestaCreate, db: Session = Depends(get_db), user: Utente = Depends(get_current_user)):
    _check(cantiere_id, db, user)
    _solo_staff(user)
    r = RichiestaDocumento(
        cantiere_id=cantiere_id,
        titolo=body.titolo,
        descrizione=body.descrizione,
        assegnato_a=body.assegnato_a,
        scadenza=body.scadenza,
        stato="richiesto",
        creato_da=user.id,
    )
    db.add(r); db.commit(); db.refresh(r)
    return _to_out(r)

@router.post("/{cantiere_id}/raccolta-docs/{doc_id}/upload")
async def upload(cantiere_id: int, doc_id: int, file: UploadFile = File(...),
                 db: Session = Depends(get_db), user: Utente = Depends(get_current_user)):
    _check(cantiere_id, db, user)
    r = db.query(RichiestaDocumento).filter(RichiestaDocumento.id == doc_id, RichiestaDocumento.cantiere_id == cantiere_id).first()
    if not r: raise HTTPException(404)
    # solo chi è assegnato (o admin/capo) può caricare
    if user.ruolo in ("fornitore", "artigiano") and r.assegnato_a and r.assegnato_a != user.id:
        raise HTTPException(403)
    import os
    ext = os.path.splitext(file.filename or ".pdf")[1].lower() or ".pdf"
    url, _ = salva_file(await file.read(), f"raccolta/{cantiere_id}", ext)
    r.file_url = url
    r.stato = "caricato"
    r.caricato_il = datetime.utcnow()
    db.commit(); db.refresh(r)
    return _to_out(r)

@router.patch("/{cantiere_id}/raccolta-docs/{doc_id}")
def aggiorna(cantiere_id: int, doc_id: int, body: RichiestaUpdate,
             db: Session = Depends(get_db), user: Utente = Depends(get_current_user)):
    _check(cantiere_id, db, user)
    _solo_staff(user)
    r = db.query(RichiestaDocumento).filter(RichiestaDocumento.id == doc_id, RichiestaDocumento.cantiere_id == cantiere_id).first()
    if not r: raise HTTPException(404)
    if body.stato: r.stato = body.stato
    if body.note_rifiuto is not None: r.note_rifiuto = body.note_rifiuto
    db.commit(); db.refresh(r)
    return _to_out(r)

@router.delete("/{cantiere_id}/raccolta-docs/{doc_id}", status_code=204)
def elimina(cantiere_id: int, doc_id: int, db: Session = Depends(get_db), user: Utente = Depends(get_current_user)):
    _check(cantiere_id, db, user)
    _solo_staff(user)
    r = db.query(RichiestaDocumento).filter(RichiestaDocumento.id == doc_id, RichiestaDocumento.cantiere_id == cantiere_id).first()
    if not r: raise HTTPException(404)
    db.delete(r); db.commit()
