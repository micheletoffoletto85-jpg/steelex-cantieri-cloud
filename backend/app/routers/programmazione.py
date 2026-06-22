import os, tempfile, json as _json, base64
from datetime import datetime, date
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.database import get_db
from app.models.programmazione import ProgrammazioneSettimana
from app.models.utente import Utente, RuoloUtente
from app.models.cantiere import Cantiere
from app.auth import get_current_user
from app.config import settings

router = APIRouter(prefix="/programmazione", tags=["Programmazione"])

RUOLI_ADMIN = {RuoloUtente.admin, RuoloUtente.capo_cantiere, RuoloUtente.amministrazione}

GIORNI_ORDINE = ["lun", "mar", "mer", "gio", "ven", "sab", "dom"]


def _settimana_corrente():
    iso = date.today().isocalendar()
    return iso[0], iso[1]   # anno, settimana


def _prog_dict(p: ProgrammazioneSettimana, db: Session) -> dict:
    giorni_out = {}
    for g, info in (p.giorni or {}).items():
        cantiere_nome = None
        if info.get("cantiere_id"):
            c = db.query(Cantiere).filter(Cantiere.id == info["cantiere_id"]).first()
            cantiere_nome = c.nome if c else None
        giorni_out[g] = {
            "cantiere_id": info.get("cantiere_id"),
            "cantiere_nome": cantiere_nome or info.get("cantiere_nome"),
            "lavorazione": info.get("lavorazione"),
            "note": info.get("note"),
        }
    return {
        "id": p.id,
        "operativo_id": p.operativo_id,
        "operativo_nome": f"{p.operativo.nome} {p.operativo.cognome}" if p.operativo else None,
        "anno": p.anno,
        "settimana": p.settimana,
        "notificato_il": p.notificato_il.isoformat() if getattr(p, 'notificato_il', None) else None,
        "giorni": giorni_out,
        "aggiornato_il": p.aggiornato_il.isoformat() if p.aggiornato_il else None,
    }


def _match_nome(nome: str, utenti: list) -> Optional[int]:
    """Match fuzzy nome operativo."""
    if not nome:
        return None
    nome_l = nome.lower().strip()
    for u in utenti:
        full = f"{u.nome} {u.cognome}".lower()
        if nome_l in full or full in nome_l or u.nome.lower() in nome_l or u.cognome.lower() in nome_l:
            return u.id
    return None


def _match_cantiere(nome: str, cantieri: list) -> Optional[int]:
    """Match fuzzy nome cantiere."""
    if not nome:
        return None
    nome_l = nome.lower().strip()
    for c in cantieri:
        if nome_l in (c.nome or "").lower() or (c.nome or "").lower() in nome_l:
            return c.id
        if nome_l in (c.indirizzo or "").lower():
            return c.id
    return None


class GiornoBody(BaseModel):
    cantiere_id: Optional[int] = None
    cantiere_nome: Optional[str] = None
    lavorazione: Optional[str] = None
    note: Optional[str] = None


class ProgrammazioneBody(BaseModel):
    operativo_id: int
    anno: Optional[int] = None
    settimana: Optional[int] = None
    giorni: dict   # {"lun": {"cantiere_id": 5, "lavorazione": "...", "note": "..."}, ...}


@router.post("")
def salva_programmazione(
    body: ProgrammazioneBody,
    db: Session = Depends(get_db),
    user: Utente = Depends(get_current_user),
):
    if user.ruolo not in RUOLI_ADMIN:
        raise HTTPException(403)
    anno, sett = body.anno, body.settimana
    if not anno or not sett:
        anno, sett = _settimana_corrente()

    # Upsert
    prog = db.query(ProgrammazioneSettimana).filter(
        ProgrammazioneSettimana.operativo_id == body.operativo_id,
        ProgrammazioneSettimana.anno == anno,
        ProgrammazioneSettimana.settimana == sett,
    ).first()

    if prog:
        prog.giorni = body.giorni
        prog.aggiornato_il = datetime.utcnow()
        prog.admin_id = user.id
    else:
        prog = ProgrammazioneSettimana(
            admin_id=user.id,
            operativo_id=body.operativo_id,
            anno=anno, settimana=sett,
            giorni=body.giorni,
        )
        db.add(prog)
    db.commit(); db.refresh(prog)
    return _prog_dict(prog, db)


