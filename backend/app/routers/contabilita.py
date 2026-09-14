"""Contabilità cantiere — libretto delle misure.

Pagina per capocantiere e admin: registrano le misure prese in cantiere,
agganciate alle voci del computo base. Il riepilogo per voce (qt a computo vs
qt misurata) confluisce nel verbale di chiusura e in un PDF contabile dedicato.

Import di MisuraContabilita sempre locale alle funzioni: vedi nota nel modello.
"""
import io
import os
from datetime import date
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified
from starlette.concurrency import run_in_threadpool

from app.database import get_db
from app.auth import get_current_user
from app.models.cantiere import Cantiere
from app.models.utente import RuoloUtente, Utente
from app.storage import salva_file

router = APIRouter(prefix="/cantieri/{cantiere_id}/misure", tags=["Contabilità Misure"])


# ─── AUTORIZZAZIONI ──────────────────────────────────────────────────────────
# admin / amministrazione: tutti i cantieri. capo_cantiere: solo i cantieri di
# cui è responsabile. Nessun altro ruolo accede alla contabilità misure.

def _accesso(cantiere_id: int, db: Session, user: Utente) -> Cantiere:
    c = db.query(Cantiere).filter(Cantiere.id == cantiere_id).first()
    if not c:
        raise HTTPException(404, "Cantiere non trovato")
    if user.ruolo in (RuoloUtente.admin, RuoloUtente.amministrazione):
        return c
    if user.ruolo == RuoloUtente.capo_cantiere and c.responsabile_id == user.id:
        return c
    raise HTTPException(403, "Contabilità misure riservata ad admin, amministrazione e al capocantiere del cantiere")


# ─── HELPERS ─────────────────────────────────────────────────────────────────

def _quantita_auto(parti, lunghezza, larghezza, altezza) -> float:
    """Quantità = n. parti × prodotto delle dimensioni valorizzate.
    Le dimensioni lasciate vuote (o a zero) non entrano nel calcolo."""
    q = float(parti or 1)
    for d in (lunghezza, larghezza, altezza):
        if d:
            q *= float(d)
    return round(q, 3)


def _voci_computo(db: Session, cantiere_id: int):
    """Voci del computo base (accettato se c'è), pronte per il selettore misure."""
    from app.routers.economico import _computo_base
    prev = _computo_base(db, cantiere_id)
    if not prev or not prev.voci:
        return prev, []
    voci = []
    for v in prev.voci:
        desc = str(v.get("descrizione") or "").strip()
        if not desc or desc.startswith("⚠"):   # salta marker EXTRA e righe vuote
            continue
        try:
            qt = float(v.get("qt") or v.get("quantita") or 0)
        except (TypeError, ValueError):
            qt = 0.0
        voci.append({
            "voce_id": str(v.get("id")) if v.get("id") is not None else None,
            "descrizione": desc,
            "categoria": v.get("categoria") or "",
            "um": v.get("um") or "",
            "qt_computo": qt,
        })
    return prev, voci


def _misura_out(m) -> dict:
    return {
        "id": m.id,
        "voce_id": m.voce_id,
        "voce_descrizione": m.voce_descrizione,
        "voce_um": m.voce_um,
        "voce_qt_computo": m.voce_qt_computo,
        "descrizione": m.descrizione,
        "parti": m.parti,
        "lunghezza": m.lunghezza,
        "larghezza": m.larghezza,
        "altezza": m.altezza,
        "quantita": m.quantita,
        "quantita_manuale": bool(m.quantita_manuale),
        "data_misura": m.data_misura.isoformat() if m.data_misura else None,
        "foto_urls": m.foto_urls or [],
        "note": m.note,
        "misurato_da": m.misurato_da,
        "misurato_da_nome": m.misurato_da_nome,
        "creato_il": m.creato_il.isoformat() if m.creato_il else None,
        "aggiornato_il": m.aggiornato_il.isoformat() if m.aggiornato_il else None,
    }


