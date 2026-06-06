"""
Modulo Economico STEELEX — struttura semplificata:
  - Computo: voci di costo + ricarico → preventivo cliente
  - Spese:   registro semplice con foto/PDF allegato
  - SAL:     fatturazione cliente a milestone
  - Gantt:   fasi di lavoro con cronoprogramma
"""
import io
import os
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from typing import List, Optional, Any
from datetime import date, datetime
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
    pdf_url: Optional[str]; note: Optional[str]; creato_il: Optional[datetime]
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
    allegato_url: Optional[str]; allegato_tipo: Optional[str]; creato_il: Optional[datetime]
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
    stato: str; note: Optional[str]; creato_il: Optional[datetime]
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
    percentuale: float; stato: str; note: Optional[str]; creato_il: Optional[datetime]
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


# ─── EXPORT EXCEL ─────────────────────────────────────────────────────────────

@router.get("/{cantiere_id}/export/excel")
def export_excel(cantiere_id: int, db: Session = Depends(get_db), user: Utente = Depends(get_current_user)):
    """Genera un file Excel con riepilogo economico, spese e SAL del cantiere."""
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    from openpyxl.utils import get_column_letter

    cantiere = _check(cantiere_id, db, user)
    _blocca_cliente(user)

    spese = db.query(Spesa).filter(Spesa.cantiere_id == cantiere_id).order_by(Spesa.data).all()
    sal_list = db.query(SAL).filter(SAL.cantiere_id == cantiere_id).order_by(SAL.numero).all()
    preventivi = db.query(PreventivoCantiere).filter(PreventivoCantiere.cantiere_id == cantiere_id).all()
    prev_ok = next((p for p in preventivi if p.stato == "accettato"), preventivi[0] if preventivi else None)

    wb = Workbook()

    # Stili
    arancio = "FF6B00"
    blu = "1A1A2E"
    header_font = Font(color="FFFFFF", bold=True, size=11)
    arancio_fill = PatternFill("solid", fgColor=arancio)
    blu_fill = PatternFill("solid", fgColor=blu)
    thin = Side(style="thin", color="CCCCCC")
    border = Border(left=thin, right=thin, top=thin, bottom=thin)
    center = Alignment(horizontal="center", vertical="center")

    def _header_row(ws, cols, fill):
        ws.append(cols)
        for cell in ws[ws.max_row]:
            cell.font = header_font
            cell.fill = fill
            cell.alignment = center
            cell.border = border

    def _col_widths(ws, widths):
        for i, w in enumerate(widths, 1):
            ws.column_dimensions[get_column_letter(i)].width = w

    # ── Foglio 1: Riepilogo ──────────────────────────────────────────────────
    ws1 = wb.active
    ws1.title = "Riepilogo"
    totale_speso = sum(s.importo for s in spese)
    sal_emessi = sum(s.importo for s in sal_list if s.stato in ("emesso", "pagato"))
    sal_pagati = sum(s.importo for s in sal_list if s.stato == "pagato")
    budget = prev_ok.subtotale if prev_ok else (cantiere.budget or 0)

    ws1.append(["STEELEX — Riepilogo Economico"])
    ws1["A1"].font = Font(bold=True, size=14, color=arancio)
    ws1.append([f"Cantiere: {cantiere.nome}"])
    ws1.append([f"Esportato il: {date.today().strftime('%d/%m/%Y')}"])
    ws1.append([])

    righe = [
        ("Budget preventivo (imponibile)", f"€ {budget:,.2f}"),
        ("Totale spese registrate", f"€ {totale_speso:,.2f}"),
        ("Margine atteso", f"€ {(budget - totale_speso):,.2f}"),
        ("SAL emessi", f"€ {sal_emessi:,.2f}"),
        ("SAL pagati (incassati)", f"€ {sal_pagati:,.2f}"),
        ("Da incassare", f"€ {(sal_emessi - sal_pagati):,.2f}"),
    ]
    for etichetta, valore in righe:
        ws1.append([etichetta, valore])
        ws1[ws1.max_row][0].font = Font(bold=True)

    _col_widths(ws1, [35, 22])

    # ── Foglio 2: Spese ──────────────────────────────────────────────────────
    ws2 = wb.create_sheet("Spese")
    _header_row(ws2, ["#", "Data", "Descrizione", "Fornitore", "Categoria", "Importo €", "Note"], arancio_fill)
    for i, s in enumerate(spese, 1):
        ws2.append([
            i,
            s.data.strftime("%d/%m/%Y") if s.data else "",
            s.descrizione,
            s.fornitore or "",
            s.categoria,
            round(s.importo, 2),
            s.note or "",
        ])
        for cell in ws2[ws2.max_row]:
            cell.border = border
    # Totale
    ws2.append(["", "", "", "", "TOTALE", round(totale_speso, 2), ""])
    for cell in ws2[ws2.max_row]:
        cell.font = Font(bold=True)
        cell.border = border
    _col_widths(ws2, [5, 13, 35, 25, 15, 14, 30])

    # ── Foglio 3: SAL ────────────────────────────────────────────────────────
    ws3 = wb.create_sheet("SAL")
    _header_row(ws3, ["N°", "Titolo", "Data", "% SAL", "Importo €", "Stato", "Note"], blu_fill)
    for s in sal_list:
        ws3.append([
            s.numero,
            s.titolo,
            s.data.strftime("%d/%m/%Y") if s.data else "",
            f"{s.percentuale:.1f}%",
            round(s.importo, 2),
            s.stato.upper(),
            s.note or "",
        ])
        for cell in ws3[ws3.max_row]:
            cell.border = border
    _col_widths(ws3, [5, 35, 13, 10, 14, 12, 30])

    # ── Foglio 4: Computo preventivo ─────────────────────────────────────────
    if prev_ok and prev_ok.voci:
        ws4 = wb.create_sheet("Computo")
        _header_row(ws4, ["#", "Descrizione", "Categoria", "Um", "Qty", "P.Costo €", "Ricarico%", "P.Cliente €", "Tot.Costo €", "Tot.Cliente €"], arancio_fill)
        for i, v in enumerate(prev_ok.voci, 1):
            ws4.append([
                i,
                v.get("descrizione", ""),
                v.get("categoria", ""),
                v.get("um", ""),
                v.get("quantita", 0),
                round(v.get("prezzo_costo", 0), 2),
                f"{v.get('ricarico_perc', 0):.1f}%",
                round(v.get("prezzo_cliente", 0), 2),
                round(v.get("totale_costo", 0), 2),
                round(v.get("totale_cliente", 0), 2),
            ])
            for cell in ws4[ws4.max_row]:
                cell.border = border
        # Totali
        ws4.append(["", "", "", "", "", "", "", "SUBTOTALE", "", round(prev_ok.subtotale, 2)])
        ws4.append(["", "", "", "", "", "", "", f"IVA {prev_ok.iva_perc:.0f}%", "", round(prev_ok.totale - prev_ok.subtotale, 2)])
        ws4.append(["", "", "", "", "", "", "", "TOTALE IVA INCL.", "", round(prev_ok.totale, 2)])
        for row in ws4.iter_rows(min_row=ws4.max_row - 2, max_row=ws4.max_row):
            for cell in row:
                cell.font = Font(bold=True)
        _col_widths(ws4, [5, 35, 18, 7, 8, 13, 11, 13, 13, 14])

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)

    nome_file = f"economico_{cantiere.nome.replace(' ', '_')}_{date.today().isoformat()}.xlsx"
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{nome_file}"'},
    )


