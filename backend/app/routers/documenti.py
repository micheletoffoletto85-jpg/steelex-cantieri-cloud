import os
import tempfile
from datetime import datetime
from app.routers.notifiche import invia_notifica, notifica_cantiere
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import Response
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified
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

ESTENSIONI_CONSENTITE = {".jpg", ".jpeg", ".png", ".gif", ".pdf", ".webp", ".heic", ".heif", ".dxf", ".dwg"}
RUOLI_VALIDI = {"admin", "capo_cantiere", "capo_cantiere_sub", "direzione_lavori", "artigiano", "fornitore", "cliente"}

# Mappa content-type → estensione di fallback (per upload da mobile senza filename)
_CT_TO_EXT = {
    "image/jpeg": ".jpg", "image/jpg": ".jpg",
    "image/png": ".png", "image/gif": ".gif",
    "image/webp": ".webp", "image/heic": ".heic", "image/heif": ".heif",
    "application/pdf": ".pdf",
}

def _risolvi_ext(file: UploadFile, default: str = ".jpg") -> str:
    """Ricava l'estensione dal filename; se assente, usa il content-type; poi il default."""
    ext = os.path.splitext(file.filename or "")[1].lower()
    if not ext and file.content_type:
        ext = _CT_TO_EXT.get(file.content_type.lower().split(";")[0].strip(), "")
    return ext or default

# ─── AUTORIZZAZIONI ───────────────────────────────────────────────────────────

def _get_cantiere_con_accesso(cantiere_id: int, db: Session, user: Utente) -> Cantiere:
    cantiere = db.query(Cantiere).filter(Cantiere.id == cantiere_id).first()
    if not cantiere:
        raise HTTPException(status_code=404, detail="Cantiere non trovato")
    if user.ruolo == RuoloUtente.admin:
        return cantiere
    if user.ruolo == RuoloUtente.capo_cantiere and cantiere.responsabile_id == user.id:
        return cantiere
    # capo_cantiere_sub, direzione_lavori, artigiano, fornitore, cliente: solo se assegnati
    if user.id in [u.id for u in cantiere.artigiani]:
        return cantiere
    if user.ruolo in (RuoloUtente.fornitore, RuoloUtente.cliente):
        return cantiere
    raise HTTPException(status_code=403, detail="Accesso negato al cantiere")

def _can_write(user: Utente) -> bool:
    """Può caricare documenti e aggiungere pin."""
    return user.ruolo in (RuoloUtente.admin, RuoloUtente.capo_cantiere, RuoloUtente.capo_cantiere_sub, RuoloUtente.direzione_lavori)

def _can_contribute(user: Utente) -> bool:
    """Può aggiungere report e foto ai pin (anche fornitore)."""
    return user.ruolo in (RuoloUtente.admin, RuoloUtente.capo_cantiere, RuoloUtente.capo_cantiere_sub, RuoloUtente.direzione_lavori, RuoloUtente.fornitore)

def _pin_visibile(pin: dict, user: Utente) -> bool:
    """Controlla se il pin è visibile per questo utente."""
    ruolo = user.ruolo.value
    visibilita = pin.get("visibilita", ["admin", "capo_cantiere", "fornitore", "cliente"])
    # Se il pin è assegnato a un utente specifico (per ID)
    if pin.get("assegnato_a_user_id") and str(pin["assegnato_a_user_id"]) == str(user.id):
        return True
    # Visibilità per membro specifico (user_{id})
    if f"user_{user.id}" in visibilita:
        return True
    # Visibilità per ruolo
    if ruolo in visibilita:
        return True
    # Fornitore vede i pin assegnati al ruolo fornitore generico
    if ruolo == "fornitore" and pin.get("assegnato_a") == "fornitore":
        return True
    return False

def _filtra_pin(pins: list, user: Utente) -> list:
    if user.ruolo in (RuoloUtente.admin, RuoloUtente.capo_cantiere, RuoloUtente.capo_cantiere_sub, RuoloUtente.direzione_lavori):
        return pins
    return [p for p in pins if _pin_visibile(p, user)]

