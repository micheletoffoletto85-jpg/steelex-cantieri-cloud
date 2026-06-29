from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.database import get_db
from app.routers.auth import get_current_user
from pydantic import BaseModel
from typing import Optional

router = APIRouter(prefix="/error-log", tags=["error-log"])

class ErrorIn(BaseModel):
    endpoint: Optional[str] = None
    metodo: Optional[str] = None
    status_code: Optional[int] = None
    messaggio: Optional[str] = None
    url_pagina: Optional[str] = None
    dettagli: Optional[str] = None

@router.post("")
def registra_errore(payload: ErrorIn, db: Session = Depends(get_db), utente=Depends(get_current_user)):
    db.execute(text("""
        INSERT INTO error_log (utente_id, ruolo, endpoint, metodo, status_code, messaggio, url_pagina, dettagli)
        VALUES (:uid, :ruolo, :ep, :met, :sc, :msg, :url, :det)
    """), {
        "uid": utente.id,
        "ruolo": utente.ruolo,
        "ep": payload.endpoint,
        "met": payload.metodo,
        "sc": payload.status_code,
        "msg": payload.messaggio,
        "url": payload.url_pagina,
        "det": payload.dettagli,
    })
    db.commit()
    return {"ok": True}

@router.get("")
def lista_errori(
    db: Session = Depends(get_db),
    utente=Depends(get_current_user),
    limit: int = Query(100, le=500),
    offset: int = Query(0),
):
    if utente.ruolo != "admin":
        from fastapi import HTTPException
        raise HTTPException(403, "Solo admin")
    rows = db.execute(text("""
        SELECT el.id, el.creato_il, el.utente_id, u.nome, u.cognome, el.ruolo,
               el.endpoint, el.metodo, el.status_code, el.messaggio, el.url_pagina, el.dettagli
        FROM error_log el
        LEFT JOIN utenti u ON u.id = el.utente_id
        ORDER BY el.creato_il DESC
        LIMIT :lim OFFSET :off
    """), {"lim": limit, "off": offset}).mappings().all()
    totale = db.execute(text("SELECT COUNT(*) FROM error_log")).scalar()
    return {"totale": totale, "errori": [dict(r) for r in rows]}

@router.delete("/{eid}")
def elimina_errore(eid: int, db: Session = Depends(get_db), utente=Depends(get_current_user)):
    if utente.ruolo != "admin":
        from fastapi import HTTPException
        raise HTTPException(403, "Solo admin")
    db.execute(text("DELETE FROM error_log WHERE id = :id"), {"id": eid})
    db.commit()
    return {"ok": True}

@router.delete("")
def svuota_log(db: Session = Depends(get_db), utente=Depends(get_current_user)):
    if utente.ruolo != "admin":
        from fastapi import HTTPException
        raise HTTPException(403, "Solo admin")
    db.execute(text("DELETE FROM error_log"))
    db.commit()
    return {"ok": True}
