import os, tempfile, json as _json, logging
logger = logging.getLogger(__name__)
from datetime import datetime, date as date_today
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from typing import List as TypingList
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.database import get_db
from app.models.rapportino import RapportinoOperativo
from app.models.utente import Utente, RuoloUtente
from app.models.cantiere import Cantiere
from app.models.diario import DiarioGiornaliero
from app.auth import get_current_user
from app.config import settings
from app.storage import salva_file
from app.routers.notifiche import notifica_cantiere

router = APIRouter(prefix="/rapportini", tags=["Rapportini Operativi"])

RUOLI_OPERATIVO = {RuoloUtente.artigiano}
RUOLI_ADMIN     = {RuoloUtente.admin, RuoloUtente.capo_cantiere, RuoloUtente.amministrazione}

# ── Prompt estrazione strutturata ──────────────────────────────────────────────

PROMPT_ESTRAI = """Analizza questo rapportino di lavoro scritto in italiano da un operaio edile.
Estrai le informazioni in formato JSON. Rispondi SOLO con il JSON, nessun altro testo.

{{
  "cantiere": "nome del cantiere o indirizzo menzionato (stringa), null se non specificato",
  "data_lavoro": "data nel formato YYYY-MM-DD se menzionata, null altrimenti",
  "ore": numero_decimale_ore_lavorate oppure null,
  "lavorazioni": ["lista sintetica delle lavorazioni eseguite, max 5-6 parole ciascuna"],
  "materiali": ["lista dei materiali usati, es: 'Cartongesso 12.5mm', 'Viti 25mm'"],
  "criticita": "descrizione del problema emerso in una frase, null se nessuna criticità",
  "spese_extra": [{{"descrizione": "cosa", "importo": numero_o_null}}],
  "riassunto": "frase di max 2 righe che riassume la giornata di lavoro"
}}

Regole:
- Se l'operaio cita un numero di ore (es. "otto ore", "7 ore e mezza"), estrailo come numero
- Se cita materiali specifici, inseriscili nella lista materiali
- Se cita un costo aggiuntivo o una spesa non prevista, inseriscila in spese_extra
- Non inventare dati non presenti nel testo
- I campi lavorazioni e materiali devono essere liste di stringhe brevi

Rapportino:
{testo}

JSON:"""

def _estrai_dati(testo: str, cantieri_nomi: list) -> dict:
    """Chiama Claude per estrarre i dati strutturati dal testo del rapportino."""
    if not settings.ANTHROPIC_API_KEY:
        return {"cantiere": None, "ore": None, "lavorazioni": [], "materiali": [],
                "criticita": None, "spese_extra": [], "riassunto": testo[:200], "data_lavoro": None}
    import anthropic
    claude = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)

    hint_cantieri = ""
    if cantieri_nomi:
        hint_cantieri = f"\nCantieri attivi conosciuti (cerca la corrispondenza migliore): {', '.join(cantieri_nomi[:20])}\n"

    prompt = PROMPT_ESTRAI.format(testo=testo) + hint_cantieri
    msg = claude.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=4096,
        messages=[{"role": "user", "content": prompt}]
    )
    raw = msg.content[0].text.strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"): raw = raw[4:]
    try:
        return _json.loads(raw)
    except Exception:
        return {"cantiere": None, "ore": None, "lavorazioni": [], "materiali": [],
                "criticita": None, "spese_extra": [], "riassunto": testo[:200], "data_lavoro": None}


def _match_cantiere(nome_rilevato: Optional[str], cantieri: list) -> Optional[int]:
    """Match fuzzy del nome cantiere rilevato con i cantieri nel DB."""
    if not nome_rilevato:
        return None
    nome_lower = nome_rilevato.lower()
    for c in cantieri:
        if nome_lower in (c.nome or "").lower() or (c.nome or "").lower() in nome_lower:
            return c.id
        indirizzo = (c.indirizzo or "").lower()
        if indirizzo and (nome_lower in indirizzo or indirizzo in nome_lower):
            return c.id
    return None