def riepilogo_misure(db: Session, cantiere_id: int) -> List[dict]:
    """Riepilogo per voce di computo: qt a computo vs qt misurata + scostamento.
    Usato dalla tab, dal PDF contabile e dal verbale di chiusura."""
    from app.models.contabilita_misura import MisuraContabilita
    _prev, voci = _voci_computo(db, cantiere_id)
    misure = (db.query(MisuraContabilita)
              .filter(MisuraContabilita.cantiere_id == cantiere_id)
              .order_by(MisuraContabilita.id.asc()).all())

    per_voce: dict = {}
    for v in voci:
        per_voce[v["voce_id"]] = {
            "voce_id": v["voce_id"],
            "descrizione": v["descrizione"],
            "um": v["um"],
            "qt_computo": v["qt_computo"],
            "qt_misurata": 0.0,
            "n_misure": 0,
            "nel_computo": True,
        }

    for m in misure:
        key = m.voce_id
        if key not in per_voce:
            per_voce[key] = {
                "voce_id": key,
                "descrizione": m.voce_descrizione or ("Senza voce" if not key else "Voce non più nel computo"),
                "um": m.voce_um or "",
                "qt_computo": m.voce_qt_computo,
                "qt_misurata": 0.0,
                "n_misure": 0,
                "nel_computo": False,
            }
        per_voce[key]["qt_misurata"] = round(per_voce[key]["qt_misurata"] + (m.quantita or 0), 3)
        per_voce[key]["n_misure"] += 1

    out = []
    for r in per_voce.values():
        qc = r["qt_computo"]
        r["scostamento"] = round(r["qt_misurata"] - qc, 3) if qc is not None else None
        r["scostamento_perc"] = (round((r["qt_misurata"] - qc) / qc * 100, 1)
                                 if qc else None)
        out.append(r)
    # prima le voci del computo (nell'ordine), poi gli extra
    out.sort(key=lambda r: (not r["nel_computo"], r["descrizione"].lower()))
    return out


# ─── LETTURA ─────────────────────────────────────────────────────────────────

@router.get("")
def lista_misure(cantiere_id: int, db: Session = Depends(get_db), user: Utente = Depends(get_current_user)):
    from app.models.contabilita_misura import MisuraContabilita
    cantiere = _accesso(cantiere_id, db, user)
    _prev, voci = _voci_computo(db, cantiere_id)
    misure = (db.query(MisuraContabilita)
              .filter(MisuraContabilita.cantiere_id == cantiere_id)
              .order_by(MisuraContabilita.data_misura.desc().nullslast(), MisuraContabilita.id.desc())
              .all())
    return {
        "cantiere": {"id": cantiere.id, "nome": cantiere.nome,
                     "stato": cantiere.stato.value if hasattr(cantiere.stato, "value") else cantiere.stato},
        "computo_presente": bool(voci),
        "voci": voci,
        "misure": [_misura_out(m) for m in misure],
        "riepilogo": riepilogo_misure(db, cantiere_id),
    }


# ─── SCRITTURA ───────────────────────────────────────────────────────────────

class MisuraIn(BaseModel):
    voce_id: Optional[str] = None
    descrizione: str
    parti: Optional[float] = 1.0
    lunghezza: Optional[float] = None
    larghezza: Optional[float] = None
    altezza: Optional[float] = None
    quantita: Optional[float] = None          # se presente + quantita_manuale → forzata
    quantita_manuale: bool = False
    data_misura: Optional[date] = None
    note: Optional[str] = None


def _applica(m, body: MisuraIn, db: Session, cantiere_id: int):
    m.descrizione = (body.descrizione or "").strip()
    m.parti = body.parti if body.parti is not None else 1.0
    m.lunghezza = body.lunghezza
    m.larghezza = body.larghezza
    m.altezza = body.altezza
    m.quantita_manuale = bool(body.quantita_manuale)
    if body.quantita_manuale and body.quantita is not None:
        m.quantita = round(float(body.quantita), 3)
    else:
        m.quantita = _quantita_auto(m.parti, m.lunghezza, m.larghezza, m.altezza)
    m.data_misura = body.data_misura
    m.note = (body.note or "").strip() or None

    # Scatto della voce di computo collegata
    m.voce_id = (body.voce_id or None)
    if m.voce_id:
        _prev, voci = _voci_computo(db, cantiere_id)
        v = next((x for x in voci if x["voce_id"] == m.voce_id), None)
        if v:
            m.voce_descrizione = v["descrizione"]
            m.voce_um = v["um"]
            m.voce_qt_computo = v["qt_computo"]


@router.post("", status_code=201)
def crea_misura(cantiere_id: int, body: MisuraIn,
                db: Session = Depends(get_db), user: Utente = Depends(get_current_user)):
    from app.models.contabilita_misura import MisuraContabilita
    _accesso(cantiere_id, db, user)
    if not (body.descrizione or "").strip():
        raise HTTPException(422, "La descrizione della misura è obbligatoria")
    m = MisuraContabilita(
        cantiere_id=cantiere_id,
        misurato_da=user.id,
        misurato_da_nome=f"{user.nome} {user.cognome}".strip(),
        foto_urls=[],
    )
    _applica(m, body, db, cantiere_id)
    db.add(m)
    db.commit()
    db.refresh(m)
    return _misura_out(m)


