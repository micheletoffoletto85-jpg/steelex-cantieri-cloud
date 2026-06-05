"""
Modulo Economico STEELEX — struttura semplificata:
  - Computo: voci di costo + ricarico → preventivo cliente
  - Spese:   registro semplice con foto/PDF allegato
  - SAL:     fatturazione cliente a milestone
  - Gantt:   fasi di lavoro con cronoprogramma
"""
import os
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from typing import List, Optional, Any
from datetime import date
from app.database import get_db
from app.models.economico import (
    PreventivoCantiere, SAL, StatoSAL, StatoPreventivo,
    Spesa, CategoriaSpesa, FaseLavoro, StatoFase,
    OrdineAcquisto, FatturaFornitore, BollaConsegna  # mantenuti per compatibilità dati esistenti
)
from app.models.cantiere import Cantiere
from app.models.utente import RuoloUtente, Utente
from app.auth import get_current_user
from app.storage import salva_file
from pydantic import BaseModel

router = APIRouter(prefix="/cantieri", tags=["Economico"])


# ─── AUTORIZZAZIONI ───────────────────────────────────────────────────────────

def _check(cantiere_id: int, db: Session, user: Utente) -> Cantiere:
    c = db.query(Cantiere).filter(Cantiere.id == cantiere_id).first()
    if not c:
        raise HTTPException(404, "Cantiere non trovato")
    if user.ruolo == RuoloUtente.admin:
        return c
    if user.ruolo == RuoloUtente.capo_cantiere and c.responsabile_id == user.id:
        return c
    if user.ruolo == RuoloUtente.fornitore:
        return c
    raise HTTPException(403, "Accesso negato")

def _solo_staff(user: Utente):
    if user.ruolo not in (RuoloUtente.admin, RuoloUtente.capo_cantiere):
        raise HTTPException(403, "Solo admin e capo cantiere")

def _blocca_cliente(user: Utente):
    if user.ruolo == RuoloUtente.cliente:
        raise HTTPException(403, "Dati economici non accessibili al cliente")


# ─── RIEPILOGO ────────────────────────────────────────────────────────────────

class RiepilogoOut(BaseModel):
    budget_preventivo: float     # totale preventivo accettato (IVA esclusa)
    budget_iva: float            # con IVA
    totale_speso: float          # somma spese registrate
    margine_atteso: float        # budget - totale_speso
    totale_sal_emessi: float     # SAL emessi + pagati
    totale_sal_pagati: float     # SAL incassati
    da_incassare: float
    spese_per_categoria: dict

@router.get("/{cantiere_id}/economia", response_model=RiepilogoOut)
def riepilogo(cantiere_id: int, db: Session = Depends(get_db), user: Utente = Depends(get_current_user)):
    _check(cantiere_id, db, user)
    _blocca_cliente(user)

    preventivi = db.query(PreventivoCantiere).filter(PreventivoCantiere.cantiere_id == cantiere_id).all()
    spese = db.query(Spesa).filter(Spesa.cantiere_id == cantiere_id).all()
    sal_list = db.query(SAL).filter(SAL.cantiere_id == cantiere_id).all()
    cantiere = db.query(Cantiere).filter(Cantiere.id == cantiere_id).first()

    prev_ok = next((p for p in preventivi if p.stato == "accettato"), None)
    budget = prev_ok.subtotale if prev_ok else (cantiere.budget or 0)
    budget_iva = prev_ok.totale if prev_ok else budget

    totale_speso = sum(s.importo for s in spese)
    sal_emessi = sum(s.importo for s in sal_list if s.stato in ("emesso","pagato"))
    sal_pagati = sum(s.importo for s in sal_list if s.stato == "pagato")

    cat_totali = {}
    for s in spese:
        cat = s.categoria or "altro"
        cat_totali[cat] = cat_totali.get(cat, 0) + s.importo

    return RiepilogoOut(
        budget_preventivo=budget,
        budget_iva=budget_iva,
        totale_speso=totale_speso,
        margine_atteso=budget - totale_speso,
        totale_sal_emessi=sal_emessi,
        totale_sal_pagati=sal_pagati,
        da_incassare=sal_emessi - sal_pagati,
        spese_per_categoria=cat_totali,
    )