# ─── PDF PREVENTIVO ───────────────────────────────────────────────────────────

@router.get("/{cantiere_id}/preventivi/{prev_id}/genera-pdf")
def genera_pdf_preventivo(cantiere_id: int, prev_id: int, db: Session = Depends(get_db), user: Utente = Depends(get_current_user)):
    """Genera PDF preventivo formattato STEELEX pronto per il cliente."""
    from reportlab.lib.pagesizes import A4
    from reportlab.lib import colors
    from reportlab.lib.units import mm
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, HRFlowable
    from reportlab.lib.enums import TA_RIGHT, TA_CENTER, TA_LEFT

    cantiere = _check(cantiere_id, db, user)
    _solo_staff(user)
    prev = db.query(PreventivoCantiere).filter(
        PreventivoCantiere.id == prev_id,
        PreventivoCantiere.cantiere_id == cantiere_id
    ).first()
    if not prev:
        raise HTTPException(404, "Preventivo non trovato")

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4,
                            leftMargin=20*mm, rightMargin=20*mm,
                            topMargin=20*mm, bottomMargin=20*mm)

    ARANCIO = colors.HexColor("#FF6B00")
    BLU = colors.HexColor("#1A1A2E")
    GRIGIO = colors.HexColor("#F5F5F5")

    styles = getSampleStyleSheet()
    style_titolo = ParagraphStyle("titolo", parent=styles["Heading1"], textColor=ARANCIO, fontSize=22, spaceAfter=2)
    style_sub = ParagraphStyle("sub", parent=styles["Normal"], textColor=BLU, fontSize=10)
    style_label = ParagraphStyle("label", parent=styles["Normal"], textColor=BLU, fontSize=9, fontName="Helvetica-Bold")
    style_small = ParagraphStyle("small", parent=styles["Normal"], fontSize=8, textColor=colors.grey)
    style_right = ParagraphStyle("right", parent=styles["Normal"], alignment=TA_RIGHT, fontSize=9)
    style_note = ParagraphStyle("note", parent=styles["Normal"], fontSize=9, textColor=colors.grey)

    story = []

    # Intestazione
    story.append(Paragraph("STEELEX", style_titolo))
    story.append(Paragraph("Costruzioni Light Steel Frame", style_sub))
    story.append(HRFlowable(width="100%", thickness=2, color=ARANCIO, spaceAfter=6))

    # Info preventivo
    numero = prev.numero or f"PRV-{prev.id:04d}"
    data_str = prev.data.strftime("%d/%m/%Y") if prev.data else date.today().strftime("%d/%m/%Y")
    info_data = [
        [Paragraph(f"<b>PREVENTIVO N°</b> {numero}", style_label),
         Paragraph(f"<b>Data:</b> {data_str}", style_right)],
        [Paragraph(f"<b>Cantiere:</b> {cantiere.nome}", style_label),
         Paragraph(f"<b>Validità:</b> {prev.validita_giorni} giorni", style_right)],
    ]
    info_table = Table(info_data, colWidths=["60%", "40%"])
    info_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), GRIGIO),
        ("ROWPADDING", (0, 0), (-1, -1), 6),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.lightgrey),
    ]))
    story.append(info_table)
    story.append(Spacer(1, 6*mm))

    # Tabella voci
    story.append(Paragraph("COMPUTO METRICO ESTIMATIVO", style_label))
    story.append(Spacer(1, 2*mm))

    headers = ["#", "Descrizione", "Cat.", "Um", "Qty", "P.Unit. €", "Totale €"]
    col_widths = [10*mm, 65*mm, 22*mm, 12*mm, 14*mm, 22*mm, 22*mm]
    table_data = [headers]
    voci = prev.voci or []
    for i, v in enumerate(voci, 1):
        table_data.append([
            str(i),
            v.get("descrizione", ""),
            v.get("categoria", ""),
            v.get("um", "cad"),
            str(v.get("quantita", 1)),
            f"€ {v.get('prezzo_cliente', 0):,.2f}",
            f"€ {v.get('totale_cliente', 0):,.2f}",
        ])

    # Righe totali
    table_data.append(["", "", "", "", "", "Imponibile", f"€ {prev.subtotale:,.2f}"])
    table_data.append(["", "", "", "", "", f"IVA {prev.iva_perc:.0f}%", f"€ {(prev.totale - prev.subtotale):,.2f}"])
    table_data.append(["", "", "", "", "", "TOTALE", f"€ {prev.totale:,.2f}"])
    table_data.append(["", "", "", "", "", f"Acconto {prev.acconto_perc:.0f}%", f"€ {prev.acconto_importo:,.2f}"])

    n_voci = len(voci)
    voci_table = Table(table_data, colWidths=col_widths)
    ts = TableStyle([
        # Header
        ("BACKGROUND", (0, 0), (-1, 0), BLU),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, 0), 9),
        ("ALIGN", (0, 0), (-1, 0), "CENTER"),
        # Righe voci
        ("FONTSIZE", (0, 1), (-1, n_voci), 8),
        ("ROWBACKGROUNDS", (0, 1), (-1, n_voci), [colors.white, GRIGIO]),
        ("ALIGN", (4, 1), (-1, n_voci), "RIGHT"),
        # Righe totali
        ("FONTNAME", (0, n_voci + 1), (-1, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, n_voci + 1), (-1, -1), 9),
        ("ALIGN", (5, n_voci + 1), (6, -1), "RIGHT"),
        ("BACKGROUND", (0, n_voci + 3), (-1, n_voci + 3), ARANCIO),
        ("TEXTCOLOR", (0, n_voci + 3), (-1, n_voci + 3), colors.white),
        # Griglia
        ("GRID", (0, 0), (-1, n_voci), 0.3, colors.lightgrey),
        ("LINEABOVE", (0, n_voci + 1), (-1, n_voci + 1), 1, ARANCIO),
        ("ROWPADDING", (0, 0), (-1, -1), 4),
    ])
    voci_table.setStyle(ts)
    story.append(voci_table)
    story.append(Spacer(1, 6*mm))

    # Note
    if prev.note:
        story.append(Paragraph("<b>Note:</b>", style_label))
        story.append(Paragraph(prev.note, style_note))
        story.append(Spacer(1, 4*mm))

    # Piè di pagina firma
    story.append(HRFlowable(width="100%", thickness=1, color=colors.lightgrey))
    story.append(Spacer(1, 4*mm))
    firma_data = [
        [Paragraph("Per accettazione:", style_label), Paragraph("STEELEX — Fontana Raffaele Srl", style_label)],
        [Paragraph("_" * 35, style_small), Paragraph("_" * 35, style_small)],
        [Paragraph("Timbro e firma cliente", style_small), Paragraph("Firma", style_small)],
    ]
    firma_table = Table(firma_data, colWidths=["50%", "50%"])
    story.append(firma_table)

    doc.build(story)
    buf.seek(0)

    nome_file = f"preventivo_{numero}_{cantiere.nome.replace(' ', '_')}.pdf"
    return StreamingResponse(
        buf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{nome_file}"'},
    )
