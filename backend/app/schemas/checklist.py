from pydantic import BaseModel
from datetime import datetime
from typing import Optional

class ChecklistItemCreate(BaseModel):
    testo: str
    ordine: int = 0

class ChecklistItemUpdate(BaseModel):
    testo: Optional[str] = None
    completato: Optional[bool] = None
    ordine: Optional[int] = None

class ChecklistItemOut(BaseModel):
    id: int
    cantiere_id: int
    testo: str
    completato: bool
    completato_da: Optional[int] = None
    completato_il: Optional[datetime] = None
    ordine: int
    creato_il: datetime

    class Config:
        from_attributes = True
