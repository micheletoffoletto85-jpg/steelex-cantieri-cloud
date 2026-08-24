import os
from fastapi import APIRouter, Depends, Query, HTTPException, Header
from fastapi.responses import PlainTextResponse
from sqlalchemy.orm import Session
from sqlalchemy import text
from datetime import datetime
from app.database import get_db
from app.routers.auth import get_current_user
from pydantic import BaseModel
from typing import Optional

router = APIRouter(prefix="/error-log", tags=["error-log"])


def _verifica_api_key(x_api_key: str = Header(...)):
    """Auth alternativa (no JWT) per l'automazione di sync incrociata STEELEX/FR."""
    chiave_attesa = os.environ.get("DASHBOARD_API_KEY", "")
    if not chiave_attesa or x_api_key != chiave_attesa:
        raise HTTPException(status_code=401, detail="API key non valida")

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

@router.get("/sync", dependencies=[Depends(_verifica_api_key)])
def sync_errori(db: Session = Depends(get_db), since_id: int = Query(0), limit: int = Query(200, le=500)):
    """Errori nuovi (id > since_id) per l'automazione di correzione incrociata STEELEX/FR."""
    rows = db.execute(text("""
        SELECT el.id, el.creato_il, el.ruolo, el.endpoint, el.metodo, el.status_code, el.messaggio, el.url_pagina, el.dettagli
        FROM error_log el
        WHERE el.id > :sid
        ORDER BY el.id ASC
        LIMIT :lim
    """), {"sid": since_id, "lim": limit}).mappings().all()
    return {"errori": [dict(r) for r in rows]}


@router.delete("/sync", dependencies=[Depends(_verifica_api_key)])
def elimina_sincronizzati(db: Session = Depends(get_db), min_id: int = Query(0), max_id: int = Query(...)):
    """Elimina gli errori già sincronizzati e processati dall'automazione di correzione
    incrociata (min_id < id <= max_id) — evita che l'error log cresca all'infinito con
    errori già corretti, senza intaccare quelli non ancora processati."""
    db.execute(text("DELETE FROM error_log WHERE id > :min_id AND id <= :max_id"),
               {"min_id": min_id, "max_id": max_id})
    db.commit()
    return {"ok": True}


@router.get("/export")
def esporta_errori_txt(db: Session = Depends(get_db), utente=Depends(get_current_user)):
    if utente.ruolo != "admin":
        raise HTTPException(403, "Solo admin")
    rows = db.execute(text("""
        SELECT el.id, el.creato_il, el.utente_id, u.nome, u.cognome, el.ruolo,
               el.endpoint, el.metodo, el.status_code, el.messaggio, el.url_pagina, el.dettagli
        FROM error_log el
        LEFT JOIN utenti u ON u.id = el.utente_id
        ORDER BY el.creato_il DESC
    """)).mappings().all()

    if not rows:
        contenuto = "Nessun errore registrato.\n"
    else:
        blocchi = []
        for r in rows:
            utente_str = f"{r['nome'] or '?'} {r['cognome'] or ''} ({r['ruolo']})".strip()
            blocco = (
                f"[{r['creato_il']}] #{r['id']} — {r['status_code']} {r['metodo']} {r['endpoint']}\n"
                f"  Utente: {utente_str}\n"
                f"  Pagina: {r['url_pagina'] or '-'}\n"
                f"  Messaggio: {r['messaggio'] or '-'}\n"
            )
            if r["dettagli"]:
                blocco += f"  Dettagli: {r['dettagli']}\n"
            blocchi.append(blocco)
        contenuto = ("-" * 70 + "\n").join(blocchi)

    nome_file = f"error-log-{datetime.now().strftime('%Y%m%d-%H%M')}.txt"
    return PlainTextResponse(
        contenuto,
        headers={"Content-Disposition": f'attachment; filename="{nome_file}"'},
    )

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
