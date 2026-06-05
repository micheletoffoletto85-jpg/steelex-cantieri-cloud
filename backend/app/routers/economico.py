from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import date
import os
from app.database import get_db
from app.models.economico import OrdineAcquisto, FatturaFornitore, SAL, StatoOrdine, StatoFattura, StatoSAL, CategoriaOrdine
from app.models.cantiere import Cantiere
from app.models.utente import RuoloUtente, Utente
from app.auth import get_current_user
from app.storage import salva_file
from pydantic import BaseModel

router = APIRouter(prefix="/cantieri", tags=["Economico"])


def _check_accesso(cantiere_id: int, db: Session, user: Utente) -> Cantiere:
    cantiere = db.query(Cantiere).filter(Cantiere.id == cantiere_id).first()
    if not cantiere:
        raise HTTPException(status_code=404, detail="Cantiere non trovato")
    if user.ruolo == RuoloUtente.admin:
        return cantiere
    if user.ruolo == RuoloUtente.capo_cantiere and cantiere.responsabile_id == user.id:
        return cantiere
    if user.ruolo == RuoloUtente.fornitore:
        return cantiere  # sola lettura
    raise HTTPException(status_code=403, detail="Accesso negato")

def _solo_admin_capo(user: Utente):
    if user.ruolo not in (RuoloUtente.admin, RuoloUtente.capo_cantiere):
        raise HTTPException(status_code=403, detail="Non autorizzato")

# ─── SCHEMAS ──────────────────────────────────────────────────────────────────

class OrdineOut(BaseModel):
    id: int
    cantiere_id: int
    fornitore_id: Optional[int]
    fornitore_nome: str
    descrizione: str
    categoria: str
    importo: float
    iva_perc: float
    importo_totale: float
    stato: str
    data_ordine: Optional[date]
    data_consegna_prevista: Optional[date]
    note: Optional[str]
    creato_il: Optional[str]
    class Config:
        from_attributes = True

class OrdineCreate(BaseModel):
    fornitore_nome: str
    fornitore_id: Optional[int] = None
    descrizione: str
    categoria: str = "materiali"
    importo: float
    iva_perc: float = 22.0
    stato: str = "bozza"
    data_ordine: Optional[date] = None
    data_consegna_prevista: Optional[date] = None
    note: Optional[str] = None

class OrdineUpdate(BaseModel):
    fornitore_nome: Optional[str] = None
    descrizione: Optional[str] = None
    categoria: Optional[str] = None
    importo: Optional[float] = None
    iva_perc: Optional[float] = None
    stato: Optional[str] = None
    data_ordine: Optional[date] = None
    data_consegna_prevista: Optional[date] = None
    note: Optional[str] = None

class FatturaOut(BaseModel):
    id: int
    cantiere_id: int
    ordine_id: Optional[int]
    fornitore_nome: str
    numero_fattura: Optional[str]
    descrizione: Optional[str]
    importo_netto: float
    iva_perc: float
    importo_iva: float
    importo_totale: float
    data_fattura: Optional[date]
    data_scadenza: Optional[date]
    stato: str
    pdf_url: Optional[str]
    creato_il: Optional[str]
    class Config:
        from_attributes = True

class FatturaCreate(BaseModel):
    fornitore_nome: str
    ordine_id: Optional[int] = None
    numero_fattura: Optional[str] = None
    descrizione: Optional[str] = None
    importo_netto: float
    iva_perc: float = 22.0
    data_fattura: Optional[date] = None
    data_scadenza: Optional[date] = None
    stato: str = "ricevuta"

class FatturaUpdate(BaseModel):
    stato: Optional[str] = None
    numero_fattura: Optional[str] = None
    data_scadenza: Optional[date] = None
    note: Optional[str] = None

class SALOut(BaseModel):
    id: int
    cantiere_id: int
    numero: int
    titolo: str
    percentuale: float
    importo: float
    data: Optional[date]
    stato: str
    note: Optional[str]
    creato_il: Optional[str]
    class Config:
        from_attributes = True

class SALCreate(BaseModel):
    titolo: str
    percentuale: float
    importo: float
    data: Optional[date] = None
    stato: str = "bozza"
    note: Optional[str] = None

class SALUpdate(BaseModel):
    titolo: Optional[str] = None
    percentuale: Optional[float] = None
    importo: Optional[float] = None
    data: Optional[date] = None
    stato: Optional[str] = None
    note: Optional[str] = None

class EconomiaOverview(BaseModel):
    budget: float
    impegnato: float        # ordini confermati + evasi
    spesa_reale: float      # fatture pagate
    fatturato: float        # SAL emessi + pagati
    da_incassare: float     # SAL emessi non pagati
    margine: float          # budget - spesa_reale


# ─── OVERVIEW ─────────────────────────────────────────────────────────────────

