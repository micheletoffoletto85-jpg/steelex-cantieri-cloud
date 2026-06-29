from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.database import get_db
from app.routers.auth import get_current_user
from pydantic import BaseModel
from typing import Optional

router = APIRouter(prefix="/appunti", tags=["appunti"])

RUOLI_AMMESSI = {"admin", "amministrazione"}

def _check(utente):
    if utente.ruolo not in RUOLI_AMMESSI:
        raise HTTPException(403, "Accesso riservato ad admin e amministrazione")

class AppuntoIn(BaseModel):
    testo: str
    colore: Optional[str] = "giallo"  # giallo, verde, rosso, blu

@router.get("")
def lista_appunti(db: Session = Depends(get_db), utente=Depends(get_current_user)):
    _check(utente)
    rows = db.execute(text("""
        SELECT a.id, a.testo, a.colore, a.creato_il, a.aggiornato_il,
               u.nome, u.cognome
        FROM appunti_admin a
        LEFT JOIN utenti u ON u.id = a.autore_id
        ORDER BY a.aggiornato_il DESC NULLS LAST, a.creato_il DESC
    """)).mappings().all()
    return [dict(r) for r in rows]

@router.post("")
def crea_appunto(payload: AppuntoIn, db: Session = Depends(get_db), utente=Depends(get_current_user)):
    _check(utente)
    r = db.execute(text("""
        INSERT INTO appunti_admin (testo, colore, autore_id)
        VALUES (:testo, :colore, :uid)
        RETURNING id, testo, colore, creato_il, aggiornato_il
    """), {"testo": payload.testo, "colore": payload.colore, "uid": utente.id})
    db.commit()
    row = r.mappings().first()
    return {**dict(row), "nome": utente.nome, "cognome": utente.cognome}

@router.put("/{aid}")
def aggiorna_appunto(aid: int, payload: AppuntoIn, db: Session = Depends(get_db), utente=Depends(get_current_user)):
    _check(utente)
    db.execute(text("""
        UPDATE appunti_admin SET testo = :testo, colore = :colore, aggiornato_il = NOW()
        WHERE id = :id
    """), {"testo": payload.testo, "colore": payload.colore, "id": aid})
    db.commit()
    return {"ok": True}

@router.delete("/{aid}")
def elimina_appunto(aid: int, db: Session = Depends(get_db), utente=Depends(get_current_user)):
    _check(utente)
    db.execute(text("DELETE FROM appunti_admin WHERE id = :id"), {"id": aid})
    db.commit()
    return {"ok": True}
