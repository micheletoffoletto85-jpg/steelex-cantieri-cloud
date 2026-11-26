"""Andamento annuale dell'azienda (admin e amministrazione): lavoro acquisito,
costi, ore e cantieri chiusi, mese per mese, con confronto
sull'anno prima. Tutto calcolato dai dati che l'app ha già."""
from collections import defaultdict
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, extract
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models.cantiere import Cantiere, StatoCantiere
from app.models.diario import OreExtra, DiarioGiornaliero
from app.models.economico import Spesa, PreventivoCantiere
from app.models.utente import Utente, RuoloUtente

router = APIRouter(prefix="/andamento", tags=["Andamento annuale"])

_FUORI = (StatoCantiere.archiviato, StatoCantiere.annullato, StatoCantiere.preventivo)


def _valore(c: Cantiere, computi) -> float:
    """Importo del lavoro (imponibile): computo base accettato, se no budget."""
    base = [p for p in computi if (p.tipo or "base") == "base"]
    acc = [p for p in base if p.stato == "accettato"] or base
    return round(sum(p.subtotale or 0 for p in acc) or (c.budget or 0), 2)


def _per_mese(righe):
    out = [0.0] * 12
    for m, v in righe:
        if m:
            out[int(m) - 1] += float(v or 0)
    return [round(x, 2) for x in out]


def calcola_anno(db: Session, anno: int) -> dict:
    cantieri = db.query(Cantiere).all()
    computi = defaultdict(list)
    for p in db.query(PreventivoCantiere).all():
        computi[p.cantiere_id].append(p)
    # primo e ultimo giorno di lavoro di ogni cantiere (ore e diari)
    giorni = defaultdict(list)
    for cid, d1, d2 in db.query(OreExtra.cantiere_id, func.min(OreExtra.data), func.max(OreExtra.data)).group_by(OreExtra.cantiere_id):
        giorni[cid] += [d1, d2]
    for cid, d1, d2 in db.query(DiarioGiornaliero.cantiere_id, func.min(DiarioGiornaliero.data),
                                func.max(DiarioGiornaliero.data)).group_by(DiarioGiornaliero.cantiere_id):
        giorni[cid] += [d1, d2]
    spese_c = dict(db.query(Spesa.cantiere_id, func.coalesce(func.sum(Spesa.importo), 0)).group_by(Spesa.cantiere_id).all())
    ore_c = dict(db.query(OreExtra.cantiere_id, func.coalesce(func.sum(OreExtra.totale), 0)).group_by(OreExtra.cantiere_id).all())

    acquisito, n_acq, chiusi = [0.0] * 12, [0] * 12, [0] * 12
    elenco, portafoglio = [], 0.0
    for c in cantieri:
        if c.stato in _FUORI:
            continue
        g = sorted(d for d in giorni.get(c.id, []) if d)
        quando = c.data_inizio or (g[0] if g else None) \
            or (c.creato_il.date() if c.creato_il else None)
        valore = _valore(c, computi.get(c.id, []))
        speso = round(float(spese_c.get(c.id, 0)) + float(ore_c.get(c.id, 0)), 2)
        if c.stato == StatoCantiere.completato:
            fine = c.data_fine_reale or (g[-1] if g else None) or c.data_fine_prevista
            if fine and fine.year == anno:
                chiusi[fine.month - 1] += 1
        elif valore:
            portafoglio += valore
        if quando and quando.year == anno:
            acquisito[quando.month - 1] += valore
            n_acq[quando.month - 1] += 1
            elenco.append({"id": c.id, "nome": c.nome, "stato": c.stato.value, "mese": quando.month, "valore": valore,
                           "speso": speso, "margine": round((valore - speso) / valore, 3) if valore else None})

    spese_m = _per_mese(db.query(extract("month", Spesa.data), func.sum(Spesa.importo))
                        .filter(extract("year", Spesa.data) == anno).group_by(extract("month", Spesa.data)).all())
    mano_m = _per_mese(db.query(extract("month", OreExtra.data), func.sum(OreExtra.totale))
                       .filter(extract("year", OreExtra.data) == anno).group_by(extract("month", OreExtra.data)).all())
    ore_m = _per_mese(db.query(extract("month", OreExtra.data), func.sum(OreExtra.ore))
                      .filter(extract("year", OreExtra.data) == anno).group_by(extract("month", OreExtra.data)).all())

    con_valore = [e for e in elenco if e["valore"] and e["stato"] == "completato"]
    tot_v = sum(e["valore"] for e in con_valore)
    tot_s = sum(e["speso"] for e in con_valore)
    costi = [round(a + b, 2) for a, b in zip(spese_m, mano_m)]
    return {
        "anno": anno,
        "mesi": {"acquisito": [round(x, 2) for x in acquisito], "cantieri_acquisiti": n_acq, "chiusi": chiusi,
                 "costi": costi, "costi_spese": spese_m, "costi_manodopera": mano_m, "ore": ore_m},
        "kpi": {
            "acquisito": round(sum(acquisito), 2), "cantieri_acquisiti": sum(n_acq),
            "cantieri_senza_importo": sum(1 for e in elenco if not e["valore"]),
            "chiusi": sum(chiusi), "ore": round(sum(ore_m), 1), "giornate": round(sum(ore_m) / 8),
            "costi": round(sum(costi), 2), "portafoglio": round(portafoglio, 2),
            "margine_chiusi": round((tot_v - tot_s) / tot_v, 3) if tot_v else None, "margine_su": len(con_valore),
        },
        "preventivi": None,   # STEELEX non ha la sezione Commerciale
        "cantieri": sorted(elenco, key=lambda e: -e["valore"])[:8],
    }


@router.get("")
def andamento(anno: Optional[int] = Query(None), db: Session = Depends(get_db),
              user: Utente = Depends(get_current_user)):
    if user.ruolo not in (RuoloUtente.admin, RuoloUtente.amministrazione):
        raise HTTPException(403, "Riservato ad admin e amministrazione")
    oggi = date.today()
    anno = anno or oggi.year
    attuale = calcola_anno(db, anno)
    precedente = calcola_anno(db, anno - 1)
    anni = sorted({r[0] for r in db.query(extract("year", OreExtra.data)).distinct() if r[0]} | {oggi.year})
    return {"oggi": oggi.isoformat(), "anni": [int(a) for a in anni], "attuale": attuale, "precedente": precedente}