# ─── COMPUTO / PREVENTIVO ─────────────────────────────────────────────────────

class PreventivoOut(BaseModel):
    id: int; cantiere_id: int; numero: Optional[str]; data: Optional[date]
    validita_giorni: int; voci: Any; subtotale: float; costo_totale: float
    iva_perc: float; totale: float; acconto_perc: float; acconto_importo: float
    acconto_ricevuto: float; data_acconto: Optional[date]; stato: str
    pdf_url: Optional[str]; note: Optional[str]; creato_il: Optional[str]
    class Config: from_attributes = True

class PreventivoCreate(BaseModel):
    numero: Optional[str] = None
    data_preventivo: Optional[date] = None
    validita_giorni: int = 30
    voci: list = []
    iva_perc: float = 22.0
    acconto_perc: float = 30.0
    note: Optional[str] = None

class PreventivoUpdate(BaseModel):
    numero: Optional[str] = None
    data_preventivo: Optional[date] = None
    voci: Optional[list] = None
    iva_perc: Optional[float] = None
    acconto_perc: Optional[float] = None
    acconto_ricevuto: Optional[float] = None
    data_acconto: Optional[date] = None
    stato: Optional[str] = None
    note: Optional[str] = None

def _ricalcola(prev, voci, iva_perc, acconto_perc):
    subtotale = sum(v.get("totale_cliente", 0) for v in voci)
    costo_totale = sum(v.get("totale_costo", 0) for v in voci)
    totale = round(subtotale * (1 + iva_perc / 100), 2)
    prev.voci = voci
    prev.subtotale = round(subtotale, 2)
    prev.costo_totale = round(costo_totale, 2)
    prev.iva_perc = iva_perc
    prev.totale = totale
    prev.acconto_perc = acconto_perc
    prev.acconto_importo = round(totale * acconto_perc / 100, 2)

@router.get("/{cantiere_id}/preventivi", response_model=List[PreventivoOut])
def lista_preventivi(cantiere_id: int, db: Session = Depends(get_db), user: Utente = Depends(get_current_user)):
    _check(cantiere_id, db, user); _blocca_cliente(user)
    return db.query(PreventivoCantiere).filter(PreventivoCantiere.cantiere_id == cantiere_id).order_by(PreventivoCantiere.creato_il.desc()).all()

@router.post("/{cantiere_id}/preventivi", response_model=PreventivoOut, status_code=201)
def crea_preventivo(cantiere_id: int, body: PreventivoCreate, db: Session = Depends(get_db), user: Utente = Depends(get_current_user)):
    _check(cantiere_id, db, user); _solo_staff(user)
    try:
        prev = PreventivoCantiere(
            cantiere_id=cantiere_id,
            numero=body.numero,
            data=body.data_preventivo,
            validita_giorni=body.validita_giorni,
            iva_perc=body.iva_perc,
            acconto_perc=body.acconto_perc,
            note=body.note,
        )
        _ricalcola(prev, body.voci, body.iva_perc, body.acconto_perc)
        db.add(prev); db.commit(); db.refresh(prev)
        return prev
    except Exception as e:
        db.rollback()
        raise HTTPException(500, f"Errore: {e}")

@router.put("/{cantiere_id}/preventivi/{prev_id}", response_model=PreventivoOut)
def aggiorna_preventivo(cantiere_id: int, prev_id: int, body: PreventivoUpdate, db: Session = Depends(get_db), user: Utente = Depends(get_current_user)):
    _check(cantiere_id, db, user); _solo_staff(user)
    prev = db.query(PreventivoCantiere).filter(PreventivoCantiere.id == prev_id, PreventivoCantiere.cantiere_id == cantiere_id).first()
    if not prev: raise HTTPException(404, "Non trovato")
    upd = body.model_dump(exclude_none=True)
    if "data_preventivo" in upd: prev.data = upd.pop("data_preventivo")
    voci = upd.pop("voci", prev.voci or [])
    iva = upd.pop("iva_perc", prev.iva_perc)
    acc = upd.pop("acconto_perc", prev.acconto_perc)
    for k, v in upd.items(): setattr(prev, k, v)
    _ricalcola(prev, voci, iva, acc)
    db.commit(); db.refresh(prev)
    return prev

