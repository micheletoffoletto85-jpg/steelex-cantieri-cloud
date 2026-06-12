"""
Endpoint dedicato al Cruscotto Michele.
Protetto da DASHBOARD_API_KEY (variabile d'ambiente) — non richiede JWT.
Restituisce un riepilogo aggregato dei cantieri per il cruscotto.
"""
import os
from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.cantiere import Cantiere, StatoCantiere
from app.models.non_conformita import NonConformita

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


def _verifica_api_key(x_api_key: str = Header(...)):
    chiave_attesa = os.environ.get("DASHBOARD_API_KEY", "")
    if not chiave_attesa or x_api_key != chiave_attesa:
        raise HTTPException(status_code=401, detail="API key non valida")


@router.get("/summary", dependencies=[Depends(_verifica_api_key)])
def dashboard_summary(db: Session = Depends(get_db)):
    """Riepilogo cantieri per il Cruscotto Michele."""
    cantieri = db.query(Cantiere).filter(
        Cantiere.stato != StatoCantiere.archiviato
    ).order_by(Cantiere.creato_il.desc()).all()

    # Ricalcola avanzamento da fasi
    for c in cantieri:
        if c.fasi:
            c.avanzamento = round(sum(f.percentuale for f in c.fasi) / len(c.fasi), 1)

    cantieri_out = []
    for c in cantieri:
        cantieri_out.append({
            "id": c.id,
            "nome": c.nome,
            "cliente": c.cliente or "",
            "stato": c.stato.value if hasattr(c.stato, "value") else str(c.stato),
            "avanzamento": c.avanzamento or 0,
            "data_fine_prevista": str(c.data_fine_prevista) if c.data_fine_prevista else "",
            "indirizzo": c.indirizzo or "",
            "fonte": "steelex",
        })

    # Non conformità aperte = criticità
    nc_aperte = db.query(NonConformita).filter(
        NonConformita.stato == "aperta"
    ).all()

    criticita = []
    for nc in nc_aperte:
        cantiere_nome = next((c["nome"] for c in cantieri_out if c["id"] == nc.cantiere_id), "—")
        criticita.append({
            "cantiere": cantiere_nome,
            "problema": nc.descrizione[:100],
            "urgenza": "alta" if nc.scadenza else "media",
            "fonte": "steelex",
        })

    return {
        "cantieri": cantieri_out,
        "criticita": criticita,
        "totale_cantieri": len(cantieri_out),
        "totale_criticita": len(criticita),
    }