@router.put("/{misura_id}")
def aggiorna_misura(cantiere_id: int, misura_id: int, body: MisuraIn,
                    db: Session = Depends(get_db), user: Utente = Depends(get_current_user)):
    from app.models.contabilita_misura import MisuraContabilita
    _accesso(cantiere_id, db, user)
    m = db.query(MisuraContabilita).filter(MisuraContabilita.id == misura_id,
                                           MisuraContabilita.cantiere_id == cantiere_id).first()
    if not m:
        raise HTTPException(404, "Misura non trovata")
    if not (body.descrizione or "").strip():
        raise HTTPException(422, "La descrizione della misura è obbligatoria")
    _applica(m, body, db, cantiere_id)
    db.commit()
    db.refresh(m)
    return _misura_out(m)


@router.delete("/{misura_id}", status_code=204)
def elimina_misura(cantiere_id: int, misura_id: int,
                   db: Session = Depends(get_db), user: Utente = Depends(get_current_user)):
    from app.models.contabilita_misura import MisuraContabilita
    _accesso(cantiere_id, db, user)
    m = db.query(MisuraContabilita).filter(MisuraContabilita.id == misura_id,
                                           MisuraContabilita.cantiere_id == cantiere_id).first()
    if not m:
        raise HTTPException(404, "Misura non trovata")
    db.delete(m)
    db.commit()
    return None


@router.post("/{misura_id}/foto")
async def carica_foto_misura(cantiere_id: int, misura_id: int, file: UploadFile = File(...),
                             db: Session = Depends(get_db), user: Utente = Depends(get_current_user)):
    from app.models.contabilita_misura import MisuraContabilita
    _accesso(cantiere_id, db, user)
    m = db.query(MisuraContabilita).filter(MisuraContabilita.id == misura_id,
                                           MisuraContabilita.cantiere_id == cantiere_id).first()
    if not m:
        raise HTTPException(404, "Misura non trovata")
    _ct = {"image/jpeg": ".jpg", "image/jpg": ".jpg", "image/png": ".png",
           "image/webp": ".webp", "image/heic": ".heic"}
    ext = os.path.splitext(file.filename or "")[1].lower() \
        or _ct.get((file.content_type or "").split(";")[0].strip(), "") or ".jpg"
    url, _ = await run_in_threadpool(salva_file, await file.read(), f"misure/{cantiere_id}", ext)
    m.foto_urls = list(m.foto_urls or []) + [url]
    flag_modified(m, "foto_urls")
    db.commit()
    db.refresh(m)
    return _misura_out(m)


class FotoRimuoviBody(BaseModel):
    url: str


@router.delete("/{misura_id}/foto")
def rimuovi_foto_misura(cantiere_id: int, misura_id: int, body: FotoRimuoviBody,
                        db: Session = Depends(get_db), user: Utente = Depends(get_current_user)):
    from app.models.contabilita_misura import MisuraContabilita
    _accesso(cantiere_id, db, user)
    m = db.query(MisuraContabilita).filter(MisuraContabilita.id == misura_id,
                                           MisuraContabilita.cantiere_id == cantiere_id).first()
    if not m:
        raise HTTPException(404, "Misura non trovata")
    m.foto_urls = [u for u in (m.foto_urls or []) if u != body.url]
    flag_modified(m, "foto_urls")
    db.commit()
    db.refresh(m)
    return _misura_out(m)


# ─── PDF — REGISTRO DI CONTABILITÀ DELLE MISURE ──────────────────────────────

def _fmt_num(x) -> str:
    if x is None:
        return "—"
    try:
        return f"{float(x):.3f}".rstrip("0").rstrip(".").replace(".", ",")
    except (TypeError, ValueError):
        return str(x)