def _get_pin(doc: Documento, pin_id: int) -> Optional[dict]:
    return next((p for p in (doc.pin_dati or []) if p.get("id") == pin_id), None)

def _salva_pin_dati(doc: Documento, pins: list, db: Session):
    # flag_modified obbliga SQLAlchemy a rilevare la modifica nel JSON
    doc.pin_dati = list(pins)
    flag_modified(doc, "pin_dati")
    db.commit()
    db.refresh(doc)

# ─── SCHEMAS ─────────────────────────────────────────────────────────────────

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

class PinCreate(BaseModel):
    x: float
    y: float
    tipo: str = "lavorazione"
    nota: str
    assegnato_a: str = "capo_cantiere"          # ruolo generico
    assegnato_a_user_id: Optional[int] = None   # utente specifico (opzionale)
    assegnato_a_nome: Optional[str] = None       # nome visualizzato
    visibilita: List[str] = ["admin", "capo_cantiere", "fornitore"]
    stato: str = "aperto"

class PinUpdate(BaseModel):
    pin_dati: list

class PinStatoUpdate(BaseModel):
    stato: str  # aperto, in_lavorazione, risolto

class PinModifica(BaseModel):
    tipo: Optional[str] = None
    nota: Optional[str] = None
    assegnato_a: Optional[str] = None
    assegnato_a_user_id: Optional[int] = None
    assegnato_a_nome: Optional[str] = None
    visibilita: Optional[List[str]] = None

class ReportCreate(BaseModel):
    testo: str

# ─── DOCUMENTI ───────────────────────────────────────────────────────────────

@router.get("/{cantiere_id}/documenti", response_model=List[DocumentoOut])
def lista_documenti(cantiere_id: int, db: Session = Depends(get_db), user: Utente = Depends(get_current_user)):
    _get_cantiere_con_accesso(cantiere_id, db, user)
    docs = db.query(Documento).filter(Documento.cantiere_id == cantiere_id).order_by(Documento.creato_il.desc()).all()
    # Filtra pin per ruolo
    for doc in docs:
        doc.pin_dati = _filtra_pin(doc.pin_dati or [], user)
    return docs

@router.post("/{cantiere_id}/documenti", response_model=DocumentoOut, status_code=201)
async def carica_documento(
    cantiere_id: int, file: UploadFile = File(...),
    db: Session = Depends(get_db), user: Utente = Depends(get_current_user),
):
    _get_cantiere_con_accesso(cantiere_id, db, user)
    if not _can_write(user):
        raise HTTPException(status_code=403, detail="Non autorizzato al caricamento")
    ext = _risolvi_ext(file)
    if ext not in ESTENSIONI_CONSENTITE:
        raise HTTPException(status_code=400, detail=f"Tipo file non consentito: {ext or '(sconosciuto)'}")
    contenuto = await file.read()
    if len(contenuto) > 50 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File troppo grande (max 50MB)")
    url, chiave = salva_file(contenuto, f"documenti/{cantiere_id}", ext)
    doc = Documento(
        cantiere_id=cantiere_id, nome=file.filename or chiave,
        tipo=ext.lstrip("."), url=url, dimensione=len(contenuto),
        caricato_da=user.id, pin_dati=[],
    )
    db.add(doc); db.commit(); db.refresh(doc)
    try:
        notifica_cantiere(db, cantiere_id,
            ruoli=["admin", "capo_cantiere", "direzione_lavori"],
            titolo="🗺️ Nuovo documento caricato",
            corpo=f"{user.nome} {user.cognome}: {file.filename or ''}",
            escludi_id=user.id,
        )
    except Exception: pass
    return doc