def _rap_dict(r: RapportinoOperativo) -> dict:
    return {
        "id": r.id,
        "operativo_id": r.operativo_id,
        "operativo_nome": f"{r.operativo.nome} {r.operativo.cognome}" if r.operativo else None,
        "cantiere_id": r.cantiere_id,
        "cantiere_nome": r.cantiere.nome if r.cantiere else None,
        "cantiere_rilevato": r.cantiere_rilevato,
        "diario_id": r.diario_id,
        "creato_il": r.creato_il.isoformat() if r.creato_il else None,
        "data_lavoro": r.data_lavoro,
        "testo_italiano": r.testo_italiano,
        "testo_originale": r.testo_originale,
        "lingua_originale": r.lingua_originale,
        "ore_lavorate": r.ore_lavorate,
        "lavorazioni": r.lavorazioni or [],
        "materiali": r.materiali or [],
        "criticita": r.criticita,
        "spese_extra": r.spese_extra or [],
        "riassunto": r.riassunto,
        "stato": r.stato,
        "fuori_cantiere": r.fuori_cantiere,
        "foto_urls": r.foto_urls or [],
        "validato_da": f"{r.validato_da.nome} {r.validato_da.cognome}" if r.validato_da else None,
        "validato_il": r.validato_il.isoformat() if r.validato_il else None,
        "note_admin": r.note_admin,
    }


# ── Endpoints ──────────────────────────────────────────────────────────────────

WHISPER_PROMPT = (
    "Cantiere edile LSF (Light Steel Frame), operaio che descrive lavori giornalieri in italiano. "
    "Termini tecnici struttura: fondamenta, travi, carpenteria, soletta, cls, ferro, ponteggio, "
    "pannelli, montanti, profili, bulloni, viti, tasselli, staffa, binario, rotaia, gru, escavatore, betoniera, "
    "solaio, pilastro, muratura, saldatura, lamiera, lastra, lastra di parete, lastra di solaio. "
    "Termini finiture: rasatura, intonaco, cartongesso, isolamento, cappotto termico, pavimentazione, "
    "piastrelle, rivestimento, verniciatura, laccaggio, silicone, sigillatura, stucco. "
    "Locali e ambienti: sgabuzzino, vano scala, locale tecnico, intercapedine, sottotetto, cavedio, "
    "bagno, cucina, corridoio, garage, cantina, ripostiglio, tramezza, controparete. "
    "Operazioni comuni: demolizione, rimozione, posa, montaggio, smontaggio, taglio, foratura, "
    "impermeabilizzazione, coibentazione, livellamento, tracciamento, pulizia cantiere, completamento. "
    "Azienda: STEELEX, Fontana Raffaele, GeoColors, Geo Buildings."
)

