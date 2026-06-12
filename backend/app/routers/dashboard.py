"""
Endpoint dedicato al Cruscotto Michele.
Protetto da DASHBOARD_API_KEY (variabile d'ambiente) — non richiede JWT.
Restituisce un riepilogo aggregato dei cantieri per il cruscotto.
"""
import os
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session
from sqlalchemy import desc
from app.database import get_db
from app.models.cantiere import Cantiere, StatoCantiere
from app.models.non_conformita import NonConformita
from app.models.notifica_inapp import NotificaInApp
from app.models.diario import DiarioGiornaliero

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


def _verifica_api_key(x_api_key: str = Header(...)):
    chiave_attesa = os.environ.get("DASHBOARD_API_KEY", "")
    if not chiave_attesa or x_api_key != chiave_attesa:
        raise HTTPException(status_code=401, detail="API key non valida")


@router.get("/summary", dependencies=[Depends(_verifica_api_key)])
def dashboard_summary(db: Session = Depends(get_db)):
    """Riepilogo cantieri per il Cruscotto Michele."""
    cantieri = db.query(Cantiere).filter(
        Cantiere.stato.in_([
            StatoCantiere.preventivo,
            StatoCantiere.in_corso,
            StatoCantiere.sospeso,
        ])
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


@router.get("/aggiornamenti", dependencies=[Depends(_verifica_api_key)])
def dashboard_aggiornamenti(db: Session = Depends(get_db), giorni: int = 7):
    """Ultime notifiche in-app e diari recenti per il Cruscotto Michele."""
    cutoff = datetime.utcnow() - timedelta(days=giorni)

    # Notifiche non lette (tutte) + lette recenti
    notifiche = (
        db.query(NotificaInApp)
        .filter(NotificaInApp.creato_il >= cutoff)
        .order_by(desc(NotificaInApp.creato_il))
        .limit(20)
        .all()
    )

    # Mappa id cantiere → nome
    id_cantieri = {c.id for n in notifiche if n.cantiere_id for c in []}
    cantieri_map = {c.id: c.nome for c in db.query(Cantiere.id, Cantiere.nome).all()}

    notifiche_out = []
    for n in notifiche:
        notifiche_out.append({
            "id": n.id,
            "tipo": n.tipo,
            "titolo": n.titolo,
            "corpo": n.corpo or "",
            "letta": n.letta,
            "cantiere": cantieri_map.get(n.cantiere_id, "") if n.cantiere_id else "",
            "data": n.creato_il.strftime("%d/%m %H:%M") if n.creato_il else "",
            "data_iso": n.creato_il.isoformat() if n.creato_il else "",
        })

    # Ultimi diari giornalieri
    diari = (
        db.query(DiarioGiornaliero)
        .filter(DiarioGiornaliero.creato_il >= cutoff)
        .order_by(desc(DiarioGiornaliero.creato_il))
        .limit(10)
        .all()
    )

    diari_out = []
    for d in diari:
        diari_out.append({
            "id": d.id,
            "cantiere": cantieri_map.get(d.cantiere_id, ""),
            "data": d.data.strftime("%d/%m/%Y") if d.data else "",
            "attivita": (d.attivita or "")[:200],
            "problemi": (d.problemi or "")[:150],
            "operai": d.operai_presenti or 0,
            "fonte": d.fonte or "manuale",
        })

    non_lette = sum(1 for n in notifiche_out if not n["letta"])

    return {
        "notifiche": notifiche_out,
        "diari": diari_out,
        "non_lette": non_lette,
    }
