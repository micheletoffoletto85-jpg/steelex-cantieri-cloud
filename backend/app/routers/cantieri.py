from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel
from app.database import get_db
from app.models.cantiere import Cantiere, StatoCantiere, cantiere_artigiani
from app.models.utente import Utente, RuoloUtente
from app.schemas.cantiere import CantiereCreate, CantiereOut, CantiereUpdate
from app.auth import get_current_user

router = APIRouter(prefix="/cantieri", tags=["Cantieri"])

# Staff STEELEX interno: crea cantieri e vede tutti
_RUOLI_STEELEX = (RuoloUtente.admin, RuoloUtente.capo_cantiere, RuoloUtente.amministrazione)
# Ruoli con accesso esteso (assegnati al cantiere): leggono/scrivono ma non creano
_RUOLI_STAFF_EXT = (RuoloUtente.capo_cantiere_sub, RuoloUtente.direzione_lavori,
                    RuoloUtente.architetto, RuoloUtente.responsabile_sicurezza)
# Ruoli esterni puri: vedono SOLO i cantieri dove sono esplicitamente assegnati
_RUOLI_ESTERNI = (RuoloUtente.artigiano, RuoloUtente.fornitore, RuoloUtente.cliente)

def _check_accesso(cantiere: Cantiere, user: Utente):
    if user.ruolo == RuoloUtente.admin:
        return
    if user.ruolo in (RuoloUtente.capo_cantiere, RuoloUtente.amministrazione):
        return  # vedono tutti i cantieri
    # tutti gli altri ruoli: solo se assegnati nella tabella cantiere_artigiani
    if user.id in [u.id for u in cantiere.artigiani]:
        return
    raise HTTPException(status_code=403, detail="Accesso negato al cantiere")

@router.get("", response_model=List[CantiereOut])
def lista_cantieri(
    stato: Optional[StatoCantiere] = None,
    db: Session = Depends(get_db),
    user: Utente = Depends(get_current_user),
):
    q = db.query(Cantiere)
    if user.ruolo in (RuoloUtente.admin, RuoloUtente.capo_cantiere, RuoloUtente.amministrazione):
        pass  # vede tutto
    elif user.ruolo in _RUOLI_STAFF_EXT:
        # capo_cantiere_sub, direzione_lavori, architetto, responsabile_sicurezza:
        # solo cantieri dove sono assegnati
        q = q.filter(Cantiere.artigiani.any(Utente.id == user.id))
    else:
        # capo_cantiere_sub, direzione_lavori, artigiano, fornitore, cliente:
        # solo cantieri dove sono stati esplicitamente assegnati
        q = q.filter(Cantiere.artigiani.any(Utente.id == user.id))
    if stato:
        q = q.filter(Cantiere.stato == stato)
    cantieri = q.order_by(Cantiere.creato_il.desc()).all()
    # Ricalcola avanzamento live dalle fasi (il campo DB può essere obsoleto)
    for c in cantieri:
        if c.fasi:
            c.avanzamento = round(sum(f.percentuale for f in c.fasi) / len(c.fasi), 1)
    return cantieri

@router.post("", response_model=CantiereOut, status_code=201)
def crea_cantiere(data: CantiereCreate, db: Session = Depends(get_db), user: Utente = Depends(get_current_user)):
    if user.ruolo not in _RUOLI_STEELEX:
        raise HTTPException(status_code=403, detail="Non autorizzato")
    cantiere = Cantiere(**data.model_dump())
    if not cantiere.responsabile_id:
        cantiere.responsabile_id = user.id
    db.add(cantiere)
    db.commit()
    db.refresh(cantiere)
    return cantiere

@router.get("/{cantiere_id}", response_model=CantiereOut)
def get_cantiere(cantiere_id: int, db: Session = Depends(get_db), user: Utente = Depends(get_current_user)):
    cantiere = db.query(Cantiere).filter(Cantiere.id == cantiere_id).first()
    if not cantiere:
        raise HTTPException(status_code=404, detail="Cantiere non trovato")
    _check_accesso(cantiere, user)
    if cantiere.fasi:
        cantiere.avanzamento = round(sum(f.percentuale for f in cantiere.fasi) / len(cantiere.fasi), 1)
    return cantiere