@router.post("/trascrivi")
async def trascrivi_audio(
    audio: UploadFile = File(...),
    lingua_hint: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    user: Utente = Depends(get_current_user),
):
    """Trascrive l'audio con Whisper + Claude reordering, senza salvare — per preview pre-invio."""
    if not settings.OPENAI_API_KEY:
        raise HTTPException(503, "OpenAI API key non configurata")

    suffix = os.path.splitext(audio.filename or "audio.webm")[1] or ".webm"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(await audio.read()); tmp_path = tmp.name

    # File vuoto/minuscolo = registrazione corrotta dal telefono: messaggio chiaro invece dell'errore OpenAI
    if os.path.getsize(tmp_path) < 1024:
        try: os.unlink(tmp_path)
        except Exception: pass
        raise HTTPException(422, "Registrazione vuota o troppo breve — riprova parlando qualche secondo")

    try:
        from openai import OpenAI
        client = OpenAI(api_key=settings.OPENAI_API_KEY)
        whisper_kwargs = {"model": "gpt-4o-transcribe", "file": None, "response_format": "json", "prompt": WHISPER_PROMPT}
        if lingua_hint and lingua_hint != "auto":
            whisper_kwargs["language"] = lingua_hint
        with open(tmp_path, "rb") as af:
            whisper_kwargs["file"] = af
            risposta = client.audio.transcriptions.create(**whisper_kwargs)
        testo_originale = risposta.text.strip()
        lingua = lingua_hint if (lingua_hint and lingua_hint != "auto") else (getattr(risposta, "language", "it") or "it")
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("[trascrivi] Errore Whisper — utente=%s filename=%s size=%s", getattr(user, 'id', '?'), audio.filename, os.path.getsize(tmp_path))
        err_str = str(e).lower()
        if "quota" in err_str or "rate" in err_str or "429" in err_str:
            raise HTTPException(503, "Servizio di trascrizione momentaneamente sovraccarico — riprova tra qualche secondo")
        if "format" in err_str or "codec" in err_str or "invalid" in err_str:
            raise HTTPException(422, "Formato audio non supportato — riprova registrando di nuovo")
        raise HTTPException(502, f"Errore trascrizione: {str(e)[:120]}")
    finally:
        try: os.unlink(tmp_path)
        except Exception: pass

    if not testo_originale:
        raise HTTPException(422, "Audio non udibile o troppo corto — riprova")

    testo_finale = testo_originale
    if settings.ANTHROPIC_API_KEY and len(testo_originale.split()) >= 3:
      try:
        import anthropic
        claude = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
        LINGUE = {"it":"italiano","ro":"rumeno","en":"inglese","de":"tedesco",
                  "fr":"francese","pl":"polacco","uk":"ucraino"}
        lingua_nome = LINGUE.get(lingua, lingua)
        RIORDINA = (
            f"Sei un assistente che aiuta gli operai di cantiere a comunicare meglio.\n"
            f"Ricevi la trascrizione grezza in {lingua_nome} di un operaio che descrive la sua giornata lavorativa.\n"
            f"Riscrivi il testo nella stessa lingua ({lingua_nome}):\n"
            "- Frasi brevi e chiare\n"
            "- Elimina ripetizioni, esitazioni (uhm, cioè, quindi...) e ridondanze\n"
            "- Mantieni TUTTE le informazioni sul lavoro: cantiere, attività svolte, materiali, problemi\n"
            "- Parole semplici — niente tecnicismi inutili\n"
            "- NON tradurre, rimani in {lingua}\n\n"
            "Trascrizione grezza:\n{txt}\n\nTesto riordinato:"
        )
        msg_a = claude.messages.create(
            model="claude-haiku-4-5-20251001", max_tokens=4096,
            messages=[{"role":"user","content":RIORDINA.format(txt=testo_originale, lingua=lingua_nome)}])
        testo_riordinato = msg_a.content[0].text.strip()

        if lingua != "it":
            TRADUCI = (
                f"Traduci in italiano semplice questo testo in {lingua_nome} scritto da un operaio di cantiere.\n"
                "Regole:\n"
                "- Italiano diretto e semplice, come parlerebbe un operaio italiano\n"
                "- Conserva tutti i dettagli: cantiere, attività, materiali, eventuali problemi\n"
                "- Frasi brevi, niente tecnicismi inutili\n"
                "- NON aggiungere informazioni che non ci sono nel testo originale\n\n"
                f"Testo in {lingua_nome}:\n{{txt}}\n\nTraduzione in italiano:"
            )
            msg_b = claude.messages.create(
                model="claude-haiku-4-5-20251001", max_tokens=4096,
                messages=[{"role":"user","content":TRADUCI.format(txt=testo_riordinato)}])
            testo_finale = msg_b.content[0].text.strip()
        else:
            testo_finale = testo_riordinato
      except Exception:
        logger.exception("[trascrivi] Errore Claude reordering — fallback a testo Whisper grezzo")
        testo_finale = testo_originale

    return {"testo": testo_finale, "lingua": lingua}