@router.post("/{cantiere_id}/documenti/multi", status_code=201)
async def carica_documenti_multipli(
    cantiere_id: int,
    files: List[UploadFile] = File(...),
    db: Session = Depends(get_db),
    user: Utente = Depends(get_current_user),
):
    """Carica più file contemporaneamente. Restituisce lista di risultati per ogni file."""
    _get_cantiere_con_accesso(cantiere_id, db, user)
    if not _can_write(user):
        raise HTTPException(status_code=403, detail="Non autorizzato al caricamento")

    MAX_FILES = 20
    if len(files) > MAX_FILES:
        raise HTTPException(status_code=400, detail=f"Massimo {MAX_FILES} file per volta")

    risultati = []
    for file in files:
        esito = {"nome": file.filename, "ok": False, "errore": None, "doc": None}
        try:
            ext = _risolvi_ext(file)
            if ext not in ESTENSIONI_CONSENTITE:
                esito["errore"] = f"Tipo file non consentito: {ext or '(sconosciuto)'}"
                risultati.append(esito)
                continue
            contenuto = await file.read()
            if len(contenuto) > 50 * 1024 * 1024:
                esito["errore"] = "File troppo grande (max 50MB)"
                risultati.append(esito)
                continue
            url, chiave = salva_file(contenuto, f"documenti/{cantiere_id}", ext)
            doc = Documento(
                cantiere_id=cantiere_id, nome=file.filename or chiave,
                tipo=ext.lstrip("."), url=url, dimensione=len(contenuto),
                caricato_da=user.id, pin_dati=[],
            )
            db.add(doc)
            db.commit()
            db.refresh(doc)
            esito["ok"] = True
            esito["doc"] = {"id": doc.id, "nome": doc.nome, "tipo": doc.tipo, "url": doc.url, "dimensione": doc.dimensione}
        except Exception as e:
            db.rollback()
            esito["errore"] = str(e)
        risultati.append(esito)

    caricati = sum(1 for r in risultati if r["ok"])
    return {"totale": len(files), "caricati": caricati, "falliti": len(files) - caricati, "risultati": risultati}