@router.post("/{cantiere_id}/preventivi/{prev_id}/pdf", response_model=PreventivoOut)
async def upload_pdf_preventivo(cantiere_id: int, prev_id: int, file: UploadFile = File(...), db: Session = Depends(get_db), user: Utente = Depends(get_current_user)):
    _check(cantiere_id, db, user); _solo_staff(user)
    prev = db.query(PreventivoCantiere).filter(PreventivoCantiere.id == prev_id, PreventivoCantiere.cantiere_id == cantiere_id).first()
    if not prev: raise HTTPException(404, "Non trovato")
    ext = os.path.splitext(file.filename or ".pdf")[1].lower() or ".pdf"
    url, _ = salva_file(await file.read(), f"preventivi/{cantiere_id}", ext)
    prev.pdf_url = url; db.commit(); db.refresh(prev)
    return prev

@router.delete("/{cantiere_id}/preventivi/{prev_id}", status_code=204)
def elimina_preventivo(cantiere_id: int, prev_id: int, db: Session = Depends(get_db), user: Utente = Depends(get_current_user)):
    _check(cantiere_id, db, user); _solo_staff(user)
    prev = db.query(PreventivoCantiere).filter(PreventivoCantiere.id == prev_id, PreventivoCantiere.cantiere_id == cantiere_id).first()
    if not prev: raise HTTPException(404, "Non trovato")
    db.delete(prev); db.commit()


# ─── SPESE ────────────────────────────────────────────────────────────────────

class SpesaOut(BaseModel):
    id: int; cantiere_id: int; descrizione: str; fornitore: Optional[str]
    categoria: str; importo: float; data: Optional[date]; note: Optional[str]
    allegato_url: Optional[str]; allegato_tipo: Optional[str]; creato_il: Optional[str]
    class Config: from_attributes = True

class SpesaCreate(BaseModel):
    descrizione: str
    fornitore: Optional[str] = None
    categoria: str = "materiali"
    importo: float
    data: Optional[date] = None
    note: Optional[str] = None

class SpesaUpdate(BaseModel):
    descrizione: Optional[str] = None
    fornitore: Optional[str] = None
    categoria: Optional[str] = None
    importo: Optional[float] = None
    data: Optional[date] = None
    note: Optional[str] = None

@router.get("/{cantiere_id}/spese", response_model=List[SpesaOut])
def lista_spese(cantiere_id: int, db: Session = Depends(get_db), user: Utente = Depends(get_current_user)):
    _check(cantiere_id, db, user); _blocca_cliente(user)
    return db.query(Spesa).filter(Spesa.cantiere_id == cantiere_id).order_by(Spesa.creato_il.desc()).all()

@router.post("/{cantiere_id}/spese", response_model=SpesaOut, status_code=201)
def registra_spesa(cantiere_id: int, body: SpesaCreate, db: Session = Depends(get_db), user: Utente = Depends(get_current_user)):
    _check(cantiere_id, db, user); _solo_staff(user)
    try:
        s = Spesa(cantiere_id=cantiere_id, creato_da=user.id, **body.model_dump())
        db.add(s); db.commit(); db.refresh(s)
        return s
    except Exception as e:
        db.rollback(); raise HTTPException(500, f"Errore: {e}")

@router.put("/{cantiere_id}/spese/{spesa_id}", response_model=SpesaOut)
def aggiorna_spesa(cantiere_id: int, spesa_id: int, body: SpesaUpdate, db: Session = Depends(get_db), user: Utente = Depends(get_current_user)):
    _check(cantiere_id, db, user); _solo_staff(user)
    s = db.query(Spesa).filter(Spesa.id == spesa_id, Spesa.cantiere_id == cantiere_id).first()
    if not s: raise HTTPException(404, "Non trovata")
    for k, v in body.model_dump(exclude_none=True).items(): setattr(s, k, v)
    db.commit(); db.refresh(s)
    return s

