from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.database import get_db
from app.routers.auth import get_current_user
from pydantic import BaseModel
from typing import Optional

router = APIRouter(prefix="/ore-lavorate", tags=["ore-lavorate"])

# Chi può registrare le proprie ore: anche operativi/artigiani e capi cantiere (es. Flavian, Alberto)
RUOLI_AMMESSI = {"admin", "amministrazione", "artigiano", "operativo", "capo_cantiere", "capo_cantiere_sub"}
# Chi vede le ore di tutti: solo admin e amministrazione
RUOLI_VEDONO_TUTTI = {"admin", "amministrazione"}

def _check(utente):
    if utente.ruolo not in RUOLI_AMMESSI:
        raise HTTPException(403, "Accesso riservato ad admin, amministrazione e operativi")

class OreIn(BaseModel):
    data: str                      # YYYY-MM-DD
    ore: float                     # ore lavorate (es. 7.5)
    descrizione: str               # dettaglio operazioni svolte

@router.get("/utenti")
def lista_utenti(db: Session = Depends(get_db), utente=Depends(get_current_user)):
    """Utenti che possono registrare ore, per il filtro (solo admin/amministrazione)."""
    if utente.ruolo not in RUOLI_VEDONO_TUTTI:
        raise HTTPException(403, "Accesso riservato ad admin e amministrazione")
    rows = db.execute(text("""
        SELECT id, nome, cognome, ruolo FROM utenti
        WHERE ruolo IN ('admin', 'amministrazione', 'artigiano', 'operativo', 'capo_cantiere', 'capo_cantiere_sub') AND attivo = TRUE
        ORDER BY cognome, nome
    """)).mappings().all()
    return [dict(r) for r in rows]

@router.get("")
def lista_ore(mese: Optional[str] = None, utente_id: Optional[int] = None,
              db: Session = Depends(get_db), utente=Depends(get_current_user)):
    """Registro ore del mese. Admin/amministrazione vedono tutti, gli operativi solo le proprie."""
    _check(utente)
    where = ["1=1"]
    params = {}
    if mese:  # formato YYYY-MM
        where.append("to_char(o.data, 'YYYY-MM') = :mese")
        params["mese"] = mese
    if utente.ruolo not in RUOLI_VEDONO_TUTTI:
        where.append("o.utente_id = :uid")
        params["uid"] = utente.id
    elif utente_id:
        where.append("o.utente_id = :uid")
        params["uid"] = utente_id
    rows = db.execute(text(f"""
        SELECT o.id, o.utente_id, o.data, o.ore, o.descrizione,
               o.creato_il, o.aggiornato_il, u.nome, u.cognome
        FROM ore_lavorate o
        LEFT JOIN utenti u ON u.id = o.utente_id
        WHERE {' AND '.join(where)}
        ORDER BY o.data DESC, o.id DESC
    """), params).mappings().all()
    return [dict(r) for r in rows]

@router.post("")
def crea_ore(payload: OreIn, db: Session = Depends(get_db), utente=Depends(get_current_user)):
    _check(utente)
    if payload.ore <= 0 or payload.ore > 24:
        raise HTTPException(400, "Ore non valide (deve essere tra 0 e 24)")
    if not payload.descrizione.strip():
        raise HTTPException(400, "Il dettaglio delle operazioni è obbligatorio")
    r = db.execute(text("""
        INSERT INTO ore_lavorate (utente_id, data, ore, descrizione)
        VALUES (:uid, :data, :ore, :descrizione)
        RETURNING id, utente_id, data, ore, descrizione, creato_il, aggiornato_il
    """), {"uid": utente.id, "data": payload.data, "ore": payload.ore,
           "descrizione": payload.descrizione.strip()})
    db.commit()
    row = r.mappings().first()
    return {**dict(row), "nome": utente.nome, "cognome": utente.cognome}

def _riga_o_404(oid, db, utente):
    """Recupera la riga e verifica la proprietà (admin può tutto)."""
    row = db.execute(text("SELECT id, utente_id FROM ore_lavorate WHERE id = :id"),
                     {"id": oid}).mappings().first()
    if not row:
        raise HTTPException(404, "Registrazione non trovata")
    if utente.ruolo not in RUOLI_VEDONO_TUTTI and row["utente_id"] != utente.id:
        raise HTTPException(403, "Puoi modificare solo le tue registrazioni")
    return row

@router.put("/{oid}")
def aggiorna_ore(oid: int, payload: OreIn, db: Session = Depends(get_db), utente=Depends(get_current_user)):
    _check(utente)
    if payload.ore <= 0 or payload.ore > 24:
        raise HTTPException(400, "Ore non valide (deve essere tra 0 e 24)")
    _riga_o_404(oid, db, utente)
    db.execute(text("""
        UPDATE ore_lavorate
        SET data = :data, ore = :ore, descrizione = :descrizione, aggiornato_il = NOW()
        WHERE id = :id
    """), {"data": payload.data, "ore": payload.ore,
           "descrizione": payload.descrizione.strip(), "id": oid})
    db.commit()
    return {"ok": True}

@router.delete("/{oid}")
def elimina_ore(oid: int, db: Session = Depends(get_db), utente=Depends(get_current_user)):
    _check(utente)
    _riga_o_404(oid, db, utente)
    db.execute(text("DELETE FROM ore_lavorate WHERE id = :id"), {"id": oid})
    db.commit()
    return {"ok": True}
