from pydantic import BaseModel
from datetime import datetime
from typing import Optional
from app.models.utente import RuoloUtente

class UtenteBase(BaseModel):
    nome: str
    cognome: str
    email: str
    ruolo: RuoloUtente = RuoloUtente.capo_cantiere

class UtenteCreate(UtenteBase):
    password: str

class UtenteUpdate(BaseModel):
    nome: Optional[str] = None
    cognome: Optional[str] = None
    ruolo: Optional[RuoloUtente] = None
    attivo: Optional[bool] = None
    password: Optional[str] = None

class UtenteOut(UtenteBase):
    id: int
    attivo: bool
    creato_il: datetime

    class Config:
        from_attributes = True

class LoginRequest(BaseModel):
    email: str
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    utente: UtenteOut
