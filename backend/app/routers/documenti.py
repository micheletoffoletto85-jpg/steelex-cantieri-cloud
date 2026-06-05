import os
import uuid
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from typing import List
from app.database import get_db
from app.models.documento import Documento
from app.models.cantiere import Cantiere
from app.models.utente import RuoloUtente, Utente
from app.auth import get_current_user
from app.config import settings
from pydantic import BaseModel
from typing import Optional, Any

router = APIRouter(prefix="/cantieri", tags=["Documenti"])

TIPI_CONSENTITI = {"image/jpeg", "image/png", "image/gif", "application/pdf", "image/webp"}
ESTENSIONI_CONSENTITE = {".jpg", ".jpeg", ".png", ".gif", ".pdf", ".webp", ".dxf"}

def _get_cantiere_con_accesso(cantiere_id: int, db: Session, user: Utente) -> Cantiere:
    cantiere = db.query(Cantiere).filter(Cantiere.id == cantiere_id).first()
    if not cantiere:
        raise HTTPException(status_code=404, detail="Cantiere non trovato")
    if user.ruolo == RuoloUtente.admin:
        return cantiere
    if user.ruolo == RuoloUtente.capo_cantiere and cantiere.responsabile_id == user.id:
        return cantiere
    if user.ruolo in (RuoloUtente.fornitore, RuoloUtente.cliente):
        return cantiere  # sola lettura, controllata nei singoli endpoint
    raise HTTPException(status_code=403, detail="Accesso negato")

def _can_write(user: Utente) -> bool:
    return user.ruolo in (RuoloUtente.admin, RuoloUtente.capo_cantiere, RuoloUtente.fornitore)

class DocumentoOut(BaseModel):
    id: int
    nome: str
    tipo: Optional[str]
    url: str
    dimensione: Optional[int]
    versione: int
    pin_dati: Any
    caricato_da: Optional[int]

    class Config:
        from_attributes = True

class PinUpdate(BaseModel):
    pin_dati: list

@router.get("/{cantiere_id}/documenti", response_model=List[DocumentoOut])
def lista_documenti(cantiere_id: int, db: Session = Depends(get_db), user: Utente = Depends(get_current_user)):
    _get_cantiere_con_accesso(cantiere_id, db, user)
    return db.query(Documento).filter(Documento.cantiere_id == cantiere_id).order_by(Documento.creato_il.desc()).all()