@router.get("/mia")
def mia_programmazione(
    anno: Optional[int] = None,
    settimana: Optional[int] = None,
    db: Session = Depends(get_db),
    user: Utente = Depends(get_current_user),
):
    if not anno or not settimana:
        anno, settimana = _settimana_corrente()
    prog = db.query(ProgrammazioneSettimana).filter(
        ProgrammazioneSettimana.operativo_id == user.id,
        ProgrammazioneSettimana.anno == anno,
        ProgrammazioneSettimana.settimana == settimana,
    ).first()
    if not prog:
        return None
    return _prog_dict(prog, db)


@router.get("")
def lista_programmazione(
    anno: Optional[int] = None,
    settimana: Optional[int] = None,
    db: Session = Depends(get_db),
    user: Utente = Depends(get_current_user),
):
    if user.ruolo not in RUOLI_ADMIN:
        raise HTTPException(403)
    if not anno or not settimana:
        anno, settimana = _settimana_corrente()
    progs = db.query(ProgrammazioneSettimana).filter(
        ProgrammazioneSettimana.anno == anno,
        ProgrammazioneSettimana.settimana == settimana,
    ).all()
    return [_prog_dict(p, db) for p in progs]


@router.delete("/{prog_id}")
def elimina_programmazione(
    prog_id: int,
    db: Session = Depends(get_db),
    user: Utente = Depends(get_current_user),
):
    if user.ruolo not in RUOLI_ADMIN:
        raise HTTPException(403)
    prog = db.query(ProgrammazioneSettimana).filter(ProgrammazioneSettimana.id == prog_id).first()
    if not prog:
        raise HTTPException(404)
    db.delete(prog); db.commit()
    return {"ok": True}


PROMPT_ESTRAI_TABELLA = """Analizza questa tabella di programmazione settimanale cantieri.
Estrai ogni riga e restituisci un array JSON. Rispondi SOLO con il JSON, nessun altro testo.

Formato output:
[
  {
    "nome": "nome e cognome dell'operaio",
    "giorno": "lun|mar|mer|gio|ven|sab",
    "cantiere": "nome del cantiere o indirizzo",
    "lavorazione": "tipo di lavorazione da eseguire"
  }
]

Note:
- giorno deve essere in formato abbreviato italiano (lun, mar, mer, gio, ven, sab)
- se una cella è vuota o trattino, ometti quella riga
- se il nome si ripete su più righe, associalo a tutti i giorni corrispondenti
- estrai tutte le righe, anche se sono tante

Tabella:
{testo}

JSON:"""


