from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.utente import Utente, RuoloUtente
from app.schemas.utente import LoginRequest, TokenResponse, UtenteCreate, UtenteOut
from app.auth import verify_password, hash_password, create_access_token, get_current_user

router = APIRouter(prefix="/auth", tags=["Autenticazione"])

@router.post("/login", response_model=TokenResponse)
def login(data: LoginRequest, db: Session = Depends(get_db)):
    utente = db.query(Utente).filter(Utente.email == data.email, Utente.attivo == True).first()
    if not utente or not verify_password(data.password, utente.password_hash):
        raise HTTPException(status_code=401, detail="Email o password errati")
    token = create_access_token({"sub": utente.id})
    return {"access_token": token, "utente": utente}

@router.get("/me", response_model=UtenteOut)
def get_me(current_user: Utente = Depends(get_current_user)):
    return current_user

@router.post("/registra", response_model=UtenteOut, status_code=201)
def registra_admin(data: UtenteCreate, db: Session = Depends(get_db)):
    # Solo il primo utente può registrarsi liberamente (diventa admin)
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
    return utente
