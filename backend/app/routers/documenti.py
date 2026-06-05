import os
import tempfile
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import Response
from sqlalchemy.orm import Session
from typing import List, Optional, Any
from app.database import get_db
from app.models.documento import Documento
from app.models.cantiere import Cantiere
from app.models.utente import RuoloUtente, Utente
from app.auth import get_current_user
from app.config import settings
from app.storage import salva_file, leggi_file, elimina_file
from pydantic import BaseModel

router = APIRouter(prefix="/cantieri", tags=["Documenti"])

ESTENSIONI_CONSENTITE = {".jpg", ".jpeg", ".png", ".gif", ".pdf", ".webp"}

def _get_cantiere_con_accesso(cantiere_id: int, db: Session, user: Utente) -> Cantiere:
    cantiere = db.query(Cantiere).filter(Cantiere.id == cantiere_id).first()
    if not cantiere:
        raise HTTPException(status_code=404, detail="Cantiere non trovato")
    if user.ruolo == RuoloUtente.admin:
        return cantiere
    if user.ruolo == RuoloUtente.capo_cantiere and cantiere.responsabile_id == user.id:
        return cantiere
    if user.ruolo in (RuoloUtente.fornitore, RuoloUtente.cliente):
        return cantiere
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

    tipo = ext.lstrip(".")
    url, chiave = salva_file(contenuto, f"documenti/{cantiere_id}", ext)

    doc = Documento(
        cantiere_id=cantiere_id,
        nome=file.filename or chiave,
        tipo=tipo,
        url=url,
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

@router.get("/{cantiere_id}/documenti/{doc_id}/preview")
def preview_documento(
    cantiere_id: int,
    doc_id: int,
    db: Session = Depends(get_db),
    user: Utente = Depends(get_current_user),
):
    _get_cantiere_con_accesso(cantiere_id, db, user)
    doc = db.query(Documento).filter(Documento.id == doc_id, Documento.cantiere_id == cantiere_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Documento non trovato")

    tipo = (doc.tipo or "").lower()

    # Immagini su R2: scarica lato server e restituisci direttamente (evita CORS)
    if doc.url.startswith("http") and tipo in ("jpg", "jpeg", "png", "gif", "webp"):
        try:
            import urllib.request
            with urllib.request.urlopen(doc.url, timeout=10) as resp:
                data = resp.read()
            ct = "image/jpeg" if tipo in ("jpg", "jpeg") else f"image/{tipo}"
            return Response(content=data, media_type=ct)
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"Errore lettura file R2: {e}")

    # Per PDF (da R2 o locale): converti prima pagina in PNG
    if tipo == "pdf":
        try:
            contenuto, _ = leggi_file(_chiave_da_url(doc.url))
        except Exception as e:
            raise HTTPException(status_code=404, detail=f"File non trovato: {e}")

        # Cache PNG su disco locale
        cache_key = f"preview_{doc.id}.png"
        cache_path = os.path.join(settings.UPLOAD_DIR, "cache", cache_key)
        os.makedirs(os.path.dirname(cache_path), exist_ok=True)

        if not os.path.exists(cache_path):
            try:
                import fitz
                with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
                    tmp.write(contenuto)
                    tmp_path = tmp.name
                pdf = fitz.open(tmp_path)
                pix = pdf[0].get_pixmap(matrix=fitz.Matrix(1.2, 1.2))
                pix.save(cache_path)
                pdf.close()
                os.unlink(tmp_path)
            except Exception as e:
                raise HTTPException(status_code=500, detail=f"Errore conversione PDF: {e}")

        with open(cache_path, "rb") as f:
            png_data = f.read()
        return Response(content=png_data, media_type="image/png")

    # Immagini da filesystem locale
    if tipo in ("jpg", "jpeg", "png", "gif", "webp"):
        try:
            contenuto, content_type = leggi_file(_chiave_da_url(doc.url))
            return Response(content=contenuto, media_type=content_type)
        except Exception as e:
            raise HTTPException(status_code=404, detail=f"File non trovato: {e}")

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
    elimina_file(_chiave_da_url(doc.url))
    db.delete(doc)
    db.commit()

def _chiave_da_url(url: str) -> str:
    """Estrae chiave R2 o percorso locale dall'URL salvata nel DB."""
    if url.startswith("http"):
        # URL R2 pubblica: https://pub-xxx.r2.dev/documenti/1/file.pdf
        # Ritorna solo la chiave (parte dopo il dominio)
        from urllib.parse import urlparse
        return urlparse(url).path.lstrip("/")
    # URL locale: /uploads/documenti/1/file.pdf
    percorso_rel = url.removeprefix("/uploads/")
    return os.path.join(settings.UPLOAD_DIR, percorso_rel)
