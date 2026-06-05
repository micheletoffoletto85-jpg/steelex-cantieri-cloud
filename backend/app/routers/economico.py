from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import date
import os
from app.database import get_db
from app.models.economico import OrdineAcquisto, FatturaFornitore, SAL, StatoOrdine, StatoFattura, StatoSAL, CategoriaOrdine, PreventivoCantiere, BollaConsegna, StatoPreventivo, StatoBolla, FaseLavoro, StatoFase
from typing import Any
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

def _blocca_cliente(user: Utente):
    """Il cliente non ha accesso al modulo economico."""
    if user.ruolo == RuoloUtente.cliente:
        raise HTTPException(status_code=403, detail="Dati economici non accessibili")

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
    _blocca_cliente(user)

    ordini = db.query(OrdineAcquisto).filter(OrdineAcquisto.cantiere_id == cantiere_id).all()
    fatture = db.query(FatturaFornitore).filter(FatturaFornitore.cantiere_id == cantiere_id).all()
    sal_list = db.query(SAL).filter(SAL.cantiere_id == cantiere_id).all()

    preventivi = db.query(PreventivoCantiere).filter(PreventivoCantiere.cantiere_id == cantiere_id).all()
    bolle = db.query(BollaConsegna).filter(BollaConsegna.cantiere_id == cantiere_id).all()

    impegnato = sum(o.importo_totale for o in ordini if o.stato in ("confermato", "evaso"))
    spesa_reale = sum(f.importo_totale for f in fatture if f.stato == "pagata")
    spesa_bolle = sum(b.importo_stimato for b in bolle if b.stato == "aperta")
    fatturato = sum(s.importo for s in sal_list if s.stato in ("emesso", "pagato"))
    da_incassare = sum(s.importo for s in sal_list if s.stato == "emesso")
    # Preventivo accettato = ricavo atteso
    prev_accettato = next((p for p in preventivi if p.stato == "accettato"), None)
    ricavo_atteso = prev_accettato.totale if prev_accettato else (cantiere.budget or 0)

    return EconomiaOverview(
        budget=ricavo_atteso,
        impegnato=impegnato,
        spesa_reale=spesa_reale + spesa_bolle,
        fatturato=fatturato,
        da_incassare=da_incassare,
        margine=ricavo_atteso - (spesa_reale + spesa_bolle),
    )


# ─── ORDINI ───────────────────────────────────────────────────────────────────

@router.get("/{cantiere_id}/ordini", response_model=List[OrdineOut])
def lista_ordini(cantiere_id: int, db: Session = Depends(get_db), user: Utente = Depends(get_current_user)):
    _check_accesso(cantiere_id, db, user)
    _blocca_cliente(user)
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
    _blocca_cliente(user)
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
    _blocca_cliente(user)
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


# ─── PREVENTIVI ───────────────────────────────────────────────────────────────

class PreventivoOut(BaseModel):
    id: int
    cantiere_id: int
    numero: Optional[str]
    data: Optional[date]
    validita_giorni: int
    voci: Any
    subtotale: float
    costo_totale: float
    iva_perc: float
    totale: float
    acconto_perc: float
    acconto_importo: float
    acconto_ricevuto: float
    data_acconto: Optional[date]
    stato: str
    pdf_url: Optional[str]
    note: Optional[str]
    creato_il: Optional[str]
    class Config:
        from_attributes = True

class PreventivoCreate(BaseModel):
    numero: Optional[str] = None
    data: Optional[date] = None
    validita_giorni: int = 30
    voci: list = []
    iva_perc: float = 22.0
    acconto_perc: float = 30.0
    note: Optional[str] = None

class PreventivoUpdate(BaseModel):
    numero: Optional[str] = None
    data: Optional[date] = None
    voci: Optional[list] = None
    iva_perc: Optional[float] = None
    acconto_perc: Optional[float] = None
    acconto_ricevuto: Optional[float] = None
    data_acconto: Optional[date] = None
    stato: Optional[str] = None
    note: Optional[str] = None