@router.put("/{cantiere_id}", response_model=CantiereOut)
def aggiorna_cantiere(cantiere_id: int, data: CantiereUpdate, db: Session = Depends(get_db), user: Utente = Depends(get_current_user)):
    cantiere = db.query(Cantiere).filter(Cantiere.id == cantiere_id).first()
    if not cantiere:
        raise HTTPException(status_code=404, detail="Cantiere non trovato")
    _check_accesso(cantiere, user)
    for k, v in data.model_dump(exclude_none=True).items():
        setattr(cantiere, k, v)
    db.commit()
    db.refresh(cantiere)
    return cantiere

@router.delete("/{cantiere_id}", status_code=204)
def elimina_cantiere(cantiere_id: int, db: Session = Depends(get_db), user: Utente = Depends(get_current_user)):
    from app.models.utente import RuoloUtente
    if user.ruolo != RuoloUtente.admin:
        raise HTTPException(status_code=403, detail="Solo admin può eliminare cantieri")
    cantiere = db.query(Cantiere).filter(Cantiere.id == cantiere_id).first()
    if not cantiere:
        raise HTTPException(status_code=404, detail="Cantiere non trovato")
    db.delete(cantiere)
    db.commit()

# --- Gestione artigiani assegnati ---

class UtenteBase(BaseModel):
    id: int
    nome: str
    cognome: str
    email: str
    ruolo: str
    class Config:
        from_attributes = True

@router.get("/utenti/artigiani", response_model=List[UtenteBase])
def lista_utenti_assegnabili(db: Session = Depends(get_db), user: Utente = Depends(get_current_user)):
    """Tutti gli utenti artigiani + capo cantiere assegnabili"""
    if user.ruolo not in (RuoloUtente.admin, *_RUOLI_STEELEX):
        raise HTTPException(status_code=403, detail="Non autorizzato")
    return db.query(Utente).filter(
        Utente.attivo == True,
        Utente.id != user.id  # esclude se stesso
    ).order_by(Utente.cognome).all()

class AssegnaBody(BaseModel):
    utente_id: int

@router.get("/{cantiere_id}/team", response_model=List[UtenteBase])
def team_cantiere(cantiere_id: int, db: Session = Depends(get_db), user: Utente = Depends(get_current_user)):
    """Responsabile + artigiani/utenti assegnati al cantiere."""
    cantiere = db.query(Cantiere).filter(Cantiere.id == cantiere_id).first()
    if not cantiere:
        raise HTTPException(status_code=404, detail="Cantiere non trovato")
    visti = set()
    membri = []
    for u in cantiere.artigiani:
        if u.id not in visti:
            visti.add(u.id)
            membri.append(u)
    if cantiere.responsabile and cantiere.responsabile.id not in visti:
        membri.insert(0, cantiere.responsabile)
    return sorted(membri, key=lambda u: (u.cognome or '', u.nome or ''))

@router.get("/{cantiere_id}/artigiani", response_model=List[UtenteBase])
def lista_artigiani(cantiere_id: int, db: Session = Depends(get_db), user: Utente = Depends(get_current_user)):
    if user.ruolo not in (RuoloUtente.admin, *_RUOLI_STEELEX):
        raise HTTPException(status_code=403, detail="Non autorizzato")
    cantiere = db.query(Cantiere).filter(Cantiere.id == cantiere_id).first()
    if not cantiere:
        raise HTTPException(status_code=404, detail="Cantiere non trovato")
    return cantiere.artigiani

@router.post("/{cantiere_id}/artigiani", status_code=201)
def assegna_artigiano(cantiere_id: int, body: AssegnaBody, db: Session = Depends(get_db), user: Utente = Depends(get_current_user)):
    if user.ruolo not in (RuoloUtente.admin, *_RUOLI_STEELEX):
        raise HTTPException(status_code=403, detail="Non autorizzato")
    cantiere = db.query(Cantiere).filter(Cantiere.id == cantiere_id).first()
    if not cantiere:
        raise HTTPException(status_code=404, detail="Cantiere non trovato")
    artigiano = db.query(Utente).filter(Utente.id == body.utente_id).first()
    if not artigiano:
        raise HTTPException(status_code=404, detail="Utente non trovato")
    if artigiano not in cantiere.artigiani:
        cantiere.artigiani.append(artigiano)
        db.commit()
    return {"ok": True}

@router.delete("/{cantiere_id}/artigiani/{utente_id}", status_code=204)
def rimuovi_artigiano(cantiere_id: int, utente_id: int, db: Session = Depends(get_db), user: Utente = Depends(get_current_user)):
    if user.ruolo not in (RuoloUtente.admin, *_RUOLI_STEELEX):
        raise HTTPException(status_code=403, detail="Non autorizzato")
    cantiere = db.query(Cantiere).filter(Cantiere.id == cantiere_id).first()
    if not cantiere:
        raise HTTPException(status_code=404, detail="Cantiere non trovato")
    cantiere.artigiani = [a for a in cantiere.artigiani if a.id != utente_id]
    db.commit()