@router.post("/invia")
async def invia_rapportino(
    file: UploadFile = File(None),
    testo: str = Form(None),
    cantiere_id: Optional[int] = Form(None),
    lingua_hint: Optional[str] = Form(None),
    data_riferimento: Optional[str] = Form(None),
    foto: TypingList[UploadFile] = File(default=[]),
    db: Session = Depends(get_db),
    user: Utente = Depends(get_current_user),
):
    """Operativo invia rapportino (audio o testo). Claude estrae i dati strutturati."""
    testo_originale = None
    testo_elaborato = None
    testo_ita       = None
    lingua          = "it"

    if file and file.filename:
        # ── Audio: Whisper + Claude 2-step ────────────────────────────────────
        if not settings.OPENAI_API_KEY:
            raise HTTPException(503, "OpenAI API key non configurata")
        suffix = os.path.splitext(file.filename or "audio.webm")[1] or ".webm"
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(await file.read()); tmp_path = tmp.name
        if os.path.getsize(tmp_path) < 1024:
            try: os.unlink(tmp_path)
            except Exception: pass
            raise HTTPException(422, "Registrazione vuota o troppo breve — riprova parlando qualche secondo")
        try:
            from openai import OpenAI
            client = OpenAI(api_key=settings.OPENAI_API_KEY)
            whisper_kwargs = {"model": "gpt-4o-transcribe", "file": None, "response_format": "json", "prompt": WHISPER_PROMPT}
            if lingua_hint and lingua_hint != "auto":
                whisper_kwargs["language"] = lingua_hint
            with open(tmp_path, "rb") as af:
                whisper_kwargs["file"] = af
                risposta = client.audio.transcriptions.create(**whisper_kwargs)
            testo_originale = risposta.text.strip()
            lingua = lingua_hint if (lingua_hint and lingua_hint != "auto") else (getattr(risposta, "language", "it") or "it")
        except HTTPException:
            raise
        except Exception as e:
            logger.exception("[invia] Errore Whisper — utente=%s filename=%s", getattr(user, 'id', '?'), getattr(file, 'filename', '?'))
            err_str = str(e).lower()
            if "quota" in err_str or "rate" in err_str or "429" in err_str:
                raise HTTPException(503, "Servizio di trascrizione momentaneamente sovraccarico — riprova tra qualche secondo")
            raise HTTPException(502, f"Errore trascrizione: {str(e)[:120]}")
        finally:
            try: os.unlink(tmp_path)
            except Exception: pass

        if not testo_originale:
            raise HTTPException(422, "Audio non udibile")

        # Claude: riordina nella lingua originale poi traduce
        if settings.ANTHROPIC_API_KEY and len(testo_originale.split()) >= 3:
            import anthropic
            claude = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
            LINGUE = {"it":"italiano","ro":"rumeno","en":"inglese","de":"tedesco","fr":"francese","pl":"polacco","uk":"ucraino"}
            lingua_nome = LINGUE.get(lingua, lingua)

            RIORDINA = (
                f"Ricevi la trascrizione grezza in {lingua_nome} di un operaio di cantiere.\n"
                "Riscrivi nella stessa lingua, in modo chiaro, eliminando ripetizioni.\n"
                "NON tradurre. Solo testo scorrevole.\n\nTrascrizione:\n{txt}\n\nTesto ordinato:"
            )
            msg_a = claude.messages.create(
                model="claude-haiku-4-5-20251001", max_tokens=4096,
                messages=[{"role":"user","content":RIORDINA.format(txt=testo_originale)}])
            testo_elaborato = msg_a.content[0].text.strip()

            if lingua != "it":
                TRADUCI = (
                    f"Traduci in italiano questo testo in {lingua_nome} scritto da un operaio di cantiere.\n"
                    "Traduci fedelmente, parole semplici, solo testo scorrevole.\n\n"
                    f"Testo:\n{testo_elaborato}\n\nTraduzione:"
                )
                msg_b = claude.messages.create(
                    model="claude-sonnet-4-6", max_tokens=4096,
                    messages=[{"role":"user","content":TRADUCI}])
                testo_ita = msg_b.content[0].text.strip()
            else:
                testo_ita = testo_elaborato
        else:
            testo_elaborato = testo_originale
            testo_ita = testo_originale

    elif testo:
        # ── Testo diretto ─────────────────────────────────────────────────────
        testo_originale = testo.strip()
        testo_elaborato = testo_originale
        testo_ita       = testo_originale
        lingua          = "it"
    else:
        raise HTTPException(400, "Fornisci audio o testo")

    # Carica lista cantieri attivi per il match
    cantieri_attivi = db.query(Cantiere).filter(Cantiere.stato.in_(["attivo","in_corso","preventivo","sospeso"])).all()
    cantieri_nomi = [c.nome for c in cantieri_attivi if c.nome]

    # Claude estrae dati strutturati
    dati = _estrai_dati(testo_ita, cantieri_nomi)

    # Se l'operativo ha selezionato manualmente il cantiere, usa quello; altrimenti tenta match automatico
    if cantiere_id:
        # Verifica che l'operativo sia assegnato a quel cantiere
        cantiere_obj = db.query(Cantiere).filter(Cantiere.id == cantiere_id).first()
        if not cantiere_obj:
            cantiere_id = None
    else:
        cantiere_id = _match_cantiere(dati.get("cantiere"), cantieri_attivi)

    # Salva foto allegate
    foto_urls = []
    if foto:
        for f in foto:
            if f and f.filename:
                try:
                    ext = os.path.splitext(f.filename)[1].lower() or ".jpg"
                    contenuto = await f.read()
                    url, _ = salva_file(contenuto, "rapportini", ext)
                    if url:
                        foto_urls.append(url)
                except Exception:
                    pass

    rapportino = RapportinoOperativo(
        operativo_id    = user.id,
        cantiere_id     = cantiere_id,
        data_lavoro     = data_riferimento or dati.get("data_lavoro") or str(date_today.today()),
        testo_originale = testo_originale,
        testo_elaborato = testo_elaborato,
        testo_italiano  = testo_ita,
        lingua_originale = lingua,
        cantiere_rilevato = dati.get("cantiere"),
        ore_lavorate    = dati.get("ore"),
        lavorazioni     = dati.get("lavorazioni") or [],
        materiali       = dati.get("materiali") or [],
        criticita       = dati.get("criticita"),
        spese_extra     = dati.get("spese_extra") or [],
        riassunto       = dati.get("riassunto") or testo_ita[:200],
        stato           = "inviato",
        fuori_cantiere  = cantiere_id is None,
        foto_urls       = foto_urls,
    )
    db.add(rapportino); db.commit(); db.refresh(rapportino)

    # Notifica admin
    try:
        admins = db.query(Utente).filter(Utente.ruolo.in_(["admin","capo_cantiere"])).all()
        from app.routers.notifiche import invia_notifica
        for a in admins:
            invia_notifica(db, [a.id], "📋 Nuovo rapportino", f"{user.nome} {user.cognome}: {rapportino.riassunto[:80]}", url="/rapportini")
    except Exception: pass

    return _rap_dict(rapportino)