@router.get("/{cantiere_id}/economia", response_model=EconomiaOverview)
def overview_economia(cantiere_id: int, db: Session = Depends(get_db), user: Utente = Depends(get_current_user)):
    cantiere = _check_accesso(cantiere_id, db, user)

    ordini = db.query(OrdineAcquisto).filter(OrdineAcquisto.cantiere_id == cantiere_id).all()
    fatture = db.query(FatturaFornitore).filter(FatturaFornitore.cantiere_id == cantiere_id).all()
    sal_list = db.query(SAL).filter(SAL.cantiere_id == cantiere_id).all()

    impegnato = sum(o.importo_totale for o in ordini if o.stato in ("confermato", "evaso"))
    spesa_reale = sum(f.importo_totale for f in fatture if f.stato == "pagata")
    fatturato = sum(s.importo for s in sal_list if s.stato in ("emesso", "pagato"))
    da_incassare = sum(s.importo for s in sal_list if s.stato == "emesso")

    return EconomiaOverview(
        budget=cantiere.budget or 0,
        impegnato=impegnato,
        spesa_reale=spesa_reale,
        fatturato=fatturato,
        da_incassare=da_incassare,
        margine=(cantiere.budget or 0) - spesa_reale,
    )


# ─── ORDINI ───────────────────────────────────────────────────────────────────

@router.get("/{cantiere_id}/ordini", response_model=List[OrdineOut])
def lista_ordini(cantiere_id: int, db: Session = Depends(get_db), user: Utente = Depends(get_current_user)):
    _check_accesso(cantiere_id, db, user)
    return db.query(OrdineAcquisto).filter(OrdineAcquisto.cantiere_id == cantiere_id).order_by(OrdineAcquisto.creato_il.desc()).all()

@router.post("/{cantiere_id}/ordini", response_model=OrdineOut, status_code=201)
def crea_ordine(cantiere_id: int, data: OrdineCreate, db: Session = Depends(get_db), user: Utente = Depends(get_current_user)):
    _check_accesso(cantiere_id, db, user)
    _solo_admin_capo(user)
    importo_totale = round(data.importo * (1 + data.iva_perc / 100), 2)
    ordine = OrdineAcquisto(
        cantiere_id=cantiere_id, creato_da=user.id,
        importo_totale=importo_totale,
        **data.model_dump()
    )
    db.add(ordine); db.commit(); db.refresh(ordine)
    return ordine

@router.put("/{cantiere_id}/ordini/{ordine_id}", response_model=OrdineOut)
def aggiorna_ordine(cantiere_id: int, ordine_id: int, data: OrdineUpdate, db: Session = Depends(get_db), user: Utente = Depends(get_current_user)):
    _check_accesso(cantiere_id, db, user)
    _solo_admin_capo(user)
    ordine = db.query(OrdineAcquisto).filter(OrdineAcquisto.id == ordine_id, OrdineAcquisto.cantiere_id == cantiere_id).first()
    if not ordine:
        raise HTTPException(status_code=404, detail="Ordine non trovato")
    for k, v in data.model_dump(exclude_none=True).items():
        setattr(ordine, k, v)
    if data.importo is not None or data.iva_perc is not None:
        ordine.importo_totale = round(ordine.importo * (1 + ordine.iva_perc / 100), 2)
    db.commit(); db.refresh(ordine)
    return ordine

@router.delete("/{cantiere_id}/ordini/{ordine_id}", status_code=204)
def elimina_ordine(cantiere_id: int, ordine_id: int, db: Session = Depends(get_db), user: Utente = Depends(get_current_user)):
    _check_accesso(cantiere_id, db, user)
    _solo_admin_capo(user)
    ordine = db.query(OrdineAcquisto).filter(OrdineAcquisto.id == ordine_id, OrdineAcquisto.cantiere_id == cantiere_id).first()
    if not ordine:
        raise HTTPException(status_code=404, detail="Ordine non trovato")
    db.delete(ordine); db.commit()


# ─── FATTURE ──────────────────────────────────────────────────────────────────

@router.get("/{cantiere_id}/fatture", response_model=List[FatturaOut])
def lista_fatture(cantiere_id: int, db: Session = Depends(get_db), user: Utente = Depends(get_current_user)):
    _check_accesso(cantiere_id, db, user)
    return db.query(FatturaFornitore).filter(FatturaFornitore.cantiere_id == cantiere_id).order_by(FatturaFornitore.creato_il.desc()).all()

@router.post("/{cantiere_id}/fatture", response_model=FatturaOut, status_code=201)
def crea_fattura(cantiere_id: int, data: FatturaCreate, db: Session = Depends(get_db), user: Utente = Depends(get_current_user)):
    _check_accesso(cantiere_id, db, user)
    _solo_admin_capo(user)
    importo_iva = round(data.importo_netto * data.iva_perc / 100, 2)
    importo_totale = round(data.importo_netto + importo_iva, 2)
    fattura = FatturaFornitore(
        cantiere_id=cantiere_id,
        importo_iva=importo_iva,
        importo_totale=importo_totale,
        **data.model_dump()
    )
    db.add(fattura); db.commit(); db.refresh(fattura)
    return fattura

