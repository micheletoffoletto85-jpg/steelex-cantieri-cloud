from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app.database import get_db
from app.models.utente import Utente
from app.schemas.utente import UtenteCreate, UtenteOut, UtenteUpdate
from app.auth import get_current_user, require_admin, hash_password
from app import password_visibile

router = APIRouter(prefix="/utenti", tags=["Utenti"])

@router.get("", response_model=List[UtenteOut])
def lista_utenti(db: Session = Depends(get_db), _=Depends(require_admin)):
    return db.query(Utente).all()

@router.post("", response_model=UtenteOut, status_code=201)
def crea_utente(data: UtenteCreate, db: Session = Depends(get_db), _=Depends(require_admin)):
    if db.query(Utente).filter(Utente.email == data.email).first():
        raise HTTPException(status_code=400, detail="Email già registrata")
    try:
        utente = Utente(**data.model_dump(mode='json', exclude={"password"}), password_hash=hash_password(data.password),
                        password_cifrata=password_visibile.cifra(data.password))
        db.add(utente)
        db.commit()
        db.refresh(utente)
        return utente
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/{utente_id}", response_model=UtenteOut)
def aggiorna_utente(utente_id: int, data: UtenteUpdate, db: Session = Depends(get_db), _=Depends(require_admin)):
    utente = db.query(Utente).filter(Utente.id == utente_id).first()
    if not utente:
        raise HTTPException(status_code=404, detail="Utente non trovato")
    # mode='json' garantisce stringhe pure (non oggetti enum) — compatibile col tipo nativo PostgreSQL
    update_data = data.model_dump(mode='json', exclude_none=True)
    # professione e costo orario si possono anche svuotare (null esplicito dal form)
    for campo in ("tipo_professione", "costo_orario", "telefono"):
        if campo in data.model_fields_set and getattr(data, campo) is None:
            update_data[campo] = None
    if "password" in update_data:
        nuova = update_data.pop("password")
        if not nuova.strip():
            raise HTTPException(status_code=400, detail="La password non può essere vuota")
        utente.password_hash = hash_password(nuova)
        utente.password_cifrata = password_visibile.cifra(nuova)
    try:
        for k, v in update_data.items():
            setattr(utente, k, v)
        db.commit()
        db.refresh(utente)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Errore aggiornamento DB: {e}")
    return utente

@router.delete("/{utente_id}", status_code=204)
def elimina_utente(utente_id: int, db: Session = Depends(get_db), current_user=Depends(require_admin)):
    if utente_id == current_user.id:
        raise HTTPException(status_code=400, detail="Non puoi eliminare te stesso")
    utente = db.query(Utente).filter(Utente.id == utente_id).first()
    if not utente:
        raise HTTPException(status_code=404, detail="Utente non trovato")
    db.delete(utente)
    db.commit()


@router.post("/{utente_id}/mostra-password")
def mostra_password(utente_id: int, db: Session = Depends(get_db), _=Depends(require_admin)):
    """Password attuale dell'utente, per i recuperi (solo admin)."""
    utente = db.query(Utente).filter(Utente.id == utente_id).first()
    if not utente:
        raise HTTPException(status_code=404, detail="Utente non trovato")
    pw = password_visibile.decifra(utente.password_cifrata)
    return {
        "password": pw,
        "nota": None if pw else "Non ancora disponibile: compare dopo il prossimo accesso dell'utente, oppure impostala tu dalla modifica",
    }
