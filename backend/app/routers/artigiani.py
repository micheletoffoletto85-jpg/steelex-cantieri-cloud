"""
Rubrica artigiani/fornitori con sistema di feedback pollice su/medio/giù.
Anagrafica indipendente dagli account utente.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime, date
from app.database import get_db
from app.models.artigiano import Artigiano, FeedbackArtigiano, CantiereArtigiano
from app.models.utente import Utente
from app.auth import get_current_user

router = APIRouter(prefix="/artigiani", tags=["Artigiani"])

_RUOLI_SCRIVE = {"admin", "capo_cantiere", "capo_cantiere_sub", "direzione_lavori", "amministrazione"}

CATEGORIE = [
    "carpenteria_metallica",
    "muratura",
    "impianti_elettrici",
    "impianti_idraulici",
    "serramenti_infissi",
    "pavimenti_rivestimenti",
    "isolamento_cappotto",
    "tinteggiatura_finiture",
    "coperture_tetti",
    "movimento_terra",
    "ponteggi",
    "gru_sollevamento",
    "trasporti",
    "altro",
]

CATEGORIE_LABEL = {
    "carpenteria_metallica":   "⚙️ Carpenteria / Saldatura",
    "muratura":                "🧱 Muratura",
    "impianti_elettrici":      "⚡ Impianti elettrici",
    "impianti_idraulici":      "🔧 Impianti idraulici",
    "serramenti_infissi":      "🚪 Serramenti / Infissi",
    "pavimenti_rivestimenti":  "🏠 Pavimenti / Rivestimenti",
    "isolamento_cappotto":     "🧊 Isolamento / Cappotto",
    "tinteggiatura_finiture":  "🎨 Tinteggiatura / Finiture",
    "coperture_tetti":         "🏗️ Coperture / Tetti",
    "movimento_terra":         "🚜 Movimento terra / Scavi",
    "ponteggi":                "🏗️ Ponteggi",
    "gru_sollevamento":        "🏋️ Gru / Sollevamento",
    "trasporti":               "🚚 Trasporti",
    "altro":                   "👷 Altro",
}


def _calcola_score(feedbacks: list) -> dict:
    totale = len(feedbacks)
    if totale == 0:
        return {"score": None, "totale": 0, "su": 0, "medio": 0, "giu": 0}
    su    = sum(1 for f in feedbacks if f.voto == "su")
    medio = sum(1 for f in feedbacks if f.voto == "medio")
    giu   = sum(1 for f in feedbacks if f.voto == "giu")
    score = round((su + medio * 0.5) / totale * 100)
    return {"score": score, "totale": totale, "su": su, "medio": medio, "giu": giu}


def _tags_to_list(tags_str: Optional[str]) -> List[str]:
    if not tags_str:
        return []
    return [t.strip() for t in tags_str.split(",") if t.strip()]


# ── Schemi ────────────────────────────────────────────────────────────────────

class ArtigianoCreate(BaseModel):
    nome: str
    cognome: str
    azienda: Optional[str] = None
    categoria: str = "altro"
    tags: Optional[List[str]] = None
    telefono: Optional[str] = None
    email: Optional[str] = None
    note: Optional[str] = None
    durc_scadenza: Optional[date] = None
    durc_drive_url: Optional[str] = None
    primo_soccorso_scadenza: Optional[date] = None
    primo_soccorso_drive_url: Optional[str] = None
    visura_camerale_scadenza: Optional[date] = None
    visura_camerale_drive_url: Optional[str] = None
    drive_folder_url: Optional[str] = None

class ArtigianoUpdate(BaseModel):
    nome: Optional[str] = None
    cognome: Optional[str] = None
    azienda: Optional[str] = None
    categoria: Optional[str] = None
    tags: Optional[List[str]] = None
    telefono: Optional[str] = None
    email: Optional[str] = None
    note: Optional[str] = None
    attivo: Optional[bool] = None
    utente_id: Optional[int] = None
    durc_scadenza: Optional[date] = None
    durc_drive_url: Optional[str] = None
    primo_soccorso_scadenza: Optional[date] = None
    primo_soccorso_drive_url: Optional[str] = None
    visura_camerale_scadenza: Optional[date] = None
    visura_camerale_drive_url: Optional[str] = None
    drive_folder_url: Optional[str] = None

class FeedbackCreate(BaseModel):
    voto: str           # su | medio | giu
    nota: Optional[str] = None
    cantiere_id: Optional[int] = None

class FeedbackOut(BaseModel):
    id: int
    artigiano_id: int
    cantiere_id: Optional[int] = None
    voto: str
    nota: Optional[str] = None
    autore_id: int
    autore_nome: Optional[str] = None
    cantiere_nome: Optional[str] = None
    creato_il: Optional[datetime] = None
    class Config: from_attributes = True

class ArtigianoOut(BaseModel):
    id: int
    nome: str
    cognome: str
    azienda: Optional[str] = None
    categoria: str
    categoria_label: Optional[str] = None
    tags: List[str] = []
    telefono: Optional[str] = None
    email: Optional[str] = None
    note: Optional[str] = None
    attivo: bool
    utente_id: Optional[int] = None
    utente_nome: Optional[str] = None
    durc_scadenza: Optional[date] = None
    durc_drive_url: Optional[str] = None
    primo_soccorso_scadenza: Optional[date] = None
    primo_soccorso_drive_url: Optional[str] = None
    visura_camerale_scadenza: Optional[date] = None
    visura_camerale_drive_url: Optional[str] = None
    drive_folder_url: Optional[str] = None
    score: Optional[int] = None
    totale_feedback: int = 0
    su: int = 0
    medio: int = 0
    giu: int = 0
    class Config: from_attributes = True

class CantiereArtigianoCreate(BaseModel):
    artigiano_id: int
    note: Optional[str] = None

class CantiereArtigianoOut(BaseModel):
    id: int
    artigiano_id: int
    cantiere_id: int
    note: Optional[str] = None
    aggiunto_il: Optional[datetime] = None
    artigiano: Optional[ArtigianoOut] = None
    class Config: from_attributes = True


def _artigiano_out(a: Artigiano, db: Session) -> ArtigianoOut:
    stats = _calcola_score(a.feedback)
    utente_nome = None
    if a.utente_id:
        u = db.query(Utente).filter(Utente.id == a.utente_id).first()
        if u: utente_nome = f"{u.nome} {u.cognome}".strip()
    return ArtigianoOut(
        id=a.id, nome=a.nome, cognome=a.cognome, azienda=a.azienda,
        categoria=a.categoria, categoria_label=CATEGORIE_LABEL.get(a.categoria, a.categoria),
        tags=_tags_to_list(a.tags),
        telefono=a.telefono, email=a.email, note=a.note, attivo=a.attivo,
        utente_id=a.utente_id, utente_nome=utente_nome,
        durc_scadenza=a.durc_scadenza, durc_drive_url=a.durc_drive_url,
        primo_soccorso_scadenza=a.primo_soccorso_scadenza,
        primo_soccorso_drive_url=a.primo_soccorso_drive_url,
        visura_camerale_scadenza=a.visura_camerale_scadenza,
        visura_camerale_drive_url=a.visura_camerale_drive_url,
        drive_folder_url=a.drive_folder_url,
        score=stats["score"], totale_feedback=stats["totale"],
        su=stats["su"], medio=stats["medio"], giu=stats["giu"],
    )


# ── Endpoint lista / CRUD ─────────────────────────────────────────────────────

@router.get("", response_model=List[ArtigianoOut])
def lista_artigiani(
    categoria: Optional[str] = Query(None),
    solo_attivi: bool = Query(True),
    q: Optional[str] = Query(None),
    cantiere_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    user: Utente = Depends(get_current_user),
):
    query = db.query(Artigiano)
    if solo_attivi:
        query = query.filter(Artigiano.attivo == True)
    if categoria:
        query = query.filter(Artigiano.categoria == categoria)
    if cantiere_id:
        # Artigiani assegnati a questo cantiere via join table
        query = query.join(CantiereArtigiano, CantiereArtigiano.artigiano_id == Artigiano.id).filter(
            CantiereArtigiano.cantiere_id == cantiere_id
        )
    artigiani = query.order_by(Artigiano.cognome).all()
    result = [_artigiano_out(a, db) for a in artigiani]

    if q:
        q_low = q.lower()
        result = [
            a for a in result
            if q_low in f"{a.nome} {a.cognome} {a.azienda or ''} {a.note or ''} {' '.join(a.tags)}".lower()
        ]

    result.sort(key=lambda a: (a.score is None, -(a.score or 0)))
    return result


@router.post("", response_model=ArtigianoOut, status_code=201)
def crea_artigiano(
    body: ArtigianoCreate,
    db: Session = Depends(get_db),
    user: Utente = Depends(get_current_user),
):
    if str(user.ruolo).split(".")[-1] not in _RUOLI_SCRIVE:
        raise HTTPException(403, "Non autorizzato")
    if body.categoria not in CATEGORIE:
        raise HTTPException(400, "Categoria non valida")
    data = body.model_dump()
    tags_list = data.pop("tags", None) or []
    data["tags"] = ",".join(tags_list) if tags_list else None
    a = Artigiano(**data, creato_da=user.id)
    db.add(a); db.commit(); db.refresh(a)
    return _artigiano_out(a, db)


@router.put("/{artigiano_id}", response_model=ArtigianoOut)
def aggiorna_artigiano(
    artigiano_id: int,
    body: ArtigianoUpdate,
    db: Session = Depends(get_db),
    user: Utente = Depends(get_current_user),
):
    if str(user.ruolo).split(".")[-1] not in _RUOLI_SCRIVE:
        raise HTTPException(403, "Non autorizzato")
    a = db.query(Artigiano).filter(Artigiano.id == artigiano_id).first()
    if not a: raise HTTPException(404, "Non trovato")
    data = body.model_dump(exclude_none=True)
    if "tags" in data:
        data["tags"] = ",".join(data["tags"]) if data["tags"] else None
    for k, v in data.items():
        setattr(a, k, v)
    db.commit(); db.refresh(a)
    return _artigiano_out(a, db)


@router.delete("/{artigiano_id}", status_code=204)
def elimina_artigiano(
    artigiano_id: int,
    db: Session = Depends(get_db),
    user: Utente = Depends(get_current_user),
):
    if str(user.ruolo).split(".")[-1] not in {"admin"}:
        raise HTTPException(403, "Solo admin può eliminare")
    a = db.query(Artigiano).filter(Artigiano.id == artigiano_id).first()
    if not a: raise HTTPException(404, "Non trovato")
    db.delete(a); db.commit()


# ── Assegnazione artigiani a cantiere ────────────────────────────────────────

@router.get("/cantiere/{cantiere_id}", response_model=List[ArtigianoOut])
def artigiani_del_cantiere(
    cantiere_id: int,
    db: Session = Depends(get_db),
    user: Utente = Depends(get_current_user),
):
    assoc = db.query(CantiereArtigiano).filter(CantiereArtigiano.cantiere_id == cantiere_id).all()
    ids = [a.artigiano_id for a in assoc]
    artigiani = db.query(Artigiano).filter(Artigiano.id.in_(ids)).all()
    return [_artigiano_out(a, db) for a in artigiani]


@router.post("/cantiere/{cantiere_id}", response_model=ArtigianoOut, status_code=201)
def assegna_artigiano_cantiere(
    cantiere_id: int,
    body: CantiereArtigianoCreate,
    db: Session = Depends(get_db),
    user: Utente = Depends(get_current_user),
):
    if str(user.ruolo).split(".")[-1] not in _RUOLI_SCRIVE:
        raise HTTPException(403, "Non autorizzato")
    esiste = db.query(CantiereArtigiano).filter(
        CantiereArtigiano.cantiere_id == cantiere_id,
        CantiereArtigiano.artigiano_id == body.artigiano_id,
    ).first()
    if esiste:
        raise HTTPException(400, "Artigiano già assegnato a questo cantiere")
    assoc = CantiereArtigiano(cantiere_id=cantiere_id, artigiano_id=body.artigiano_id, note=body.note)
    db.add(assoc); db.commit()
    a = db.query(Artigiano).filter(Artigiano.id == body.artigiano_id).first()
    if not a: raise HTTPException(404, "Artigiano non trovato")
    return _artigiano_out(a, db)


@router.delete("/cantiere/{cantiere_id}/{artigiano_id}", status_code=204)
def rimuovi_artigiano_cantiere(
    cantiere_id: int,
    artigiano_id: int,
    db: Session = Depends(get_db),
    user: Utente = Depends(get_current_user),
):
    if str(user.ruolo).split(".")[-1] not in _RUOLI_SCRIVE:
        raise HTTPException(403, "Non autorizzato")
    assoc = db.query(CantiereArtigiano).filter(
        CantiereArtigiano.cantiere_id == cantiere_id,
        CantiereArtigiano.artigiano_id == artigiano_id,
    ).first()
    if not assoc: raise HTTPException(404, "Associazione non trovata")
    db.delete(assoc); db.commit()


# ── Documenti scadenza (admin panel) ─────────────────────────────────────────

@router.get("/scadenze", response_model=List[dict])
def documenti_in_scadenza(
    giorni: int = Query(30, description="Documenti in scadenza entro N giorni"),
    db: Session = Depends(get_db),
    user: Utente = Depends(get_current_user),
):
    """Tutti i documenti in scadenza o scaduti, per Susanna."""
    from datetime import timedelta
    oggi = date.today()
    limite = oggi + timedelta(days=giorni)
    artigiani = db.query(Artigiano).filter(Artigiano.attivo == True).all()
    result = []
    for a in artigiani:
        docs = [
            ("DURC", a.durc_scadenza, a.durc_drive_url),
            ("Primo Soccorso", a.primo_soccorso_scadenza, a.primo_soccorso_drive_url),
            ("Visura Camerale", a.visura_camerale_scadenza, a.visura_camerale_drive_url),
        ]
        for nome_doc, scad, url in docs:
            if scad and scad <= limite:
                result.append({
                    "artigiano_id": a.id,
                    "artigiano_nome": f"{a.nome} {a.cognome}",
                    "azienda": a.azienda,
                    "documento": nome_doc,
                    "scadenza": scad.isoformat(),
                    "scaduto": scad < oggi,
                    "giorni_mancanti": (scad - oggi).days,
                    "url": url,
                    "drive_folder_url": a.drive_folder_url,
                })
    result.sort(key=lambda x: x["scadenza"])
    return result


# ── Feedback ─────────────────────────────────────────────────────────────────

@router.post("/{artigiano_id}/feedback", response_model=FeedbackOut, status_code=201)
def aggiungi_feedback(
    artigiano_id: int,
    body: FeedbackCreate,
    db: Session = Depends(get_db),
    user: Utente = Depends(get_current_user),
):
    if str(user.ruolo).split(".")[-1] not in _RUOLI_SCRIVE:
        raise HTTPException(403, "Solo admin/capocantiere può lasciare feedback")
    if body.voto not in ("su", "medio", "giu"):
        raise HTTPException(400, "Voto deve essere: su, medio, giu")
    a = db.query(Artigiano).filter(Artigiano.id == artigiano_id).first()
    if not a: raise HTTPException(404, "Artigiano non trovato")
    fb = FeedbackArtigiano(
        artigiano_id=artigiano_id, voto=body.voto, nota=body.nota,
        cantiere_id=body.cantiere_id, autore_id=user.id,
    )
    db.add(fb); db.commit(); db.refresh(fb)
    return _feedback_out(fb, db)


@router.get("/{artigiano_id}/feedback", response_model=List[FeedbackOut])
def lista_feedback(
    artigiano_id: int,
    db: Session = Depends(get_db),
    user: Utente = Depends(get_current_user),
):
    feedbacks = db.query(FeedbackArtigiano).filter(
        FeedbackArtigiano.artigiano_id == artigiano_id
    ).order_by(FeedbackArtigiano.creato_il.desc()).all()
    return [_feedback_out(f, db) for f in feedbacks]


@router.delete("/{artigiano_id}/feedback/{feedback_id}", status_code=204)
def elimina_feedback(
    artigiano_id: int, feedback_id: int,
    db: Session = Depends(get_db),
    user: Utente = Depends(get_current_user),
):
    if str(user.ruolo).split(".")[-1] not in _RUOLI_SCRIVE:
        raise HTTPException(403, "Non autorizzato")
    fb = db.query(FeedbackArtigiano).filter(
        FeedbackArtigiano.id == feedback_id,
        FeedbackArtigiano.artigiano_id == artigiano_id,
    ).first()
    if not fb: raise HTTPException(404, "Feedback non trovato")
    db.delete(fb); db.commit()


@router.get("/categorie", response_model=List[dict])
def lista_categorie(user: Utente = Depends(get_current_user)):
    return [{"value": k, "label": v} for k, v in CATEGORIE_LABEL.items()]


def _feedback_out(fb: FeedbackArtigiano, db: Session) -> FeedbackOut:
    autore = db.query(Utente).filter(Utente.id == fb.autore_id).first()
    autore_nome = f"{autore.nome} {autore.cognome}".strip() if autore else None
    cantiere_nome = None
    if fb.cantiere_id:
        from app.models.cantiere import Cantiere
        c = db.query(Cantiere).filter(Cantiere.id == fb.cantiere_id).first()
        cantiere_nome = c.nome if c else None
    return FeedbackOut(
        id=fb.id, artigiano_id=fb.artigiano_id, cantiere_id=fb.cantiere_id,
        voto=fb.voto, nota=fb.nota, autore_id=fb.autore_id,
        autore_nome=autore_nome, cantiere_nome=cantiere_nome, creato_il=fb.creato_il,
    )
