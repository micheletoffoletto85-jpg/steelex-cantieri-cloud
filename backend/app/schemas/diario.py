from pydantic import BaseModel
from datetime import date, datetime
from typing import Optional, List, Any

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
    condividi_cliente: Optional[bool] = None

class DiarioOut(DiarioBase):
    id: int
    cantiere_id: int
    autore_id: int
    foto_urls: List[str] = []
    creato_il: datetime
    fonte: Optional[str] = "manuale"
    testo_originale: Optional[str] = None
    lingua_originale: Optional[str] = None
    voci_estratte: Optional[Any] = None
    condividi_cliente: bool = False
    autore_nome: Optional[str] = None   # calcolato nel router

    class Config:
        from_attributes = True


class OreExtraOut(BaseModel):
    id: int
    cantiere_id: int
    diario_id: Optional[int] = None
    operaio_nome: str
    ore: float
    attivita: Optional[str] = None
    tariffa_oraria: float
    totale: float
    data: date
    approvato: bool
    note: Optional[str] = None
    creato_il: Optional[datetime] = None

    class Config:
        from_attributes = True

class OreExtraCreate(BaseModel):
    operaio_nome: str
    ore: float
    attivita: Optional[str] = None
    tariffa_oraria: float = 0.0
    data: Optional[date] = None
    note: Optional[str] = None
    diario_id: Optional[int] = None

class OreExtraUpdate(BaseModel):
    operaio_nome: Optional[str] = None
    ore: Optional[float] = None
    attivita: Optional[str] = None
    tariffa_oraria: Optional[float] = None
    data: Optional[date] = None
    approvato: Optional[bool] = None
    note: Optional[str] = None