# ─── EXPORT / IMPORT CANTIERE ────────────────────────────────────────────────

@router.get("/{cantiere_id}/export")
def export_cantiere(cantiere_id: int, db: Session = Depends(get_db), user: Utente = Depends(get_current_user)):
    """Esporta un cantiere completo come JSON. Solo admin."""
    if user.ruolo != RuoloUtente.admin:
        raise HTTPException(403, "Solo admin può esportare")
    c = db.query(Cantiere).filter(Cantiere.id == cantiere_id).first()
    if not c: raise HTTPException(404, "Cantiere non trovato")

    from app.models.checklist import ChecklistItem
    from app.models.economico import (FaseLavoro, OrdineAcquisto, FatturaFornitore,
                                       SAL, Spesa, PreventivoCantiere, BollaConsegna)
    from app.models.artigiano import Artigiano, FeedbackArtigiano

    def _d(v): return str(v) if v else None

    fasi = db.query(FaseLavoro).filter(FaseLavoro.cantiere_id == cantiere_id).order_by(FaseLavoro.ordine).all()
    checklist = db.query(ChecklistItem).filter(ChecklistItem.cantiere_id == cantiere_id).all()
    ordini = db.query(OrdineAcquisto).filter(OrdineAcquisto.cantiere_id == cantiere_id).all()
    fatture = db.query(FatturaFornitore).filter(FatturaFornitore.cantiere_id == cantiere_id).all()
    sals = db.query(SAL).filter(SAL.cantiere_id == cantiere_id).all()
    spese = db.query(Spesa).filter(Spesa.cantiere_id == cantiere_id).all()
    preventivi = db.query(PreventivoCantiere).filter(PreventivoCantiere.cantiere_id == cantiere_id).all()
    bolle = db.query(BollaConsegna).filter(BollaConsegna.cantiere_id == cantiere_id).all()

    # archivio documenti
    try:
        from sqlalchemy import text as _text
        rows = db.execute(_text("SELECT nome, categoria, descrizione, file_url, tipo_file FROM archivio_docs WHERE cantiere_id = :cid"), {"cid": cantiere_id}).fetchall()
        documenti = [{"nome": r[0], "categoria": r[1], "descrizione": r[2], "file_url": r[3], "tipo_file": r[4]} for r in rows]
    except Exception:
        documenti = []

    # artigiani con feedback su questo cantiere
    fb_rows = db.query(FeedbackArtigiano).filter(FeedbackArtigiano.cantiere_id == cantiere_id).all()
    arti_ids = list({fb.artigiano_id for fb in fb_rows})
    arti_list = db.query(Artigiano).filter(Artigiano.id.in_(arti_ids)).all() if arti_ids else []
    artigiani_export = []
    for a in arti_list:
        feedbacks_a = [fb for fb in fb_rows if fb.artigiano_id == a.id]
        artigiani_export.append({
            "nome": a.nome, "cognome": a.cognome, "azienda": a.azienda,
            "categoria": a.categoria, "telefono": a.telefono, "email": a.email,
            "note": a.note, "attivo": a.attivo,
            "feedback": [{"voto": fb.voto, "nota": fb.nota} for fb in feedbacks_a],
        })

    return {
        "cantiere": {
            "nome": c.nome, "indirizzo": c.indirizzo, "cliente": c.cliente,
            "citta": c.citta, "provincia": c.provincia,
            "stato": c.stato.value if c.stato else "preventivo",
            "data_inizio": _d(c.data_inizio), "data_fine_prevista": _d(c.data_fine_prevista),
            "budget": c.budget, "note": c.note,
        },
        "fasi": [{"nome": f.nome, "categoria": f.categoria, "colore": f.colore,
                  "data_inizio": _d(f.data_inizio), "data_fine_prevista": _d(f.data_fine_prevista),
                  "percentuale": f.percentuale, "stato": f.stato, "note": f.note, "ordine": f.ordine}
                 for f in fasi],
        "checklist": [{"testo": i.testo, "completato": i.completato} for i in checklist],
        "ordini": [{"fornitore_nome": o.fornitore_nome, "descrizione": o.descrizione,
                    "categoria": o.categoria.value if o.categoria else "materiali",
                    "importo": o.importo, "iva_perc": o.iva_perc, "importo_totale": o.importo_totale,
                    "stato": o.stato.value if o.stato else "bozza",
                    "data_ordine": _d(o.data_ordine), "data_consegna_prevista": _d(o.data_consegna_prevista),
                    "note": o.note} for o in ordini],
        "fatture": [{"fornitore_nome": f.fornitore_nome, "numero_fattura": f.numero_fattura,
                     "descrizione": f.descrizione, "importo_netto": f.importo_netto,
                     "iva_perc": f.iva_perc, "importo_iva": f.importo_iva, "importo_totale": f.importo_totale,
                     "data_fattura": _d(f.data_fattura), "data_scadenza": _d(f.data_scadenza),
                     "stato": f.stato.value if f.stato else "ricevuta", "pdf_url": f.pdf_url}
                    for f in fatture],
        "sal": [{"numero": s.numero, "titolo": s.titolo, "percentuale": s.percentuale,
                 "importo": s.importo, "data": _d(s.data),
                 "stato": s.stato.value if s.stato else "bozza", "note": s.note} for s in sals],
        "spese": [{"descrizione": s.descrizione, "fornitore": s.fornitore,
                   "categoria": s.categoria.value if s.categoria else "materiali",
                   "importo": s.importo, "data": _d(s.data), "note": s.note,
                   "allegato_url": s.allegato_url, "allegato_tipo": s.allegato_tipo} for s in spese],
        "preventivi": [{"numero": p.numero, "data": _d(p.data), "voci": p.voci,
                        "subtotale": p.subtotale, "iva_perc": p.iva_perc, "totale": p.totale,
                        "stato": p.stato.value if p.stato else "bozza", "note": p.note} for p in preventivi],
        "bolle": [{"fornitore_nome": b.fornitore_nome, "numero_bolla": b.numero_bolla,
                   "data": _d(b.data), "importo_stimato": b.importo_stimato,
                   "descrizione": b.descrizione, "stato": b.stato.value if b.stato else "aperta"} for b in bolle],
        "documenti": documenti,
        "artigiani": artigiani_export,
    }