def _calcola_preventivo(prev: PreventivoCantiere, voci: list, iva_perc: float, acconto_perc: float):
    subtotale = sum(v.get("totale_cliente", 0) for v in voci)
    costo_totale = sum(v.get("totale_costo", 0) for v in voci)
    totale = round(subtotale * (1 + iva_perc / 100), 2)
    acconto_importo = round(totale * acconto_perc / 100, 2)
    prev.voci = voci
    prev.subtotale = subtotale
    prev.costo_totale = costo_totale
    prev.iva_perc = iva_perc
    prev.totale = totale
    prev.acconto_perc = acconto_perc
    prev.acconto_importo = acconto_importo

@router.get("/{cantiere_id}/preventivi", response_model=List[PreventivoOut])
def lista_preventivi(cantiere_id: int, db: Session = Depends(get_db), user: Utente = Depends(get_current_user)):
    _check_accesso(cantiere_id, db, user)
    _blocca_cliente(user)
    return db.query(PreventivoCantiere).filter(PreventivoCantiere.cantiere_id == cantiere_id).order_by(PreventivoCantiere.creato_il.desc()).all()

@router.post("/{cantiere_id}/preventivi", response_model=PreventivoOut, status_code=201)
def crea_preventivo(cantiere_id: int, data: PreventivoCreate, db: Session = Depends(get_db), user: Utente = Depends(get_current_user)):
    _check_accesso(cantiere_id, db, user)
    _solo_admin_capo(user)
    try:
        dump = data.model_dump()
        voci = dump.pop("voci", [])
        prev = PreventivoCantiere(cantiere_id=cantiere_id, **dump)
        _calcola_preventivo(prev, voci, data.iva_perc, data.acconto_perc)
        db.add(prev); db.commit(); db.refresh(prev)
        return prev
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Errore creazione preventivo: {str(e)}")

@router.put("/{cantiere_id}/preventivi/{prev_id}", response_model=PreventivoOut)
def aggiorna_preventivo(cantiere_id: int, prev_id: int, data: PreventivoUpdate, db: Session = Depends(get_db), user: Utente = Depends(get_current_user)):
    _check_accesso(cantiere_id, db, user)
    _solo_admin_capo(user)
    prev = db.query(PreventivoCantiere).filter(PreventivoCantiere.id == prev_id, PreventivoCantiere.cantiere_id == cantiere_id).first()
    if not prev:
        raise HTTPException(status_code=404, detail="Preventivo non trovato")
    upd = data.model_dump(exclude_none=True)
    voci = upd.pop("voci", prev.voci)
    iva = upd.pop("iva_perc", prev.iva_perc)
    acc = upd.pop("acconto_perc", prev.acconto_perc)
    for k, v in upd.items():
        setattr(prev, k, v)
    _calcola_preventivo(prev, voci, iva, acc)
    db.commit(); db.refresh(prev)
    return prev

@router.post("/{cantiere_id}/preventivi/{prev_id}/pdf", response_model=PreventivoOut)
async def upload_pdf_preventivo(cantiere_id: int, prev_id: int, file: UploadFile = File(...), db: Session = Depends(get_db), user: Utente = Depends(get_current_user)):
    _check_accesso(cantiere_id, db, user)
    _solo_admin_capo(user)
    prev = db.query(PreventivoCantiere).filter(PreventivoCantiere.id == prev_id, PreventivoCantiere.cantiere_id == cantiere_id).first()
    if not prev:
        raise HTTPException(status_code=404, detail="Preventivo non trovato")
    contenuto = await file.read()
    ext = os.path.splitext(file.filename or "preventivo.pdf")[1].lower() or ".pdf"
    url, _ = salva_file(contenuto, f"preventivi/{cantiere_id}", ext)
    prev.pdf_url = url
    db.commit(); db.refresh(prev)
    return prev

@router.delete("/{cantiere_id}/preventivi/{prev_id}", status_code=204)
def elimina_preventivo(cantiere_id: int, prev_id: int, db: Session = Depends(get_db), user: Utente = Depends(get_current_user)):
    _check_accesso(cantiere_id, db, user)
    _solo_admin_capo(user)
    prev = db.query(PreventivoCantiere).filter(PreventivoCantiere.id == prev_id, PreventivoCantiere.cantiere_id == cantiere_id).first()
    if not prev:
        raise HTTPException(status_code=404, detail="Preventivo non trovato")
    db.delete(prev); db.commit()


# ─── BOLLE ────────────────────────────────────────────────────────────────────

