"""
Database fornitori/artigiani con sistema di rating e feedback.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime
from app.database import get_db
from app.models.fornitore_rating import FornitoreRating
from app.models.utente import Utente, RuoloUtente
from app.auth import get_current_user

router = APIRouter(prefix="/fornitori", tags=["Fornitori Rating"])

_RUOLI_SCRIVE = (RuoloUtente.admin, RuoloUtente.capo_cantiere, RuoloUtente.amministrazione)

CATEGORIE_RATING = ["puntualita", "qualita", "prezzo", "comunicazione", "sicurezza"]


class RatingCreate(BaseModel):
    fornitore_id: int
    cantiere_id: Optional[int] = None
    tipo: str = "positivo"       # positivo / negativo / neutro
    categoria: str = "qualita"
    punteggio: int = 3            # 1-5
    testo: Optional[str] = None


class RatingOut(BaseModel):
    id: int
    fornitore_id: int
    cantiere_id: Optional[int] = None
    tipo: str
    categoria: str
    punteggio: int
    testo: Optional[str] = None
    creato_da: int
    creato_il: Optional[datetime] = None

    class Config:
        from_attributes = True


class FornitoreConRating(BaseModel):
    id: int
    nome: str
    cognome: str
    email: str
    ruolo: str
    tipo_professione: Optional[str] = None
    attivo: bool
    media_punteggio: Optional[float] = None
    totale_feedback: int = 0
    feedback_positivi: int = 0
    feedback_negativi: int = 0

    class Config:
        from_attributes = True


@router.get("", response_model=List[FornitoreConRating])
def lista_fornitori(
    ruolo: Optional[str] = None,  # fornitore / artigiano / tutti
    professione: Optional[str] = None,
    db: Session = Depends(get_db),
    user: Utente = Depends(get_current_user),
):
    """Lista tutti i fornitori/artigiani con il loro rating aggregato."""
    q = db.query(Utente).filter(Utente.attivo == True)
    if ruolo and ruolo != "tutti":
        q = q.filter(Utente.ruolo == ruolo)
    else:
        q = q.filter(Utente.ruolo.in_(["fornitore", "artigiano"]))
    if professione:
        q = q.filter(Utente.tipo_professione == professione)
    utenti = q.order_by(Utente.cognome).all()

    result = []
    for u in utenti:
        ratings = db.query(FornitoreRating).filter(FornitoreRating.fornitore_id == u.id).all()
        media = round(sum(r.punteggio for r in ratings) / len(ratings), 1) if ratings else None
        positivi = sum(1 for r in ratings if r.tipo == "positivo")
        negativi = sum(1 for r in ratings if r.tipo == "negativo")
        result.append(FornitoreConRating(
            id=u.id, nome=u.nome, cognome=u.cognome, email=u.email,
            ruolo=u.ruolo, tipo_professione=u.tipo_professione, attivo=u.attivo,
            media_punteggio=media, totale_feedback=len(ratings),
            feedback_positivi=positivi, feedback_negativi=negativi,
        ))
    # ordina per media punteggio decrescente
    result.sort(key=lambda x: (x.media_punteggio or 0), reverse=True)
    return result


@router.get("/{fornitore_id}/rating", response_model=List[RatingOut])
def lista_rating_fornitore(
    fornitore_id: int,
    db: Session = Depends(get_db),
    user: Utente = Depends(get_current_user),
):
    ratings = db.query(FornitoreRating).filter(
        FornitoreRating.fornitore_id == fornitore_id
    ).order_by(FornitoreRating.creato_il.desc()).all()
    return ratings


@router.post("/{fornitore_id}/rating", response_model=RatingOut, status_code=201)
def aggiungi_rating(
    fornitore_id: int,
    body: RatingCreate,
    db: Session = Depends(get_db),
    user: Utente = Depends(get_current_user),
):
    if user.ruolo not in _RUOLI_SCRIVE:
        raise HTTPException(403, "Solo admin, capo cantiere o amministrazione può lasciare feedback")
    if body.punteggio < 1 or body.punteggio > 5:
        raise HTTPException(400, "Punteggio deve essere tra 1 e 5")
    if body.categoria not in CATEGORIE_RATING:
        raise HTTPException(400, f"Categoria non valida. Usa: {', '.join(CATEGORIE_RATING)}")
    if body.tipo not in ("positivo", "negativo", "neutro"):
        raise HTTPException(400, "Tipo deve essere: positivo, negativo, neutro")

    fornitore = db.query(Utente).filter(Utente.id == fornitore_id).first()
    if not fornitore:
        raise HTTPException(404, "Fornitore non trovato")

    rating = FornitoreRating(
        fornitore_id=fornitore_id,
        cantiere_id=body.cantiere_id,
        tipo=body.tipo,
        categoria=body.categoria,
        punteggio=body.punteggio,
        testo=body.testo,
        creato_da=user.id,
    )
    db.add(rating)
    db.commit()
    db.refresh(rating)
    return rating


@router.delete("/{fornitore_id}/rating/{rating_id}", status_code=204)
def elimina_rating(
    fornitore_id: int,
    rating_id: int,
    db: Session = Depends(get_db),
    user: Utente = Depends(get_current_user),
):
    if user.ruolo not in _RUOLI_SCRIVE:
        raise HTTPException(403, "Non autorizzato")
    r = db.query(FornitoreRating).filter(
        FornitoreRating.id == rating_id,
        FornitoreRating.fornitore_id == fornitore_id
    ).first()
    if not r:
        raise HTTPException(404, "Rating non trovato")
    db.delete(r)
    db.commit()
