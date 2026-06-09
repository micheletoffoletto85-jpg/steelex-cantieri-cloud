from pydantic import BaseModel, field_validator
from datetime import datetime
from typing import Optional
from app.models.utente import RuoloUtente

class UtenteBase(BaseModel):
    nome: str
    cognome: str
    email: str
    ruolo: RuoloUtente = RuoloUtente.capo_cantiere
    tipo_professione: Optional[str] = None

class UtenteCreate(UtenteBase):
    password: str

    @field_validator("password")
    @classmethod
    def password_policy(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("La password deve essere di almeno 8 caratteri")
        if not any(c.isupper() for c in v):
            raise ValueError("La password deve contenere almeno una lettera maiuscola")
        if not any(c.isdigit() for c in v):
            raise ValueError("La password deve contenere almeno un numero")
        return v

class UtenteUpdate(BaseModel):
    nome: Optional[str] = None
    cognome: Optional[str] = None
    ruolo: Optional[RuoloUtente] = None
    attivo: Optional[bool] = None
    password: Optional[str] = None
    tipo_professione: Optional[str] = None

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
    refresh_token: Optional[str] = None
    token_type: str = "bearer"
    utente: UtenteOut