@router.get("/report.pdf")
def report_pdf(cantiere_id: int, db: Session = Depends(get_db), user: Utente = Depends(get_current_user)):
    from reportlab.lib.units import mm
    from reportlab.lib import colors
    from reportlab.platypus import Table, TableStyle, Paragraph, Spacer, KeepTogether
    from xml.sax.saxutils import escape
    from app import pdf_theme as T
    from app.models.contabilita_misura import MisuraContabilita

    cantiere = _accesso(cantiere_id, db, user)
    misure = (db.query(MisuraContabilita)
              .filter(MisuraContabilita.cantiere_id == cantiere_id)
              .order_by(MisuraContabilita.id.asc()).all())
    riep = riepilogo_misure(db, cantiere_id)

    S = T.make_styles()
    PRIMARIO, SCURO = T.palette()
    indirizzo = ", ".join(x for x in [cantiere.indirizzo, cantiere.citta] if x)
    if cantiere.provincia:
        indirizzo += f" ({cantiere.provincia})"

    story = []
    story += T.masthead(S, "Registro di contabilità", "Libretto delle misure")
    story.append(Paragraph("Libretto delle misure", S["title"]))
    story.append(Paragraph("Misure di contabilità rilevate in cantiere", S["subtitle"]))
    story.append(Spacer(1, 5 * mm))
    story.append(T.info_grid(S, [
        ("Cantiere", cantiere.nome or "—"),
        ("Committente", cantiere.cliente or "—"),
        ("Ubicazione", indirizzo or "—"),
        ("Misure registrate", str(len(misure))),
    ]))
    story.append(Spacer(1, 7 * mm))

    # ── Riepilogo per voce ──────────────────────────────────────────────
    story.append(Paragraph("Riepilogo per voce di computo", S["h2"]))
    if riep:
        head = ["Voce", "U.M.", "Qt computo", "Qt misurata", "Scostam.", "N."]
        rows = [[Paragraph(h, S["cell_h"]) for h in head]]
        for r in riep:
            sc = r.get("scostamento")
            sc_txt = _fmt_num(sc)
            if sc is not None and r.get("scostamento_perc") is not None:
                sc_txt += f"  ({r['scostamento_perc']:+g}%)"
            rows.append([
                Paragraph(escape(r["descrizione"][:90]) + ("" if r["nel_computo"] else "  ⚠"), S["cell"]),
                Paragraph(escape(r["um"] or "—"), S["cell"]),
                Paragraph(_fmt_num(r["qt_computo"]), S["num"]),
                Paragraph(_fmt_num(r["qt_misurata"]), S["num"]),
                Paragraph(sc_txt, S["num"]),
                Paragraph(str(r["n_misure"]), S["num"]),
            ])
        t = Table(rows, colWidths=[68 * mm, 14 * mm, 24 * mm, 24 * mm, 30 * mm, 10 * mm], repeatRows=1)
        t.setStyle(T.data_table_style(len(rows) - 1))
        story.append(t)
    else:
        story.append(Paragraph("Nessuna misura registrata.", S["meta"]))
    story.append(Spacer(1, 8 * mm))

    # ── Dettaglio misure per voce ───────────────────────────────────────
    story.append(Paragraph("Dettaglio delle misure", S["h2"]))
    if not misure:
        story.append(Paragraph("Nessuna misura registrata.", S["meta"]))

    # raggruppa per voce, nell'ordine del riepilogo
    per_voce: dict = {}
    for m in misure:
        per_voce.setdefault(m.voce_id, []).append(m)
    ordine_voci = [r["voce_id"] for r in riep] or list(per_voce.keys())

    for vid in ordine_voci:
        elenco = per_voce.get(vid)
        if not elenco:
            continue
        titolo = elenco[0].voce_descrizione or ("Misure senza voce" if not vid else "Voce non più nel computo")
        blocco = [Paragraph(escape(titolo), S["value_b"])]
        head = ["Descrizione", "Parti", "Lungh.", "Largh.", "H/sp.", "Quantità", "Data"]
        rows = [[Paragraph(h, S["cell_h"]) for h in head]]
        tot = 0.0
        for m in elenco:
            tot += m.quantita or 0
            rows.append([
                Paragraph(escape(m.descrizione or "") + ("  ·  forzata" if m.quantita_manuale else ""), S["cell"]),
                Paragraph(_fmt_num(m.parti), S["num"]),
                Paragraph(_fmt_num(m.lunghezza), S["num"]),
                Paragraph(_fmt_num(m.larghezza), S["num"]),
                Paragraph(_fmt_num(m.altezza), S["num"]),
                Paragraph(_fmt_num(m.quantita), S["num"]),
                Paragraph(m.data_misura.strftime("%d/%m/%Y") if m.data_misura else "—", S["cell"]),
            ])
        rows.append([
            Paragraph("Totale misurato", S["value_b"]), "", "", "", "",
            Paragraph(_fmt_num(round(tot, 3)), S["num_b"]), "",
        ])
        t = Table(rows, colWidths=[58 * mm, 14 * mm, 18 * mm, 18 * mm, 18 * mm, 22 * mm, 22 * mm], repeatRows=1)
        t.setStyle(T.data_table_style(len(rows) - 2, has_totals=True, total_rows=1))
        blocco.append(t)
        note = [m for m in elenco if m.note]
        if note:
            blocco.append(Spacer(1, 1.5 * mm))
            for m in note:
                blocco.append(Paragraph(f"— {escape(m.descrizione or '')}: {escape(m.note)}", S["note"]))
        story.append(KeepTogether(blocco))
        story.append(Spacer(1, 6 * mm))

    story.append(Spacer(1, 6 * mm))
    story.append(T.signature_block(S, "Il capocantiere", "La Direzione Lavori"))

    buf = io.BytesIO()
    T.build(buf, story, title=f"Libretto misure — {cantiere.nome}")
    nome_file = f"libretto_misure_{(cantiere.nome or 'cantiere').replace(' ', '_')}.pdf"
    return StreamingResponse(buf, media_type="application/pdf",
                             headers={"Content-Disposition": f'attachment; filename="{nome_file}"'})