@router.delete("/{cantiere_id}/documenti/{doc_id}", status_code=204)
def elimina_documento(
    cantiere_id: int, doc_id: int,
    db: Session = Depends(get_db), user: Utente = Depends(get_current_user),
):
    _get_cantiere_con_accesso(cantiere_id, db, user)
    if not _can_write(user):
        raise HTTPException(status_code=403, detail="Non autorizzato")
    doc = db.query(Documento).filter(Documento.id == doc_id, Documento.cantiere_id == cantiere_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Documento non trovato")
    elimina_file(_chiave_da_url(doc.url))
    db.delete(doc); db.commit()

# ─── PIN ─────────────────────────────────────────────────────────────────────

@router.post("/{cantiere_id}/documenti/{doc_id}/pin", response_model=DocumentoOut)
def aggiungi_pin(
    cantiere_id: int, doc_id: int, data: PinCreate,
    db: Session = Depends(get_db), user: Utente = Depends(get_current_user),
):
    _get_cantiere_con_accesso(cantiere_id, db, user)
    if not _can_write(user):
        raise HTTPException(status_code=403, detail="Non autorizzato ad aggiungere pin")
    doc = db.query(Documento).filter(Documento.id == doc_id, Documento.cantiere_id == cantiere_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Documento non trovato")
    pin = {
        "id": int(datetime.now().timestamp() * 1000),
        "x": data.x, "y": data.y,
        "tipo": data.tipo, "nota": data.nota,
        "autore": f"{user.nome} {user.cognome}",
        "ruolo_autore": user.ruolo.value,
        "assegnato_a": data.assegnato_a,
        "assegnato_a_user_id": data.assegnato_a_user_id,
        "assegnato_a_nome": data.assegnato_a_nome,
        "visibilita": data.visibilita,
        "stato": data.stato,
        "creato_il": datetime.now().isoformat(),
        "foto_urls": [],
        "reports": [],
    }
    pins = list(doc.pin_dati or [])
    pins.append(pin)
    _salva_pin_dati(doc, pins, db)
    try:
        extra = [data.assegnato_a_user_id] if data.assegnato_a_user_id else []
        if data.tipo == "extra_preventivo":
            notifica_cantiere(db, cantiere_id,
                ruoli=["admin", "capo_cantiere", "capo_cantiere_sub", "direzione_lavori", "amministrazione"],
                titolo="⚠️ Extra preventivo segnalato",
                corpo=f"{user.nome} {user.cognome}: {(data.nota or '')[:80]}",
                escludi_id=user.id,
                extra_user_ids=extra,
                tipo="extra_preventivo",
            )
        else:
            notifica_cantiere(db, cantiere_id,
                ruoli=["admin", "capo_cantiere", "capo_cantiere_sub", "direzione_lavori"],
                titolo="📍 Nuovo pin aggiunto alla mappa",
                corpo=f"{user.nome} {user.cognome}: {(data.nota or '')[:80]}",
                escludi_id=user.id,
                extra_user_ids=extra,
                tipo="info",
            )
    except Exception: pass
    doc.pin_dati = _filtra_pin(doc.pin_dati, user)
    return doc

@router.put("/{cantiere_id}/documenti/{doc_id}/pin/{pin_id}/stato", response_model=DocumentoOut)
def aggiorna_stato_pin(
    cantiere_id: int, doc_id: int, pin_id: int, data: PinStatoUpdate,
    db: Session = Depends(get_db), user: Utente = Depends(get_current_user),
):
    _get_cantiere_con_accesso(cantiere_id, db, user)
    if not _can_write(user):
        raise HTTPException(status_code=403, detail="Non autorizzato")
    doc = db.query(Documento).filter(Documento.id == doc_id, Documento.cantiere_id == cantiere_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Documento non trovato")
    pins = list(doc.pin_dati or [])
    pin = _get_pin(doc, pin_id)
    if not pin:
        raise HTTPException(status_code=404, detail="Pin non trovato")
    pin["stato"] = data.stato
    _salva_pin_dati(doc, pins, db)

    # Notifica admin e capo cantiere quando un fornitore risolve un pin
    if data.stato == "risolto" and user.ruolo == RuoloUtente.fornitore:
        try:
            from app.models.cantiere import Cantiere as CantiereModel
            from app.models.utente import Utente as UtenteModel
            cantiere = db.query(CantiereModel).filter(CantiereModel.id == cantiere_id).first()
            destinatari = db.query(UtenteModel).filter(
                UtenteModel.ruolo.in_(["admin", "capo_cantiere", "capo_cantiere_sub", "direzione_lavori"]),
                UtenteModel.attivo == True
            ).all()
            invia_notifica(db, [u.id for u in destinatari],
                titolo="✅ Lavorazione completata",
                corpo=f"{user.nome} {user.cognome}: {pin.get('nota','')[:60]}",
                url=f"/cantieri/{cantiere_id}",
            )
        except Exception:
            pass  # notifica fallita, non blocca la risposta

    doc.pin_dati = _filtra_pin(doc.pin_dati, user)
    return doc

@router.patch("/{cantiere_id}/documenti/{doc_id}/pin/{pin_id}", response_model=DocumentoOut)
def modifica_pin(
    cantiere_id: int, doc_id: int, pin_id: int, data: PinModifica,
    db: Session = Depends(get_db), user: Utente = Depends(get_current_user),
):
    """Modifica contenuto e assegnazione di un pin esistente."""
    _get_cantiere_con_accesso(cantiere_id, db, user)
    if not _can_write(user):
        raise HTTPException(status_code=403, detail="Non autorizzato")
    doc = db.query(Documento).filter(Documento.id == doc_id, Documento.cantiere_id == cantiere_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Documento non trovato")
    pins = list(doc.pin_dati or [])
    pin = _get_pin(doc, pin_id)
    if not pin:
        raise HTTPException(status_code=404, detail="Pin non trovato")
    if data.tipo is not None: pin["tipo"] = data.tipo
    if data.nota is not None: pin["nota"] = data.nota
    if data.assegnato_a is not None: pin["assegnato_a"] = data.assegnato_a
    if data.assegnato_a_user_id is not None: pin["assegnato_a_user_id"] = data.assegnato_a_user_id
    if data.assegnato_a_nome is not None: pin["assegnato_a_nome"] = data.assegnato_a_nome
    if data.visibilita is not None: pin["visibilita"] = data.visibilita
    _salva_pin_dati(doc, pins, db)
    doc.pin_dati = _filtra_pin(doc.pin_dati, user)
    return doc

@router.delete("/{cantiere_id}/documenti/{doc_id}/pin/{pin_id}", response_model=DocumentoOut)
def elimina_pin(
    cantiere_id: int, doc_id: int, pin_id: int,
    db: Session = Depends(get_db), user: Utente = Depends(get_current_user),
):
    _get_cantiere_con_accesso(cantiere_id, db, user)
    if not _can_write(user):
        raise HTTPException(status_code=403, detail="Non autorizzato")
    doc = db.query(Documento).filter(Documento.id == doc_id, Documento.cantiere_id == cantiere_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Documento non trovato")
    pins = [p for p in (doc.pin_dati or []) if p.get("id") != pin_id]
    _salva_pin_dati(doc, pins, db)
    doc.pin_dati = _filtra_pin(doc.pin_dati, user)
    return doc

# ─── PIN FOTO ────────────────────────────────────────────────────────────────

@router.post("/{cantiere_id}/documenti/{doc_id}/pin/{pin_id}/foto", response_model=DocumentoOut)
async def upload_foto_pin(
    cantiere_id: int, doc_id: int, pin_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db), user: Utente = Depends(get_current_user),
):
    _get_cantiere_con_accesso(cantiere_id, db, user)
    if not _can_contribute(user):
        raise HTTPException(status_code=403, detail="Non autorizzato")
    doc = db.query(Documento).filter(Documento.id == doc_id, Documento.cantiere_id == cantiere_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Documento non trovato")
    pin = _get_pin(doc, pin_id)
    if not pin:
        raise HTTPException(status_code=404, detail="Pin non trovato")
    # Fornitore può caricare solo su pin assegnati a lui
    if user.ruolo == RuoloUtente.fornitore and pin.get("assegnato_a") != "fornitore":
        raise HTTPException(status_code=403, detail="Pin non assegnato a te")
    ext = _risolvi_ext(file, default=".jpg")
    contenuto = await file.read()
    url, _ = salva_file(contenuto, f"pin-foto/{cantiere_id}", ext)
    pin.setdefault("foto_urls", []).append(url)
    _salva_pin_dati(doc, doc.pin_dati, db)
    doc.pin_dati = _filtra_pin(doc.pin_dati, user)
    return doc

@router.delete("/{cantiere_id}/documenti/{doc_id}/pin/{pin_id}/foto", response_model=DocumentoOut)
async def elimina_foto_pin(
    cantiere_id: int, doc_id: int, pin_id: int,
    idx: int,
    db: Session = Depends(get_db), user: Utente = Depends(get_current_user),
):
    """Elimina una foto dal pin per indice."""
    _get_cantiere_con_accesso(cantiere_id, db, user)
    if not _can_contribute(user):
        raise HTTPException(status_code=403, detail="Non autorizzato")
    doc = db.query(Documento).filter(Documento.id == doc_id, Documento.cantiere_id == cantiere_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Documento non trovato")
    pin = _get_pin(doc, pin_id)
    if not pin:
        raise HTTPException(status_code=404, detail="Pin non trovato")
    urls = list(pin.get("foto_urls") or [])
    if idx < 0 or idx >= len(urls):
        raise HTTPException(status_code=400, detail="Indice foto non valido")
    urls.pop(idx)
    pin["foto_urls"] = urls
    _salva_pin_dati(doc, doc.pin_dati, db)
    doc.pin_dati = _filtra_pin(doc.pin_dati, user)
    return doc


@router.post("/{cantiere_id}/documenti/{doc_id}/pin/{pin_id}/annota", response_model=DocumentoOut)
async def annota_foto_pin(
    cantiere_id: int, doc_id: int, pin_id: int,
    idx: int,
    overlay: UploadFile = File(...),
    db: Session = Depends(get_db), user: Utente = Depends(get_current_user),
):
    """Composita overlay (PNG trasparente) con la foto originale lato server."""
    _get_cantiere_con_accesso(cantiere_id, db, user)
    if not _can_contribute(user):
        raise HTTPException(status_code=403, detail="Non autorizzato")
    doc = db.query(Documento).filter(Documento.id == doc_id, Documento.cantiere_id == cantiere_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Documento non trovato")
    pin = _get_pin(doc, pin_id)
    if not pin:
        raise HTTPException(status_code=404, detail="Pin non trovato")
    urls = list(pin.get("foto_urls") or [])
    if idx < 0 or idx >= len(urls):
        raise HTTPException(status_code=400, detail="Indice foto non valido")

    try:
        from PIL import Image as PILImage
        import io, httpx
        orig_url = urls[idx]
        # Scarica immagine originale (R2 pubblica o locale)
        if orig_url.startswith("http"):
            resp = httpx.get(orig_url, timeout=15)
            orig_bytes = resp.content
        else:
            from app.storage import leggi_file
            orig_bytes, _ = leggi_file(orig_url.lstrip("/uploads/"))
        from PIL import ImageOps
        overlay_bytes = await overlay.read()
        # exif_transpose applica la rotazione EXIF ai pixel → allinea con ciò che il browser mostra
        base = ImageOps.exif_transpose(PILImage.open(io.BytesIO(orig_bytes))).convert("RGBA")
        over = PILImage.open(io.BytesIO(overlay_bytes)).convert("RGBA")
        # l'overlay ha già le dimensioni del browser (post-EXIF), quindi il resize è corretto
        over = over.resize(base.size, PILImage.LANCZOS)
        base.alpha_composite(over)
        out = io.BytesIO()
        base.convert("RGB").save(out, format="JPEG", quality=90)
        url_nuova, _ = salva_file(out.getvalue(), f"pin-foto/{cantiere_id}", ".jpg")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore compositing: {e}")

    urls[idx] = url_nuova
    pin["foto_urls"] = urls
    _salva_pin_dati(doc, doc.pin_dati, db)
    doc.pin_dati = _filtra_pin(doc.pin_dati, user)
    return doc


# ─── PIN REPORT ──────────────────────────────────────────────────────────────

@router.post("/{cantiere_id}/documenti/{doc_id}/pin/{pin_id}/report", response_model=DocumentoOut)
def aggiungi_report_pin(
    cantiere_id: int, doc_id: int, pin_id: int, data: ReportCreate,
    db: Session = Depends(get_db), user: Utente = Depends(get_current_user),
):
    _get_cantiere_con_accesso(cantiere_id, db, user)
    if not _can_contribute(user):
        raise HTTPException(status_code=403, detail="Non autorizzato")
    doc = db.query(Documento).filter(Documento.id == doc_id, Documento.cantiere_id == cantiere_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Documento non trovato")
    pin = _get_pin(doc, pin_id)
    if not pin:
        raise HTTPException(status_code=404, detail="Pin non trovato")
    # Fornitore solo su pin assegnati a lui
    if user.ruolo == RuoloUtente.fornitore and pin.get("assegnato_a") != "fornitore":
        raise HTTPException(status_code=403, detail="Pin non assegnato a te")
    report = {
        "id": int(datetime.now().timestamp() * 1000),
        "testo": data.testo,
        "autore": f"{user.nome} {user.cognome}",
        "ruolo": user.ruolo.value,
        "data": datetime.now().isoformat(),
    }
    pin.setdefault("reports", []).append(report)
    _salva_pin_dati(doc, doc.pin_dati, db)

    # Notifica admin e capo cantiere quando il fornitore aggiunge un report
    if user.ruolo == RuoloUtente.fornitore:
        try:
            from app.models.utente import Utente as UtenteModel
            destinatari = db.query(UtenteModel).filter(
                UtenteModel.ruolo.in_(["admin", "capo_cantiere", "capo_cantiere_sub", "direzione_lavori"]),
                UtenteModel.attivo == True
            ).all()
            invia_notifica(db, [u.id for u in destinatari],
                titolo=f"💬 Aggiornamento da {user.nome} {user.cognome}",
                corpo=f"{data.testo[:80]} — Pin: {pin.get('nota','')[:40]}",
                url=f"/cantieri/{cantiere_id}",
            )
        except Exception:
            pass

    doc.pin_dati = _filtra_pin(doc.pin_dati, user)
    return doc

# ─── PREVIEW ─────────────────────────────────────────────────────────────────

@router.get("/{cantiere_id}/documenti/{doc_id}/preview")
def preview_documento(
    cantiere_id: int, doc_id: int,
    db: Session = Depends(get_db), user: Utente = Depends(get_current_user),
):
    _get_cantiere_con_accesso(cantiere_id, db, user)
    doc = db.query(Documento).filter(Documento.id == doc_id, Documento.cantiere_id == cantiere_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Documento non trovato")
    tipo = (doc.tipo or "").lower()

    # Mappa tipo → content-type HTTP
    _MIME = {
        "jpg": "image/jpeg", "jpeg": "image/jpeg",
        "png": "image/png", "gif": "image/gif",
        "webp": "image/webp", "heic": "image/heic", "heif": "image/heif",
        "pdf": "application/pdf",
    }

    if tipo in ("jpg", "jpeg", "png", "gif", "webp", "heic", "heif"):
        try:
            # leggi_file gestisce sia R2 (chiave relativa) che filesystem (percorso assoluto)
            chiave = _chiave_da_url(doc.url)
            contenuto, ct = leggi_file(chiave)
            # Forza content-type corretto (leggi_file potrebbe restituire octet-stream)
            ct = _MIME.get(tipo, ct)
            return Response(content=contenuto, media_type=ct)
        except Exception as e:
            raise HTTPException(status_code=404, detail=f"Immagine non trovata: {e}")

    if tipo == "pdf":
        try:
            chiave = _chiave_da_url(doc.url)
            contenuto, _ = leggi_file(chiave)
        except Exception as e:
            raise HTTPException(status_code=404, detail=f"PDF non trovato: {e}")
        cache_path = os.path.join(settings.UPLOAD_DIR, "cache", f"preview_{doc.id}.png")
        os.makedirs(os.path.dirname(cache_path), exist_ok=True)
        if not os.path.exists(cache_path):
            try:
                import fitz
                with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
                    tmp.write(contenuto); tmp_path = tmp.name
                pdf = fitz.open(tmp_path)
                pix = pdf[0].get_pixmap(matrix=fitz.Matrix(1.2, 1.2))
                pix.save(cache_path); pdf.close(); os.unlink(tmp_path)
            except Exception as e:
                raise HTTPException(status_code=500, detail=f"Errore conversione PDF: {e}")
        with open(cache_path, "rb") as f:
            return Response(content=f.read(), media_type="image/png")

    raise HTTPException(status_code=415, detail=f"Tipo non supportato per anteprima: {tipo}")

# ─── HELPER ──────────────────────────────────────────────────────────────────

def _chiave_da_url(url: str) -> str:
    if url.startswith("http"):
        from urllib.parse import urlparse
        return urlparse(url).path.lstrip("/")
    return os.path.join(settings.UPLOAD_DIR, url.removeprefix("/uploads/"))