@router.put("/{cantiere_id}/fatture/{fattura_id}", response_model=FatturaOut)
def aggiorna_fattura(cantiere_id: int, fattura_id: int, data: FatturaUpdate, db: Session = Depends(get_db), user: Utente = Depends(get_current_user)):
    _check_accesso(cantiere_id, db, user)
    _solo_admin_capo(user)
    fattura = db.query(FatturaFornitore).filter(FatturaFornitore.id == fattura_id, FatturaFornitore.cantiere_id == cantiere_id).first()
    if not fattura:
        raise HTTPException(status_code=404, detail="Fattura non trovata")
    for k, v in data.model_dump(exclude_none=True).items():
        setattr(fattura, k, v)
    db.commit(); db.refresh(fattura)
    return fattura

@router.post("/{cantiere_id}/fatture/{fattura_id}/pdf", response_model=FatturaOut)
async def upload_pdf_fattura(cantiere_id: int, fattura_id: int, file: UploadFile = File(...), db: Session = Depends(get_db), user: Utente = Depends(get_current_user)):
    _check_accesso(cantiere_id, db, user)
    _solo_admin_capo(user)
    fattura = db.query(FatturaFornitore).filter(FatturaFornitore.id == fattura_id, FatturaFornitore.cantiere_id == cantiere_id).first()
    if not fattura:
        raise HTTPException(status_code=404, detail="Fattura non trovata")
    ext = os.path.splitext(file.filename or "fattura.pdf")[1].lower() or ".pdf"
    contenuto = await file.read()
    url, _ = salva_file(contenuto, f"fatture/{cantiere_id}", ext)
    fattura.pdf_url = url
    db.commit(); db.refresh(fattura)
    return fattura

@router.delete("/{cantiere_id}/fatture/{fattura_id}", status_code=204)
def elimina_fattura(cantiere_id: int, fattura_id: int, db: Session = Depends(get_db), user: Utente = Depends(get_current_user)):
    _check_accesso(cantiere_id, db, user)
    _solo_admin_capo(user)
    fattura = db.query(FatturaFornitore).filter(FatturaFornitore.id == fattura_id, FatturaFornitore.cantiere_id == cantiere_id).first()
    if not fattura:
        raise HTTPException(status_code=404, detail="Fattura non trovata")
    db.delete(fattura); db.commit()


# ─── SAL ──────────────────────────────────────────────────────────────────────

@router.get("/{cantiere_id}/sal", response_model=List[SALOut])
def lista_sal(cantiere_id: int, db: Session = Depends(get_db), user: Utente = Depends(get_current_user)):
    _check_accesso(cantiere_id, db, user)
    return db.query(SAL).filter(SAL.cantiere_id == cantiere_id).order_by(SAL.numero).all()

@router.post("/{cantiere_id}/sal", response_model=SALOut, status_code=201)
def crea_sal(cantiere_id: int, data: SALCreate, db: Session = Depends(get_db), user: Utente = Depends(get_current_user)):
    _check_accesso(cantiere_id, db, user)
    _solo_admin_capo(user)
    # Numero progressivo automatico
    ultimo = db.query(SAL).filter(SAL.cantiere_id == cantiere_id).order_by(SAL.numero.desc()).first()
    numero = (ultimo.numero + 1) if ultimo else 1
    sal = SAL(cantiere_id=cantiere_id, numero=numero, **data.model_dump())
    db.add(sal); db.commit(); db.refresh(sal)
    return sal

@router.put("/{cantiere_id}/sal/{sal_id}", response_model=SALOut)
def aggiorna_sal(cantiere_id: int, sal_id: int, data: SALUpdate, db: Session = Depends(get_db), user: Utente = Depends(get_current_user)):
    _check_accesso(cantiere_id, db, user)
    _solo_admin_capo(user)
    sal = db.query(SAL).filter(SAL.id == sal_id, SAL.cantiere_id == cantiere_id).first()
    if not sal:
        raise HTTPException(status_code=404, detail="SAL non trovato")
    for k, v in data.model_dump(exclude_none=True).items():
        setattr(sal, k, v)
    db.commit(); db.refresh(sal)
    return sal

@router.delete("/{cantiere_id}/sal/{sal_id}", status_code=204)
def elimina_sal(cantiere_id: int, sal_id: int, db: Session = Depends(get_db), user: Utente = Depends(get_current_user)):
    _check_accesso(cantiere_id, db, user)
    _solo_admin_capo(user)
    sal = db.query(SAL).filter(SAL.id == sal_id, SAL.cantiere_id == cantiere_id).first()
    if not sal:
        raise HTTPException(status_code=404, detail="SAL non trovato")
    db.delete(sal); db.commit()