@router.post("/importa-pdf")
async def importa_da_pdf(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: Utente = Depends(get_current_user),
):
    """Importa tabella programmazione da PDF usando Claude AI."""
    if user.ruolo not in RUOLI_ADMIN:
        raise HTTPException(403)
    if not settings.ANTHROPIC_API_KEY:
        raise HTTPException(503, "Anthropic API key non configurata")

    contenuto = await file.read()

    # Prova estrazione testo con PyMuPDF
    testo_pdf = ""
    img_b64 = None
    try:
        import fitz
        doc = fitz.open(stream=contenuto, filetype="pdf")
        for page in doc:
            testo_pdf += page.get_text("text") + "\n"
        doc.close()
    except Exception:
        pass

    import anthropic
    claude = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)

    # Se il testo è scarso (PDF scansionato/foto), usa la visione sulla prima pagina
    if len(testo_pdf.strip()) < 50:
        try:
            import fitz
            doc = fitz.open(stream=contenuto, filetype="pdf")
            page = doc[0]
            pix = page.get_pixmap(dpi=150)
            img_b64 = base64.b64encode(pix.tobytes("png")).decode()
            doc.close()
        except Exception:
            raise HTTPException(422, "Impossibile leggere il PDF")

        msg = claude.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=2048,
            messages=[{
                "role": "user",
                "content": [
                    {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": img_b64}},
                    {"type": "text", "text": PROMPT_ESTRAI_TABELLA.format(testo="[vedi immagine allegata]")},
                ]
            }]
        )
    else:
        msg = claude.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=2048,
            messages=[{"role": "user", "content": PROMPT_ESTRAI_TABELLA.format(testo=testo_pdf)}]
        )

    raw = msg.content[0].text.strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"): raw = raw[4:]
    try:
        righe = _json.loads(raw)
    except Exception:
        raise HTTPException(422, "Claude non ha potuto interpretare la tabella. Riprova con un PDF più leggibile.")

    # Match fuzzy nomi e cantieri
    operativi = db.query(Utente).filter(
        Utente.ruolo.in_(["artigiano", "capo_cantiere", "capo_cantiere_sub"]),
        Utente.attivo == True,
    ).all()
    cantieri_db = db.query(Cantiere).filter(
        Cantiere.stato.in_(["attivo", "in_corso", "preventivo"])
    ).all()

    preview = []
    for r in righe:
        if not isinstance(r, dict): continue
        operativo_id = _match_nome(r.get("nome", ""), operativi)
        cantiere_id = _match_cantiere(r.get("cantiere", ""), cantieri_db)
        cantiere_nome_db = next((c.nome for c in cantieri_db if c.id == cantiere_id), None) if cantiere_id else None
        preview.append({
            "nome_rilevato": r.get("nome"),
            "operativo_id": operativo_id,
            "operativo_nome": next((f"{u.nome} {u.cognome}" for u in operativi if u.id == operativo_id), None) if operativo_id else None,
            "giorno": r.get("giorno", "").lower()[:3],
            "cantiere_rilevato": r.get("cantiere"),
            "cantiere_id": cantiere_id,
            "cantiere_nome": cantiere_nome_db or r.get("cantiere"),
            "lavorazione": r.get("lavorazione"),
        })

    return {"preview": preview, "righe_totali": len(preview)}


class PubblicaBody(BaseModel):
    anno: int
    settimana: int


@router.post("/pubblica-settimana")
def pubblica_settimana(
    body: PubblicaBody,
    db: Session = Depends(get_db),
    user: Utente = Depends(get_current_user),
):
    """Invia notifica push a tutti gli operativi con la loro programmazione della settimana."""
    if user.ruolo not in RUOLI_ADMIN:
        raise HTTPException(403)

    progs = db.query(ProgrammazioneSettimana).filter(
        ProgrammazioneSettimana.anno == body.anno,
        ProgrammazioneSettimana.settimana == body.settimana,
    ).all()

    if not progs:
        raise HTTPException(404, "Nessuna programmazione per questa settimana")

    from app.routers.notifiche import invia_notifica
    notificati = 0
    for p in progs:
        if not p.operativo:
            continue
        giorni_str = ""
        for g in GIORNI_ORDINE:
            info = (p.giorni or {}).get(g)
            if info and (info.get("cantiere_nome") or info.get("lavorazione")):
                dove = info.get("cantiere_nome") or "—"
                lav = info.get("lavorazione") or ""
                giorni_str += f"{g.upper()}: {dove}"
                if lav: giorni_str += f" ({lav})"
                giorni_str += "\n"

        corpo = f"Settimana {body.settimana}:\n{giorni_str.strip()}" if giorni_str else f"Settimana {body.settimana} programmata"
        invia_notifica(db, [p.operativo_id], "📅 Programmazione settimana", corpo, "/")
        notificati += 1

    return {"ok": True, "notificati": notificati}
