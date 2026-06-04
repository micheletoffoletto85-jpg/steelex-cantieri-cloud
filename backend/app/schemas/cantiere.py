from pydantic import BaseModel
from datetime import date, datetime
from typing import Optional
from app.models.cantiere import StatoCantiere

class CantiereBase(BaseModel):
    nome: str
    cliente: str
    indirizzo: Optional[str] = None
    citta: Optional[str] = None
    provincia: Optional[str] = None
    stato: StatoCantiere = StatoCantiere.preventivo
    avanzamento: float = 0.0
    data_inizio: Optional[date] = None
    data_fine_prevista: Optional[date] = None
    budget: float = 0.0
    note: Optional[str] = None
    responsabile_id: Optional[int] = None

class CantiereCreate(CantiereBase):
    pass

class CantiereUpdate(BaseModel):
    nome: Optional[str] = None
    cliente: Optional[str] = None
    indirizzo: Optional[str] = None
    citta: Optional[str] = None
    provincia: Optional[str] = None
    stato: Optional[StatoCantiere] = None
    avanzamento: Optional[float] = None
    data_inizio: Optional[date] = None
    data_fine_prevista: Optional[date] = None
    data_fine_reale: Optional[date] = None
    budget: Optional[float] = None
    note: Optional[str] = None
    responsabile_id: Optional[int] = None

class CantiereOut(CantiereBase):
    id: int
    data_fine_reale: Optional[date] = None
    creato_il: datetime
    aggiornato_il: Optional[datetime] = None

    class Config:
        from_attributes = True
