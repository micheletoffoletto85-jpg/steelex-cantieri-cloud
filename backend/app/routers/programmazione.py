import os, tempfile, json as _json, base64
from datetime import datetime, date, timedelta
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy import or_
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.database import get_db
from app.models.programmazione import ProgrammazioneSettimana
from app.models.assegnazione import AssegnazioneOperatore
from app.models.artigiano import Artigiano
from app.models.utente import Utente, RuoloUtente
from app.models.cantiere import Cantiere
from app.auth import get_current_user
from app.config import settings

router = APIRouter(prefix="/programmazione", tags=["Programmazione"])

RUOLI_ADMIN = {RuoloUtente.admin, RuoloUtente.capo_cantiere, RuoloUtente.capo_cantiere_sub, RuoloUtente.amministrazione}

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
    """Match fuzzy nome operativo — gestisce nomi parziali e composti."""
    if not nome:
        return None
    nome_l = nome.lower().strip()
    # Rimuovi caratteri extra comuni
    nome_l = nome_l.replace('+', ' ').replace(',', ' ').strip()
    best = None
    for u in utenti:
        full = f"{u.nome} {u.cognome}".lower()
        n = u.nome.lower()
        c = u.cognome.lower()
        if nome_l == full or nome_l == n or nome_l == c:
            return u.id  # match esatto — restituisci subito
        if n in nome_l or c in nome_l or nome_l in full:
            best = u.id
    return best


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


@router.get("/operativi")
def lista_operativi(
    db: Session = Depends(get_db),
    user: Utente = Depends(get_current_user),
):
    """Utenti pianificabili — accessibile anche a capi cantiere (non solo admin)."""
    if user.ruolo not in RUOLI_ADMIN:
        raise HTTPException(403)
    utenti = db.query(Utente).filter(
        Utente.ruolo.in_([RuoloUtente.artigiano, RuoloUtente.capo_cantiere, RuoloUtente.capo_cantiere_sub]),
        Utente.attivo == True,
    ).order_by(Utente.cognome, Utente.nome).all()
    return [{"id": u.id, "nome": u.nome, "cognome": u.cognome, "ruolo": u.ruolo} for u in utenti]


TIPI_LIBERI_LABEL = {"ferie": "Ferie", "corso": "Corso", "permesso": "Permesso", "altro": "Fuori cantiere"}


def _ass_info(a: AssegnazioneOperatore) -> dict:
    tipo = a.tipo or "cantiere"
    return {
        "tipo": tipo,
        "cantiere_id": a.cantiere_id,
        # Per le attività libere l'etichetta del tipo prende il posto del cantiere
        "cantiere_nome": a.cantiere.nome if a.cantiere else TIPI_LIBERI_LABEL.get(tipo),
        "lavorazione": a.lavorazione,
        "note": a.note,
    }


@router.get("/mia")
def mia_programmazione(
    anno: Optional[int] = None,
    settimana: Optional[int] = None,
    db: Session = Depends(get_db),
    user: Utente = Depends(get_current_user),
):
    """Programma settimanale personale.

    Fonte primaria: le assegnazioni del Gantt Operatori (turni M/P).
    Ripiego: la programmazione manuale, per i giorni senza assegnazioni.
    """
    if not anno or not settimana:
        anno, settimana = _settimana_corrente()

    # Programmazione manuale (base di partenza, se esiste)
    prog = db.query(ProgrammazioneSettimana).filter(
        ProgrammazioneSettimana.operativo_id == user.id,
        ProgrammazioneSettimana.anno == anno,
        ProgrammazioneSettimana.settimana == settimana,
    ).first()
    giorni_out = _prog_dict(prog, db)["giorni"] if prog else {}

    # Assegnazioni Gantt: l'account può essere un utente interno
    # o collegato a una scheda della rubrica artigiani
    lunedi = date.fromisocalendar(anno, settimana, 1)
    artigiano_ids = [
        a.id for a in db.query(Artigiano).filter(Artigiano.utente_id == user.id).all()
    ]
    condizioni = [AssegnazioneOperatore.utente_id == user.id]
    if artigiano_ids:
        condizioni.append(AssegnazioneOperatore.artigiano_id.in_(artigiano_ids))
    assegnazioni = (
        db.query(AssegnazioneOperatore)
        .filter(
            AssegnazioneOperatore.data >= lunedi,
            AssegnazioneOperatore.data <= lunedi + timedelta(days=6),
            or_(*condizioni),
        )
        .all()
    )

    # Le assegnazioni Gantt sovrascrivono il giorno corrispondente
    for a in assegnazioni:
        giorno = GIORNI_ORDINE[a.data.isoweekday() - 1]
        info = giorni_out.get(giorno) or {}
        if info.get("fonte") != "gantt":
            info = {"fonte": "gantt", "turni": {}}
        info["turni"][a.turno] = _ass_info(a)
        # Campi piatti retro-compatibili: mattina se c'è, altrimenti pomeriggio
        principale = info["turni"].get("M") or info["turni"].get("P")
        info.update(principale)
        giorni_out[giorno] = info

    if not giorni_out:
        return None

    return {
        "id": prog.id if prog else None,
        "operativo_id": user.id,
        "operativo_nome": f"{user.nome} {user.cognome}",
        "anno": anno,
        "settimana": settimana,
        "notificato_il": prog.notificato_il.isoformat() if prog and getattr(prog, "notificato_il", None) else None,
        "giorni": giorni_out,
        "aggiornato_il": prog.aggiornato_il.isoformat() if prog and prog.aggiornato_il else None,
    }


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