@router.post("/{cantiere_id}/documenti", response_model=DocumentoOut, status_code=201)
async def carica_documento(
    cantiere_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: Utente = Depends(get_current_user),
):
    _get_cantiere_con_accesso(cantiere_id, db, user)
    if not _can_write(user):
        raise HTTPException(status_code=403, detail="Non autorizzato al caricamento")

    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ESTENSIONI_CONSENTITE:
        raise HTTPException(status_code=400, detail=f"Tipo file non consentito: {ext}")

    contenuto = await file.read()
    if len(contenuto) > 50 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File troppo grande (max 50MB)")

    nome_file = f"{uuid.uuid4()}{ext}"
    cartella = os.path.join(settings.UPLOAD_DIR, "documenti", str(cantiere_id))
    os.makedirs(cartella, exist_ok=True)
    percorso = os.path.join(cartella, nome_file)

    with open(percorso, "wb") as f:
        f.write(contenuto)

    tipo = ext.lstrip(".")
    doc = Documento(
        cantiere_id=cantiere_id,
        nome=file.filename or nome_file,
        tipo=tipo,
        url=f"/uploads/documenti/{cantiere_id}/{nome_file}",
        dimensione=len(contenuto),
        caricato_da=user.id,
        pin_dati=[],
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return doc

@router.put("/{cantiere_id}/documenti/{doc_id}/pin", response_model=DocumentoOut)
def aggiorna_pin(
    cantiere_id: int,
    doc_id: int,
    data: PinUpdate,
    db: Session = Depends(get_db),
    user: Utente = Depends(get_current_user),
):
    _get_cantiere_con_accesso(cantiere_id, db, user)
    if not _can_write(user):
        raise HTTPException(status_code=403, detail="Non autorizzato a modificare i pin")
    doc = db.query(Documento).filter(Documento.id == doc_id, Documento.cantiere_id == cantiere_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Documento non trovato")
    doc.pin_dati = data.pin_dati
    db.commit()
    db.refresh(doc)
    return doc

@router.get("/{cantiere_id}/documenti/{doc_id}/debug")
def debug_documento(cantiere_id: int, doc_id: int, db: Session = Depends(get_db), user: Utente = Depends(get_current_user)):
    """Debug: mostra info sul file senza scaricarlo."""
    doc = db.query(Documento).filter(Documento.id == doc_id, Documento.cantiere_id == cantiere_id).first()
    if not doc:
        return {"errore": "documento non trovato nel DB"}
    rel = doc.url.removeprefix("/uploads/")
    percorso = os.path.join(settings.UPLOAD_DIR, rel)
    try:
        import fitz
        fitz_ok = True
        fitz_ver = fitz.__version__
    except ImportError as e:
        fitz_ok = False
        fitz_ver = str(e)
    return {
        "doc_url": doc.url,
        "rel_path": rel,
        "percorso_assoluto": percorso,
        "file_esiste": os.path.exists(percorso),
        "upload_dir": settings.UPLOAD_DIR,
        "tipo": doc.tipo,
        "pymupdf_disponibile": fitz_ok,
        "pymupdf_versione": fitz_ver,
        "contenuto_upload_dir": os.listdir(settings.UPLOAD_DIR) if os.path.exists(settings.UPLOAD_DIR) else "cartella non esiste",
    }

@router.get("/{cantiere_id}/documenti/{doc_id}/preview")
def preview_documento(
    cantiere_id: int,
    doc_id: int,
    db: Session = Depends(get_db),
    user: Utente = Depends(get_current_user),
):
    """Restituisce la prima pagina del PDF come PNG, oppure l'immagine originale."""
    _get_cantiere_con_accesso(cantiere_id, db, user)
    doc = db.query(Documento).filter(Documento.id == doc_id, Documento.cantiere_id == cantiere_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Documento non trovato")

    percorso = os.path.join(settings.UPLOAD_DIR, doc.url.removeprefix("/uploads/"))
    if not os.path.exists(percorso):
        raise HTTPException(status_code=404, detail="File non trovato")

    tipo = (doc.tipo or "").lower()

    # Immagini: restituisci direttamente
    if tipo in ("jpg", "jpeg", "png", "gif", "webp"):
        media_type = "image/jpeg" if tipo in ("jpg", "jpeg") else f"image/{tipo}"
        return FileResponse(percorso, media_type=media_type)

    # PDF: converti prima pagina in PNG
    if tipo == "pdf":
        preview_path = percorso + "_preview.png"
        if not os.path.exists(preview_path):
            try:
                import fitz  # PyMuPDF
                pdf = fitz.open(percorso)
                pagina = pdf[0]
                mat = fitz.Matrix(2.0, 2.0)  # 2x zoom per buona qualità
                pix = pagina.get_pixmap(matrix=mat)
                pix.save(preview_path)
                pdf.close()
            except Exception as e:
                raise HTTPException(status_code=500, detail=f"Errore conversione PDF: {e}")
        return FileResponse(preview_path, media_type="image/png")

    # DXF e altri: non supportato come immagine
    raise HTTPException(status_code=415, detail="Tipo non supportato per anteprima")

@router.delete("/{cantiere_id}/documenti/{doc_id}", status_code=204)
def elimina_documento(
    cantiere_id: int,
    doc_id: int,
    db: Session = Depends(get_db),
    user: Utente = Depends(get_current_user),
):
    _get_cantiere_con_accesso(cantiere_id, db, user)
    if user.ruolo not in (RuoloUtente.admin, RuoloUtente.capo_cantiere):
        raise HTTPException(status_code=403, detail="Solo admin e capo cantiere possono eliminare documenti")
    doc = db.query(Documento).filter(Documento.id == doc_id, Documento.cantiere_id == cantiere_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Documento non trovato")
    # rimuovi file fisico
    percorso = os.path.join(settings.UPLOAD_DIR, doc.url.removeprefix("/uploads/"))
    if os.path.exists(percorso):
        os.remove(percorso)
    db.delete(doc)
    db.commit()
