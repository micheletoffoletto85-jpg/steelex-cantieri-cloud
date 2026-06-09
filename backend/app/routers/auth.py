from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session
from slowapi import Limiter
from slowapi.util import get_remote_address
from app.database import get_db
from app.models.utente import Utente, RuoloUtente
from pydantic import BaseModel
from app.schemas.utente import TokenResponse, UtenteCreate, UtenteOut
from app.auth import (
    verify_password, hash_password,
    create_access_token, create_refresh_token,
    get_user_from_refresh_token,
    get_current_user,
)

limiter = Limiter(key_func=get_remote_address)

class LoginRequest(BaseModel):
    email: str
    password: str

class RefreshResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"

router = APIRouter(prefix="/auth", tags=["Autenticazione"])

@router.post("/login", response_model=TokenResponse)
@limiter.limit("10/minute")
def login(request: Request, data: LoginRequest, db: Session = Depends(get_db)):
    utente = db.query(Utente).filter(Utente.email == data.email, Utente.attivo == True).first()
    # Confronto sempre (anche se utente non esiste) per evitare timing attack
    password_ok = utente is not None and verify_password(data.password, utente.password_hash)
    if not password_ok:
        raise HTTPException(status_code=401, detail="Email o password errati")
    access_token = create_access_token({"sub": str(utente.id)})
    refresh_token = create_refresh_token(utente.id)
    return {"access_token": access_token, "refresh_token": refresh_token, "utente": utente}

@router.post("/refresh", response_model=RefreshResponse)
@limiter.limit("30/minute")
def refresh(request: Request, utente: Utente = Depends(get_user_from_refresh_token)):
    access_token = create_access_token({"sub": str(utente.id)})
    return {"access_token": access_token}

@router.get("/me", response_model=UtenteOut)
def get_me(current_user: Utente = Depends(get_current_user)):
    return current_user

@router.post("/registra", status_code=201)
@limiter.limit("3/hour")
def registra_admin(request: Request, data: UtenteCreate, db: Session = Depends(get_db)):
    try:
        if db.query(Utente).count() > 0:
            raise HTTPException(status_code=403, detail="Registrazione pubblica disabilitata")
        utente = Utente(
            nome=data.nome,
            cognome=data.cognome,
            email=data.email,
            password_hash=hash_password(data.password),
            ruolo=RuoloUtente.admin,
        )
        db.add(utente)
        db.commit()
        db.refresh(utente)
        return {"id": utente.id, "email": utente.email, "nome": utente.nome, "ruolo": str(utente.ruolo)}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
