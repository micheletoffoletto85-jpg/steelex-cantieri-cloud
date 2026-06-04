from pydantic import BaseModel
from datetime import date, datetime
from typing import Optional, List

class DiarioBase(BaseModel):
    data: date
    attivita: Optional[str] = None
    problemi: Optional[str] = None
    meteo: Optional[str] = None
    operai_presenti: int = 0

class DiarioCreate(DiarioBase):
    cantiere_id: int

class DiarioUpdate(BaseModel):
    attivita: Optional[str] = None
    problemi: Optional[str] = None
    meteo: Optional[str] = None
    operai_presenti: Optional[int] = None

class DiarioOut(DiarioBase):
    id: int
    cantiere_id: int
    autore_id: int
    foto_urls: List[str] = []
    creato_il: datetime

    class Config:
        from_attributes = True