@router.post("/import", status_code=201)
def import_cantiere(body: dict, db: Session = Depends(get_db), user: Utente = Depends(get_current_user)):
    """Importa un cantiere completo da JSON. Solo admin."""
    if user.ruolo != RuoloUtente.admin:
        raise HTTPException(403, "Solo admin può importare")

    from app.models.economico import (FaseLavoro, OrdineAcquisto, FatturaFornitore,
                                       SAL, Spesa, PreventivoCantiere, BollaConsegna,
                                       StatoOrdine, StatoFattura, StatoSAL, CategoriaOrdine,
                                       CategoriaSpesa, StatoPreventivo, StatoBolla)
    from app.models.checklist import ChecklistItem
    from app.models.artigiano import Artigiano, FeedbackArtigiano

    cd = body.get("cantiere", {})
    try: stato_enum = StatoCantiere(cd.get("stato", "preventivo"))
    except ValueError: stato_enum = StatoCantiere.preventivo

    c = Cantiere(
        nome=cd["nome"], indirizzo=cd.get("indirizzo"), cliente=cd.get("cliente") or "",
        citta=cd.get("citta"), provincia=cd.get("provincia"), stato=stato_enum,
        data_inizio=cd.get("data_inizio") or None,
        data_fine_prevista=cd.get("data_fine_prevista") or None,
        budget=cd.get("budget") or 0.0, note=cd.get("note"), responsabile_id=user.id,
    )
    db.add(c); db.flush()

    for f in body.get("fasi", []):
        db.add(FaseLavoro(cantiere_id=c.id, nome=f["nome"], categoria=f.get("categoria"),
            colore=f.get("colore"), data_inizio=f.get("data_inizio") or None,
            data_fine_prevista=f.get("data_fine_prevista") or None,
            percentuale=f.get("percentuale", 0), stato=f.get("stato", "pianificata"),
            note=f.get("note"), ordine=f.get("ordine", 0)))

    for i in body.get("checklist", []):
        db.add(ChecklistItem(cantiere_id=c.id, testo=i["testo"], completato=i.get("completato", False)))

    for o in body.get("ordini", []):
        try: cat = CategoriaOrdine(o.get("categoria", "materiali"))
        except ValueError: cat = CategoriaOrdine.materiali
        try: stato = StatoOrdine(o.get("stato", "bozza"))
        except ValueError: stato = StatoOrdine.bozza
        db.add(OrdineAcquisto(cantiere_id=c.id, fornitore_nome=o["fornitore_nome"],
            descrizione=o["descrizione"], categoria=cat, importo=o.get("importo", 0),
            iva_perc=o.get("iva_perc", 22), importo_totale=o.get("importo_totale", 0),
            stato=stato, data_ordine=o.get("data_ordine") or None,
            data_consegna_prevista=o.get("data_consegna_prevista") or None,
            note=o.get("note"), creato_da=user.id))

    for f in body.get("fatture", []):
        try: stato = StatoFattura(f.get("stato", "ricevuta"))
        except ValueError: stato = StatoFattura.ricevuta
        db.add(FatturaFornitore(cantiere_id=c.id, fornitore_nome=f["fornitore_nome"],
            numero_fattura=f.get("numero_fattura"), descrizione=f.get("descrizione"),
            importo_netto=f.get("importo_netto", 0), iva_perc=f.get("iva_perc", 22),
            importo_iva=f.get("importo_iva", 0), importo_totale=f.get("importo_totale", 0),
            data_fattura=f.get("data_fattura") or None, data_scadenza=f.get("data_scadenza") or None,
            stato=stato, pdf_url=f.get("pdf_url")))

    for s in body.get("sal", []):
        try: stato = StatoSAL(s.get("stato", "bozza"))
        except ValueError: stato = StatoSAL.bozza
        db.add(SAL(cantiere_id=c.id, numero=s["numero"], titolo=s["titolo"],
            percentuale=s.get("percentuale", 0), importo=s.get("importo", 0),
            data=s.get("data") or None, stato=stato, note=s.get("note")))

    for s in body.get("spese", []):
        try: cat = CategoriaSpesa(s.get("categoria", "materiali"))
        except ValueError: cat = CategoriaSpesa.materiali
        db.add(Spesa(cantiere_id=c.id, descrizione=s["descrizione"], fornitore=s.get("fornitore"),
            categoria=cat, importo=s.get("importo", 0), data=s.get("data") or None,
            note=s.get("note"), allegato_url=s.get("allegato_url"), allegato_tipo=s.get("allegato_tipo"),
            creato_da=user.id))

    for p in body.get("preventivi", []):
        try: stato = StatoPreventivo(p.get("stato", "bozza"))
        except ValueError: stato = StatoPreventivo.bozza
        db.add(PreventivoCantiere(cantiere_id=c.id, numero=p.get("numero"), data=p.get("data") or None,
            voci=p.get("voci", []), subtotale=p.get("subtotale", 0), iva_perc=p.get("iva_perc", 22),
            totale=p.get("totale", 0), stato=stato, note=p.get("note")))

    for b in body.get("bolle", []):
        try: stato = StatoBolla(b.get("stato", "aperta"))
        except ValueError: stato = StatoBolla.aperta
        db.add(BollaConsegna(cantiere_id=c.id, fornitore_nome=b["fornitore_nome"],
            numero_bolla=b.get("numero_bolla"), data=b.get("data") or None,
            importo_stimato=b.get("importo_stimato", 0), descrizione=b.get("descrizione"), stato=stato))

    for d in body.get("documenti", []):
        try:
            from sqlalchemy import text as _text
            db.execute(_text("""INSERT INTO archivio_docs (cantiere_id, nome, categoria, descrizione, file_url, tipo_file, caricato_da)
                VALUES (:cid, :nome, :cat, :desc, :url, :tipo, :uid)"""),
                {"cid": c.id, "nome": d["nome"], "cat": d.get("categoria","operativita"),
                 "desc": d.get("descrizione"), "url": d.get("file_url",""), "tipo": d.get("tipo_file"), "uid": user.id})
        except Exception:
            pass

    for a in body.get("artigiani", []):
        # cerca artigiano esistente per nome+cognome+azienda, altrimenti crea
        existing = db.query(Artigiano).filter(
            Artigiano.nome == a["nome"], Artigiano.cognome == a["cognome"]
        ).first()
        if not existing:
            existing = Artigiano(nome=a["nome"], cognome=a["cognome"], azienda=a.get("azienda"),
                categoria=a.get("categoria","altro"), telefono=a.get("telefono"),
                email=a.get("email"), note=a.get("note"), attivo=a.get("attivo", True),
                creato_da=user.id)
            db.add(existing); db.flush()
        for fb in a.get("feedback", []):
            db.add(FeedbackArtigiano(artigiano_id=existing.id, cantiere_id=c.id,
                voto=fb["voto"], nota=fb.get("nota"), autore_id=user.id))

    db.commit()
    return {"id": c.id, "nome": c.nome, "messaggio": "Cantiere importato con successo"}
