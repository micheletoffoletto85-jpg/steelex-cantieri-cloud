from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.utente import Utente, RuoloUtente
from pydantic import BaseModel
from app.schemas.utente import TokenResponse, UtenteCreate, UtenteOut

class LoginRequest(BaseModel):
    email: str
    password: str
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

@router.post("/registra", status_code=201)
def registra_admin(data: UtenteCreate, db: Session = Depends(get_db)):
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
