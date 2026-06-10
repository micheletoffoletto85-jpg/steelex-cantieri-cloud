import os
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text, Boolean
from sqlalchemy.orm import Session
from sqlalchemy.sql import func
from typing import List, Optional
from pydantic import BaseModel
from app.database import Base, get_db
from app.models.cantiere import Cantiere
from app.models.utente import Utente, RuoloUtente
from app.auth import get_current_user
from app.config import settings
from app.storage import salva_file

# Modello inline — tabella creata dalla migrazione in main.py
class ArchivioDocs(Base):
    __tablename__ = "archivio_docs"
    id          = Column(Integer, primary_key=True, index=True)
    cantiere_id = Column(Integer, ForeignKey("cantieri.id"), nullable=False)
    nome        = Column(String(300), nullable=False)
    categoria   = Column(String(50), default="operativita")
    descrizione = Column(Text, nullable=True)
    file_url    = Column(String(500), nullable=False)
    tipo_file   = Column(String(10), nullable=True)
    caricato_da = Column(Integer, ForeignKey("utenti.id"), nullable=True)
    caricato_il = Column(DateTime(timezone=True), server_default=func.now())

# Permessi per categoria documenti per membro del team
class DocCategoriaPermesso(Base):
    __tablename__ = "doc_categoria_permessi"
    id          = Column(Integer, primary_key=True, index=True)
    cantiere_id = Column(Integer, ForeignKey("cantieri.id", ondelete="CASCADE"), nullable=False)
    utente_id   = Column(Integer, ForeignKey("utenti.id", ondelete="CASCADE"), nullable=False)
    categoria   = Column(String(50), nullable=False)
    can_read    = Column(Boolean, default=True)
    can_write   = Column(Boolean, default=False)


router = APIRouter(prefix="/cantieri", tags=["Archivio Documenti"])

# 4 categorie ufficiali
CATEGORIE = ["sicurezza", "relazioni_disegni", "amministrazione", "operativita"]
CATEGORIE_LABEL = {
    "sicurezza": "Sicurezza",
    "relazioni_disegni": "Relazioni e Disegni",
    "amministrazione": "Amministrazione",
    "operativita": "Operatività",
}

# Ruoli che vedono SEMPRE tutte le categorie senza bisogno di permessi espliciti
_RUOLI_FULL_ACCESS = {RuoloUtente.admin, RuoloUtente.capo_cantiere, RuoloUtente.amministrazione}
# Ruoli che per default non vedono nulla (accesso solo se admin/capo assegna permesso)
_RUOLI_PERMESSO_RICHIESTO = {
    RuoloUtente.capo_cantiere_sub, RuoloUtente.direzione_lavori,
    RuoloUtente.architetto, RuoloUtente.responsabile_sicurezza,
    RuoloUtente.artigiano, RuoloUtente.fornitore, RuoloUtente.cliente,
}


def _check(cantiere_id, db, user):
    c = db.query(Cantiere).filter(Cantiere.id == cantiere_id).first()
    if not c:
        raise HTTPException(404, "Cantiere non trovato")
    return c


def _categorie_leggibili(cantiere_id: int, utente_id: int, ruolo: RuoloUtente, db: Session) -> set:
    """Restituisce l'insieme di categorie che l'utente può leggere."""
    if ruolo in _RUOLI_FULL_ACCESS:
        return set(CATEGORIE)
    perms = db.query(DocCategoriaPermesso).filter(
        DocCategoriaPermesso.cantiere_id == cantiere_id,
        DocCategoriaPermesso.utente_id == utente_id,
        DocCategoriaPermesso.can_read == True,
    ).all()
    return {p.categoria for p in perms}


def _can_write_categoria(cantiere_id: int, utente_id: int, ruolo: RuoloUtente, categoria: str, db: Session) -> bool:
    if ruolo in _RUOLI_FULL_ACCESS:
        return True
    p = db.query(DocCategoriaPermesso).filter(
        DocCategoriaPermesso.cantiere_id == cantiere_id,
        DocCategoriaPermesso.utente_id == utente_id,
        DocCategoriaPermesso.categoria == categoria,
        DocCategoriaPermesso.can_write == True,
    ).first()
    return p is not None


class DocOut(BaseModel):
    id: int
    cantiere_id: int
    nome: str
    categoria: str
    categoria_label: Optional[str] = None
    descrizione: Optional[str]
    file_url: str
    tipo_file: Optional[str]
    caricato_da: Optional[int]
    caricato_il: Optional[datetime]

    class Config:
        from_attributes = True


class PermessoCreate(BaseModel):
    utente_id: int
    categoria: str
    can_read: bool = True
    can_write: bool = False


class PermessoOut(BaseModel):
    id: int
    utente_id: int
    categoria: str
    can_read: bool
    can_write: bool

    class Config:
        from_attributes = True


@router.get("/{cantiere_id}/archivio", response_model=List[DocOut])
def lista(
    cantiere_id: int,
    categoria: Optional[str] = None,
    cerca: Optional[str] = None,
    db: Session = Depends(get_db),
    user: Utente = Depends(get_current_user),
):
    _check(cantiere_id, db, user)
    leggibili = _categorie_leggibili(cantiere_id, user.id, user.ruolo, db)
    if not leggibili:
        return []

    q = db.query(ArchivioDocs).filter(ArchivioDocs.cantiere_id == cantiere_id)
    if categoria:
        if categoria not in leggibili:
            raise HTTPException(403, "Non hai accesso a questa categoria")
        q = q.filter(ArchivioDocs.categoria == categoria)
    else:
        q = q.filter(ArchivioDocs.categoria.in_(leggibili))
    if cerca:
        q = q.filter(ArchivioDocs.nome.ilike(f"%{cerca}%"))

    docs = q.order_by(ArchivioDocs.caricato_il.desc()).all()
    result = []
    for d in docs:
        out = DocOut.model_validate(d)
        out.categoria_label = CATEGORIE_LABEL.get(d.categoria, d.categoria)
        result.append(out)
    return result