class BollaOut(BaseModel):
    id: int
    cantiere_id: int
    fattura_id: Optional[int]
    fornitore_nome: str
    numero_bolla: Optional[str]
    data: Optional[date]
    importo_stimato: float
    descrizione: Optional[str]
    foto_url: Optional[str]
    stato: str
    creato_il: Optional[str]
    class Config:
        from_attributes = True

class BollaCreate(BaseModel):
    fornitore_nome: str
    numero_bolla: Optional[str] = None
    data: Optional[date] = None
    importo_stimato: float = 0.0
    descrizione: Optional[str] = None

class BollaUpdate(BaseModel):
    fattura_id: Optional[int] = None
    stato: Optional[str] = None
    importo_stimato: Optional[float] = None
    descrizione: Optional[str] = None

@router.get("/{cantiere_id}/bolle", response_model=List[BollaOut])
def lista_bolle(cantiere_id: int, db: Session = Depends(get_db), user: Utente = Depends(get_current_user)):
    _check_accesso(cantiere_id, db, user)
    _blocca_cliente(user)
    return db.query(BollaConsegna).filter(BollaConsegna.cantiere_id == cantiere_id).order_by(BollaConsegna.creato_il.desc()).all()

@router.post("/{cantiere_id}/bolle", response_model=BollaOut, status_code=201)
def crea_bolla(cantiere_id: int, data: BollaCreate, db: Session = Depends(get_db), user: Utente = Depends(get_current_user)):
    _check_accesso(cantiere_id, db, user)
    _solo_admin_capo(user)  # solo admin e capo cantiere registrano le bolle aziendali
    bolla = BollaConsegna(cantiere_id=cantiere_id, **data.model_dump())
    db.add(bolla); db.commit(); db.refresh(bolla)
    return bolla

@router.put("/{cantiere_id}/bolle/{bolla_id}", response_model=BollaOut)
def aggiorna_bolla(cantiere_id: int, bolla_id: int, data: BollaUpdate, db: Session = Depends(get_db), user: Utente = Depends(get_current_user)):
    _check_accesso(cantiere_id, db, user)
    _solo_admin_capo(user)
    bolla = db.query(BollaConsegna).filter(BollaConsegna.id == bolla_id, BollaConsegna.cantiere_id == cantiere_id).first()
    if not bolla:
        raise HTTPException(status_code=404, detail="Bolla non trovata")
    for k, v in data.model_dump(exclude_none=True).items():
        setattr(bolla, k, v)
    if data.fattura_id:
        bolla.stato = "fatturata"
    db.commit(); db.refresh(bolla)
    return bolla

@router.post("/{cantiere_id}/bolle/{bolla_id}/foto", response_model=BollaOut)
async def upload_foto_bolla(cantiere_id: int, bolla_id: int, file: UploadFile = File(...), db: Session = Depends(get_db), user: Utente = Depends(get_current_user)):
    _check_accesso(cantiere_id, db, user)
    _solo_admin_capo(user)  # solo admin e capo cantiere fotografano le bolle
    bolla = db.query(BollaConsegna).filter(BollaConsegna.id == bolla_id, BollaConsegna.cantiere_id == cantiere_id).first()
    if not bolla:
        raise HTTPException(status_code=404, detail="Bolla non trovata")
    contenuto = await file.read()
    ext = os.path.splitext(file.filename or "bolla.jpg")[1].lower() or ".jpg"
    url, _ = salva_file(contenuto, f"bolle/{cantiere_id}", ext)
    bolla.foto_url = url
    db.commit(); db.refresh(bolla)
    return bolla

@router.delete("/{cantiere_id}/bolle/{bolla_id}", status_code=204)
def elimina_bolla(cantiere_id: int, bolla_id: int, db: Session = Depends(get_db), user: Utente = Depends(get_current_user)):
    _check_accesso(cantiere_id, db, user)
    _solo_admin_capo(user)
    bolla = db.query(BollaConsegna).filter(BollaConsegna.id == bolla_id, BollaConsegna.cantiere_id == cantiere_id).first()
    if not bolla:
        raise HTTPException(status_code=404, detail="Bolla non trovata")
    db.delete(bolla); db.commit()


# ─── GANTT / CRONOPROGRAMMA ───────────────────────────────────────────────────