@router.get("/miei")
def miei_rapportini(db: Session = Depends(get_db), user: Utente = Depends(get_current_user)):
    """Operativo vede i propri rapportini."""
    rs = db.query(RapportinoOperativo).filter(
        RapportinoOperativo.operativo_id == user.id
    ).order_by(RapportinoOperativo.creato_il.desc()).limit(50).all()
    return [_rap_dict(r) for r in rs]


@router.get("/da-validare")
def da_validare(db: Session = Depends(get_db), user: Utente = Depends(get_current_user)):
    """Admin: rapportini in attesa di validazione."""
    if user.ruolo not in RUOLI_ADMIN:
        raise HTTPException(403)
    rs = db.query(RapportinoOperativo).filter(
        RapportinoOperativo.stato == "inviato"
    ).order_by(RapportinoOperativo.creato_il.desc()).all()
    return [_rap_dict(r) for r in rs]


@router.get("/fuori-cantiere")
def fuori_cantiere(db: Session = Depends(get_db), user: Utente = Depends(get_current_user)):
    """Admin: rapportini validati senza cantiere assegnato."""
    if user.ruolo not in RUOLI_ADMIN:
        raise HTTPException(403)
    rs = db.query(RapportinoOperativo).filter(
        RapportinoOperativo.fuori_cantiere == True,
        RapportinoOperativo.stato.in_(["inviato", "validato"]),
    ).order_by(RapportinoOperativo.creato_il.desc()).all()
    return [_rap_dict(r) for r in rs]


class ValidaBody(BaseModel):
    cantiere_id: Optional[int] = None
    note_admin: Optional[str] = None
    rifiuta: bool = False


def _crea_diario_da_rapportino(db: Session, r: RapportinoOperativo, cantiere_id: int) -> None:
    """Crea la nota diario nel cantiere a partire dal rapportino e la collega."""
    data_str = r.data_lavoro or str(date_today.today())
    try:
        data_obj = date_today.fromisoformat(data_str)
    except Exception:
        data_obj = date_today.today()

    testo_diario = r.testo_italiano or r.riassunto
    if r.materiali:
        testo_diario += f"\n\nMateriali usati: {', '.join(r.materiali)}"
    if r.criticita:
        testo_diario += f"\n\n⚠️ Criticità: {r.criticita}"

    # Costruisce voci_estratte con le ore del rapportino
    voci = []
    if r.ore_lavorate and r.ore_lavorate > 0:
        nome_op = ""
        if r.operativo:
            nome_op = f"{r.operativo.nome} {r.operativo.cognome}".strip()
        voci.append({
            "tipo": "ore_extra",
            "operaio": nome_op,
            "ore": float(r.ore_lavorate),
            "attivita": r.riassunto or "",
            "approvato": False,
        })

    diario = DiarioGiornaliero(
        cantiere_id     = cantiere_id,
        data            = data_obj,
        autore_id       = r.operativo_id,
        attivita        = testo_diario,
        fonte           = "voce",
        testo_originale = r.testo_originale,
        lingua_originale = r.lingua_originale,
        stato_validazione = "pubblicata",
        foto_urls       = r.foto_urls or [],
        voci_estratte   = voci,
    )
    db.add(diario); db.flush()
    r.diario_id = diario.id