@router.post("/{cantiere_id}/archivio", response_model=DocOut, status_code=201)
async def upload(
    cantiere_id: int,
    file: UploadFile = File(...),
    categoria: str = Query("operativita"),
    nome: str = Query(""),
    descrizione: str = Query(""),
    db: Session = Depends(get_db),
    user: Utente = Depends(get_current_user),
):
    _check(cantiere_id, db, user)
    if categoria not in CATEGORIE:
        categoria = "operativita"
    if not _can_write_categoria(cantiere_id, user.id, user.ruolo, categoria, db):
        raise HTTPException(403, "Non hai permesso di scrittura per questa categoria")

    _ct_map = {
        "image/jpeg": ".jpg", "image/jpg": ".jpg", "image/png": ".png",
        "image/webp": ".webp", "image/heic": ".heic", "image/gif": ".gif",
        "application/pdf": ".pdf",
    }
    ext = (os.path.splitext(file.filename or "")[1].lower()
           or _ct_map.get((file.content_type or "").split(";")[0].strip(), "")).lstrip(".") or "bin"
    contenuto = await file.read()
    if len(contenuto) > settings.MAX_FILE_SIZE:
        raise HTTPException(413, f"File troppo grande (max {settings.MAX_FILE_SIZE // 1024 // 1024} MB)")
    url, _ = salva_file(contenuto, f"archivio/{cantiere_id}", f".{ext}")
    doc = ArchivioDocs(
        cantiere_id=cantiere_id,
        nome=nome or file.filename or "documento",
        categoria=categoria,
        descrizione=descrizione or None,
        file_url=url,
        tipo_file=ext,
        caricato_da=user.id,
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    out = DocOut.model_validate(doc)
    out.categoria_label = CATEGORIE_LABEL.get(doc.categoria, doc.categoria)
    return out


@router.delete("/{cantiere_id}/archivio/{doc_id}", status_code=204)
def elimina(
    cantiere_id: int,
    doc_id: int,
    db: Session = Depends(get_db),
    user: Utente = Depends(get_current_user),
):
    _check(cantiere_id, db, user)
    d = db.query(ArchivioDocs).filter(
        ArchivioDocs.id == doc_id, ArchivioDocs.cantiere_id == cantiere_id
    ).first()
    if not d:
        raise HTTPException(404)
    if not _can_write_categoria(cantiere_id, user.id, user.ruolo, d.categoria, db):
        raise HTTPException(403, "Non hai permesso per questa categoria")
    db.delete(d)
    db.commit()


# ─── GESTIONE PERMESSI CATEGORIE ─────────────────────────────────────────────

@router.get("/{cantiere_id}/archivio/permessi", response_model=List[PermessoOut])
def lista_permessi(
    cantiere_id: int,
    utente_id: Optional[int] = None,
    db: Session = Depends(get_db),
    user: Utente = Depends(get_current_user),
):
    if user.ruolo not in _RUOLI_FULL_ACCESS:
        raise HTTPException(403, "Solo admin o capo cantiere gestisce i permessi")
    q = db.query(DocCategoriaPermesso).filter(DocCategoriaPermesso.cantiere_id == cantiere_id)
    if utente_id:
        q = q.filter(DocCategoriaPermesso.utente_id == utente_id)
    return q.all()


@router.post("/{cantiere_id}/archivio/permessi", response_model=PermessoOut, status_code=201)
def imposta_permesso(
    cantiere_id: int,
    body: PermessoCreate,
    db: Session = Depends(get_db),
    user: Utente = Depends(get_current_user),
):
    if user.ruolo not in _RUOLI_FULL_ACCESS:
        raise HTTPException(403, "Solo admin o capo cantiere gestisce i permessi")
    if body.categoria not in CATEGORIE:
        raise HTTPException(400, f"Categoria non valida: {', '.join(CATEGORIE)}")

    # upsert
    p = db.query(DocCategoriaPermesso).filter(
        DocCategoriaPermesso.cantiere_id == cantiere_id,
        DocCategoriaPermesso.utente_id == body.utente_id,
        DocCategoriaPermesso.categoria == body.categoria,
    ).first()
    if p:
        p.can_read = body.can_read
        p.can_write = body.can_write
    else:
        p = DocCategoriaPermesso(
            cantiere_id=cantiere_id,
            utente_id=body.utente_id,
            categoria=body.categoria,
            can_read=body.can_read,
            can_write=body.can_write,
        )
        db.add(p)
    db.commit()
    db.refresh(p)
    return p


@router.delete("/{cantiere_id}/archivio/permessi/{permesso_id}", status_code=204)
def revoca_permesso(
    cantiere_id: int,
    permesso_id: int,
    db: Session = Depends(get_db),
    user: Utente = Depends(get_current_user),
):
    if user.ruolo not in _RUOLI_FULL_ACCESS:
        raise HTTPException(403)
    p = db.query(DocCategoriaPermesso).filter(
        DocCategoriaPermesso.id == permesso_id,
        DocCategoriaPermesso.cantiere_id == cantiere_id,
    ).first()
    if not p:
        raise HTTPException(404)
    db.delete(p)
    db.commit()