class FaseOut(BaseModel):
    id: int
    cantiere_id: int
    sal_id: Optional[int]
    nome: str
    categoria: str
    colore: str
    ordine: int
    data_inizio: Optional[date]
    data_fine_prevista: Optional[date]
    data_fine_reale: Optional[date]
    percentuale: float
    stato: str
    note: Optional[str]
    creato_il: Optional[str]
    class Config:
        from_attributes = True

class FaseCreate(BaseModel):
    nome: str
    categoria: str = "lavorazione"
    colore: str = "#FF6B00"
    ordine: int = 0
    data_inizio: Optional[date] = None
    data_fine_prevista: Optional[date] = None
    sal_id: Optional[int] = None
    percentuale: float = 0.0
    stato: str = "pianificata"
    note: Optional[str] = None

class FaseUpdate(BaseModel):
    nome: Optional[str] = None
    categoria: Optional[str] = None
    colore: Optional[str] = None
    ordine: Optional[int] = None
    data_inizio: Optional[date] = None
    data_fine_prevista: Optional[date] = None
    data_fine_reale: Optional[date] = None
    percentuale: Optional[float] = None
    stato: Optional[str] = None
    sal_id: Optional[int] = None
    note: Optional[str] = None

@router.get("/{cantiere_id}/fasi", response_model=List[FaseOut])
def lista_fasi(cantiere_id: int, db: Session = Depends(get_db), user: Utente = Depends(get_current_user)):
    _check_accesso(cantiere_id, db, user)
    return db.query(FaseLavoro).filter(FaseLavoro.cantiere_id == cantiere_id).order_by(FaseLavoro.ordine, FaseLavoro.data_inizio).all()

@router.post("/{cantiere_id}/fasi", response_model=FaseOut, status_code=201)
def crea_fase(cantiere_id: int, data: FaseCreate, db: Session = Depends(get_db), user: Utente = Depends(get_current_user)):
    _check_accesso(cantiere_id, db, user)
    _solo_admin_capo(user)
    fase = FaseLavoro(cantiere_id=cantiere_id, **data.model_dump())
    db.add(fase); db.commit(); db.refresh(fase)
    return fase

@router.put("/{cantiere_id}/fasi/{fase_id}", response_model=FaseOut)
def aggiorna_fase(cantiere_id: int, fase_id: int, data: FaseUpdate, db: Session = Depends(get_db), user: Utente = Depends(get_current_user)):
    _check_accesso(cantiere_id, db, user)
    _solo_admin_capo(user)
    fase = db.query(FaseLavoro).filter(FaseLavoro.id == fase_id, FaseLavoro.cantiere_id == cantiere_id).first()
    if not fase:
        raise HTTPException(status_code=404, detail="Fase non trovata")
    for k, v in data.model_dump(exclude_none=True).items():
        setattr(fase, k, v)
    # Auto-aggiorna stato in base a percentuale e date
    from datetime import date as date_today
    oggi = date_today.today()
    if fase.percentuale >= 100:
        fase.stato = "completata"
        if not fase.data_fine_reale:
            fase.data_fine_reale = oggi
    elif fase.data_fine_prevista and oggi > fase.data_fine_prevista and fase.percentuale < 100:
        fase.stato = "in_ritardo"
    elif fase.percentuale > 0:
        fase.stato = "in_corso"
    db.commit(); db.refresh(fase)
    return fase

@router.put("/{cantiere_id}/fasi/riordina", status_code=204)
def riordina_fasi(cantiere_id: int, ordini: List[dict], db: Session = Depends(get_db), user: Utente = Depends(get_current_user)):
    """Aggiorna l'ordine di tutte le fasi. Body: [{id, ordine}, ...]"""
    _check_accesso(cantiere_id, db, user)
    _solo_admin_capo(user)
    for item in ordini:
        db.query(FaseLavoro).filter(FaseLavoro.id == item["id"]).update({"ordine": item["ordine"]})
    db.commit()

@router.delete("/{cantiere_id}/fasi/{fase_id}", status_code=204)
def elimina_fase(cantiere_id: int, fase_id: int, db: Session = Depends(get_db), user: Utente = Depends(get_current_user)):
    _check_accesso(cantiere_id, db, user)
    _solo_admin_capo(user)
    fase = db.query(FaseLavoro).filter(FaseLavoro.id == fase_id, FaseLavoro.cantiere_id == cantiere_id).first()
    if not fase:
        raise HTTPException(status_code=404, detail="Fase non trovata")
    db.delete(fase); db.commit()