PROMPT_ESTRAI_TABELLA = """Sei un parser JSON. Estrai i dati da questa tabella di programmazione settimanale.
Rispondi SOLO con un array JSON valido. Nessun testo prima o dopo. Nessun markdown. Inizia con [ finisci con ].

Ogni riga diventa un oggetto JSON:
{{"nome": "nome singolo operaio", "giorno": "lun|mar|mer|gio|ven|sab", "cantiere": "nome cantiere", "lavorazione": "descrizione lavoro"}}

Regole IMPORTANTI:
- Se la colonna "Chi" contiene "Nome1 + Nome2" o "Nome1, Nome2": crea UN OGGETTO SEPARATO per ogni persona
- Giorni: Lunedi=lun, Martedi=mar, Mercoledi=mer, Giovedi=gio, Venerdi=ven, Sabato=sab
- Se un giorno ha più righe persone/cantieri: crea un oggetto per ogni combinazione persona+cantiere
- Ometti righe vuote o con trattino

Esempio: se "Flavio + Alberto" vanno a "Panerai" il lunedi:
[{{"nome":"Flavio","giorno":"lun","cantiere":"Panerai","lavorazione":"..."}},{{"nome":"Alberto","giorno":"lun","cantiere":"Panerai","lavorazione":"..."}}]

{testo}"""


@router.post("/importa-pdf")
async def importa_da_pdf(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: Utente = Depends(get_current_user),
):
    """Importa tabella programmazione da PDF o immagine usando Claude AI."""
    if user.ruolo not in RUOLI_ADMIN:
        raise HTTPException(403)
    if not settings.ANTHROPIC_API_KEY:
        raise HTTPException(503, detail="ANTHROPIC_API_KEY non configurata su Railway — aggiungila nelle variabili d'ambiente del backend")

    contenuto = await file.read()
    filename = (file.filename or "").lower()
    content_type = (file.content_type or "").lower()

    import anthropic
    from PIL import Image
    import io as _io

    claude = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)

    img_b64 = None
    testo_pdf = ""

    def _to_png_b64(data: bytes) -> str:
        """Converte qualsiasi immagine in PNG base64 usando Pillow."""
        img = Image.open(_io.BytesIO(data))
        buf = _io.BytesIO()
        img.convert("RGB").save(buf, format="PNG")
        return base64.b64encode(buf.getvalue()).decode()

    # Rileva se è immagine (screenshot iPhone, JPG, PNG, WebP, ecc.)
    is_image = content_type.startswith("image/") or any(
        filename.endswith(x) for x in (".jpg", ".jpeg", ".png", ".webp", ".gif", ".heic", ".heif", ".bmp")
    )

    if is_image:
        try:
            img_b64 = _to_png_b64(contenuto)
        except Exception as e:
            raise HTTPException(422, detail=f"Impossibile leggere l'immagine: {e}")
    else:
        # PDF: prova estrazione testo
        try:
            import fitz
            doc = fitz.open(stream=contenuto, filetype="pdf")
            for page in doc:
                testo_pdf += page.get_text("text") + "\n"
            doc.close()
        except Exception:
            # Non è un PDF valido — prova come immagine con Pillow
            try:
                img_b64 = _to_png_b64(contenuto)
            except Exception as e:
                raise HTTPException(422, detail=f"File non riconosciuto. Carica un PDF, una foto o uno screenshot della tabella.")

        # PDF con poco testo → renderizza come immagine
        if not img_b64 and len(testo_pdf.strip()) < 50:
            try:
                import fitz
                doc = fitz.open(stream=contenuto, filetype="pdf")
                pix = doc[0].get_pixmap(dpi=150)
                img_b64 = base64.b64encode(pix.tobytes("png")).decode()
                doc.close()
            except Exception:
                pass  # usa il testo scarso comunque

    # Chiama Claude
    try:
        if img_b64:
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
    except Exception as e:
        raise HTTPException(502, detail=f"Errore Claude AI: {str(e)[:200]}")

    raw = msg.content[0].text.strip()

    # Estrazione JSON robusta
    import re as _re
    import ast as _ast

    def _estrai_json(testo: str):
        # 1. Blocco ```json ... ```
        m = _re.search(r'```(?:json)?\s*([\s\S]*?)```', testo)
        if m:
            try: return _json.loads(m.group(1).strip())
            except Exception: pass
        # 2. Prima [ fino all'ultima ]
        m2 = _re.search(r'\[[\s\S]*\]', testo)
        if m2:
            try: return _json.loads(m2.group(0))
            except Exception: pass
            try: return _ast.literal_eval(m2.group(0))
            except Exception: pass
        # 3. Testo intero
        try: return _json.loads(testo)
        except Exception: pass
        return None

    righe = _estrai_json(raw)
    if righe is None:
        raise HTTPException(422, detail=f"Claude non ha restituito JSON valido. Risposta ricevuta: {raw[:300]}")

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
        invia_notifica(db, [p.operativo_id], "📅 Programmazione settimana", corpo, "/programmazione")
        notificati += 1

    return {"ok": True, "notificati": notificati}


# IMPORTANTE: questa route deve stare DOPO /importa-pdf e /pubblica-settimana
# perché /{prog_id} matcherebbe anche quelle stringhe se registrata prima
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