class AssegnaBody(BaseModel):
    cantiere_id: int


@router.put("/{rapportino_id}/assegna-cantiere")
def assegna_cantiere_rapportino(
    rapportino_id: int,
    body: AssegnaBody,
    db: Session = Depends(get_db),
    user: Utente = Depends(get_current_user),
):
    """Admin: assegna (o riassegna) un cantiere a un rapportino già validato rimasto fuori cantiere."""
    if user.ruolo not in RUOLI_ADMIN:
        raise HTTPException(403)
    r = db.query(RapportinoOperativo).filter(RapportinoOperativo.id == rapportino_id).first()
    if not r: raise HTTPException(404)

    cantiere = db.query(Cantiere).filter(Cantiere.id == body.cantiere_id).first()
    if not cantiere: raise HTTPException(404, "Cantiere non trovato")

    r.cantiere_id = cantiere.id
    r.fuori_cantiere = False

    if r.diario_id:
        # Sposta la nota diario esistente sul nuovo cantiere
        diario = db.query(DiarioGiornaliero).filter(DiarioGiornaliero.id == r.diario_id).first()
        if diario:
            diario.cantiere_id = cantiere.id
    elif r.stato == "validato":
        # Rapportino validato senza diario (era fuori cantiere): crealo ora
        _crea_diario_da_rapportino(db, r, cantiere.id)

    db.commit()
    return _rap_dict(r)


@router.put("/{rapportino_id}/valida")
def valida_rapportino(
    rapportino_id: int,
    body: ValidaBody,
    db: Session = Depends(get_db),
    user: Utente = Depends(get_current_user),
):
    """Admin valida o rifiuta il rapportino. Se validato, crea una nota diario nel cantiere."""
    if user.ruolo not in RUOLI_ADMIN:
        raise HTTPException(403)
    r = db.query(RapportinoOperativo).filter(RapportinoOperativo.id == rapportino_id).first()
    if not r: raise HTTPException(404)

    if body.rifiuta:
        r.stato = "rifiutato"
        r.note_admin = body.note_admin
        r.validato_da_id = user.id
        r.validato_il = datetime.utcnow()
        db.commit()
        return _rap_dict(r)

    # Assegna cantiere se l'admin lo specifica (override del match automatico)
    cantiere_id = body.cantiere_id or r.cantiere_id
    r.cantiere_id = cantiere_id
    r.fuori_cantiere = cantiere_id is None

    # Crea nota diario nel cantiere (se assegnato)
    if cantiere_id:
        _crea_diario_da_rapportino(db, r, cantiere_id)

    r.stato = "validato"
    r.note_admin = body.note_admin
    r.validato_da_id = user.id
    r.validato_il = datetime.utcnow()
    db.commit()

    # Notifica l'operativo
    try:
        from app.routers.notifiche import invia_notifica
        msg = "✅ Rapportino validato" if not body.rifiuta else "❌ Rapportino rifiutato"
        invia_notifica(db, [r.operativo_id], msg, body.note_admin or "")
    except Exception: pass

    return _rap_dict(r)


@router.delete("/{rapportino_id}")
def elimina_rapportino(
    rapportino_id: int,
    db: Session = Depends(get_db),
    user: Utente = Depends(get_current_user),
):
    """Admin: elimina un rapportino."""
    if user.ruolo not in RUOLI_ADMIN:
        raise HTTPException(403, "Non autorizzato")
    r = db.query(RapportinoOperativo).filter(RapportinoOperativo.id == rapportino_id).first()
    if not r:
        raise HTTPException(404, "Rapportino non trovato")
    db.delete(r)
    db.commit()
    return {"ok": True}


@router.get("")
def lista_rapportini(db: Session = Depends(get_db), user: Utente = Depends(get_current_user)):
    """Admin: tutti i rapportini. Operativo: i propri."""
    if user.ruolo in RUOLI_ADMIN:
        rs = db.query(RapportinoOperativo).order_by(RapportinoOperativo.creato_il.desc()).limit(100).all()
    else:
        rs = db.query(RapportinoOperativo).filter(
            RapportinoOperativo.operativo_id == user.id
        ).order_by(RapportinoOperativo.creato_il.desc()).limit(50).all()
    return [_rap_dict(r) for r in rs]