@router.post("/{cantiere_id}/spese/{spesa_id}/allegato", response_model=SpesaOut)
async def upload_allegato_spesa(cantiere_id: int, spesa_id: int, file: UploadFile = File(...), db: Session = Depends(get_db), user: Utente = Depends(get_current_user)):
    _check(cantiere_id, db, user); _solo_staff(user)
    s = db.query(Spesa).filter(Spesa.id == spesa_id, Spesa.cantiere_id == cantiere_id).first()
    if not s: raise HTTPException(404, "Non trovata")
    ext = os.path.splitext(file.filename or "")[1].lower()
    contenuto = await file.read()
    url, _ = salva_file(contenuto, f"spese/{cantiere_id}", ext)
    s.allegato_url = url
    s.allegato_tipo = "pdf" if ext == ".pdf" else "foto"
    db.commit(); db.refresh(s)
    return s

@router.delete("/{cantiere_id}/spese/{spesa_id}", status_code=204)
def elimina_spesa(cantiere_id: int, spesa_id: int, db: Session = Depends(get_db), user: Utente = Depends(get_current_user)):
    _check(cantiere_id, db, user); _solo_staff(user)
    s = db.query(Spesa).filter(Spesa.id == spesa_id, Spesa.cantiere_id == cantiere_id).first()
    if not s: raise HTTPException(404, "Non trovata")
    db.delete(s); db.commit()


# ─── SAL ──────────────────────────────────────────────────────────────────────

class SALOut(BaseModel):
    id: int; cantiere_id: int; numero: int; titolo: str
    percentuale: float; importo: float; data: Optional[date]
    stato: str; note: Optional[str]; creato_il: Optional[str]
    class Config: from_attributes = True

class SALCreate(BaseModel):
    titolo: str; percentuale: float; importo: float
    data: Optional[date] = None; stato: str = "bozza"; note: Optional[str] = None

class SALUpdate(BaseModel):
    titolo: Optional[str] = None; percentuale: Optional[float] = None
    importo: Optional[float] = None; data: Optional[date] = None
    stato: Optional[str] = None; note: Optional[str] = None

@router.get("/{cantiere_id}/sal", response_model=List[SALOut])
def lista_sal(cantiere_id: int, db: Session = Depends(get_db), user: Utente = Depends(get_current_user)):
    _check(cantiere_id, db, user); _blocca_cliente(user)
    return db.query(SAL).filter(SAL.cantiere_id == cantiere_id).order_by(SAL.numero).all()

@router.post("/{cantiere_id}/sal", response_model=SALOut, status_code=201)
def crea_sal(cantiere_id: int, body: SALCreate, db: Session = Depends(get_db), user: Utente = Depends(get_current_user)):
    _check(cantiere_id, db, user); _solo_staff(user)
    ultimo = db.query(SAL).filter(SAL.cantiere_id == cantiere_id).order_by(SAL.numero.desc()).first()
    sal = SAL(cantiere_id=cantiere_id, numero=(ultimo.numero + 1 if ultimo else 1), **body.model_dump())
    db.add(sal); db.commit(); db.refresh(sal)
    return sal

@router.put("/{cantiere_id}/sal/{sal_id}", response_model=SALOut)
def aggiorna_sal(cantiere_id: int, sal_id: int, body: SALUpdate, db: Session = Depends(get_db), user: Utente = Depends(get_current_user)):
    _check(cantiere_id, db, user); _solo_staff(user)
    sal = db.query(SAL).filter(SAL.id == sal_id, SAL.cantiere_id == cantiere_id).first()
    if not sal: raise HTTPException(404, "Non trovato")
    for k, v in body.model_dump(exclude_none=True).items(): setattr(sal, k, v)
    db.commit(); db.refresh(sal)
    return sal

@router.delete("/{cantiere_id}/sal/{sal_id}", status_code=204)
def elimina_sal(cantiere_id: int, sal_id: int, db: Session = Depends(get_db), user: Utente = Depends(get_current_user)):
    _check(cantiere_id, db, user); _solo_staff(user)
    sal = db.query(SAL).filter(SAL.id == sal_id, SAL.cantiere_id == cantiere_id).first()
    if not sal: raise HTTPException(404, "Non trovato")
    db.delete(sal); db.commit()


# ─── GANTT / FASI ─────────────────────────────────────────────────────────────

class FaseOut(BaseModel):
    id: int; cantiere_id: int; sal_id: Optional[int]; nome: str
    categoria: str; colore: str; ordine: int; data_inizio: Optional[date]
    data_fine_prevista: Optional[date]; data_fine_reale: Optional[date]
    percentuale: float; stato: str; note: Optional[str]; creato_il: Optional[str]
    class Config: from_attributes = True

class FaseCreate(BaseModel):
    nome: str; categoria: str = "lavorazione"; colore: str = "#FF6B00"
    ordine: int = 0; data_inizio: Optional[date] = None
    data_fine_prevista: Optional[date] = None; sal_id: Optional[int] = None
    percentuale: float = 0.0; stato: str = "pianificata"; note: Optional[str] = None

class FaseUpdate(BaseModel):
    nome: Optional[str] = None; categoria: Optional[str] = None
    colore: Optional[str] = None; ordine: Optional[int] = None
    data_inizio: Optional[date] = None; data_fine_prevista: Optional[date] = None
    data_fine_reale: Optional[date] = None; percentuale: Optional[float] = None
    stato: Optional[str] = None; sal_id: Optional[int] = None; note: Optional[str] = None

@router.get("/{cantiere_id}/fasi", response_model=List[FaseOut])
def lista_fasi(cantiere_id: int, db: Session = Depends(get_db), user: Utente = Depends(get_current_user)):
    _check(cantiere_id, db, user)
    return db.query(FaseLavoro).filter(FaseLavoro.cantiere_id == cantiere_id).order_by(FaseLavoro.ordine, FaseLavoro.data_inizio).all()

@router.post("/{cantiere_id}/fasi", response_model=FaseOut, status_code=201)
def crea_fase(cantiere_id: int, body: FaseCreate, db: Session = Depends(get_db), user: Utente = Depends(get_current_user)):
    _check(cantiere_id, db, user); _solo_staff(user)
    try:
        fase = FaseLavoro(cantiere_id=cantiere_id, **body.model_dump())
        db.add(fase); db.commit(); db.refresh(fase)
        return fase
    except Exception as e:
        db.rollback(); raise HTTPException(500, f"Errore: {e}")

@router.put("/{cantiere_id}/fasi/{fase_id}", response_model=FaseOut)
def aggiorna_fase(cantiere_id: int, fase_id: int, body: FaseUpdate, db: Session = Depends(get_db), user: Utente = Depends(get_current_user)):
    _check(cantiere_id, db, user); _solo_staff(user)
    fase = db.query(FaseLavoro).filter(FaseLavoro.id == fase_id, FaseLavoro.cantiere_id == cantiere_id).first()
    if not fase: raise HTTPException(404, "Non trovata")
    for k, v in body.model_dump(exclude_none=True).items(): setattr(fase, k, v)
    from datetime import date as d_today
    oggi = d_today.today()
    if fase.percentuale >= 100:
        fase.stato = "completata"
        if not fase.data_fine_reale: fase.data_fine_reale = oggi
    elif fase.data_fine_prevista and oggi > fase.data_fine_prevista and fase.percentuale < 100:
        fase.stato = "in_ritardo"
    elif fase.percentuale > 0:
        fase.stato = "in_corso"
    db.commit(); db.refresh(fase)
    return fase

@router.delete("/{cantiere_id}/fasi/{fase_id}", status_code=204)
def elimina_fase(cantiere_id: int, fase_id: int, db: Session = Depends(get_db), user: Utente = Depends(get_current_user)):
    _check(cantiere_id, db, user); _solo_staff(user)
    fase = db.query(FaseLavoro).filter(FaseLavoro.id == fase_id, FaseLavoro.cantiere_id == cantiere_id).first()
    if not fase: raise HTTPException(404, "Non trovata")
    db.delete(fase); db.commit()
