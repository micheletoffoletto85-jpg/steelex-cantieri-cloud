import os, re, tempfile, unicodedata, json as _json, logging
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
from app.models.diario import DiarioGiornaliero, OreExtra
from app.models.ore_lavorate import OreLavorate
from app.auth import get_current_user
from app.config import settings
from app.storage import salva_file
from app.routers.notifiche import notifica_cantiere

router = APIRouter(prefix="/rapportini", tags=["Rapportini Operativi"])

_MIME_EXT_AUDIO = {
    "audio/webm": ".webm", "audio/mp4": ".mp4", "audio/m4a": ".m4a", "audio/x-m4a": ".m4a",
    "audio/ogg": ".ogg", "audio/wav": ".wav", "audio/x-wav": ".wav", "audio/mpeg": ".mp3",
}


def _suffix_audio(upload_file) -> str:
    """Estensione per il file temporaneo: preferisce quella del filename, altrimenti
    la deriva dal content_type reale — un filename con estensione errata (es. mobile
    che tagga sempre .webm anche col codec di fallback del browser) mandava in
    errore Whisper con 'formato non supportato'."""
    suffix = os.path.splitext(upload_file.filename or "")[1]
    if suffix:
        return suffix
    return _MIME_EXT_AUDIO.get((upload_file.content_type or "").split(";")[0].strip(), ".webm")

RUOLI_OPERATIVO = {RuoloUtente.artigiano}
RUOLI_ADMIN     = {RuoloUtente.admin, RuoloUtente.capo_cantiere, RuoloUtente.amministrazione}

# ── Prompt estrazione strutturata ──────────────────────────────────────────────

PROMPT_ESTRAI = """Analizza questo rapportino di lavoro scritto in italiano da un operaio edile.
Estrai le informazioni in formato JSON. Rispondi SOLO con il JSON, nessun altro testo.

{{
  "cantiere": "nome del cantiere o indirizzo menzionato (stringa), null se non specificato",
  "data_lavoro": "data nel formato YYYY-MM-DD se menzionata, null altrimenti",
  "ore": numero_decimale_ore_lavorate oppure null,
  "testo": "la porzione di racconto relativa SOLO a questo primo cantiere, riscritta in modo che si
    legga da sola senza il resto — se il rapportino parla di UN SOLO cantiere, qui va l'intero racconto",
  "lavorazioni": ["lista sintetica delle lavorazioni eseguite, max 5-6 parole ciascuna"],
  "materiali": ["lista dei materiali usati, es: 'Cartongesso 12.5mm', 'Viti 25mm'"],
  "criticita": "descrizione del problema emerso in una frase, null se nessuna criticità",
  "spese_extra": [{{"descrizione": "cosa", "importo": numero_o_null}}],
  "extra_preventivo": true_oppure_false,
  "extra_preventivo_nota": "breve nota su cosa è extra, null se extra_preventivo è false",
  "riassunto": "frase di max 2 righe che riassume la giornata di lavoro",
  "altri_cantieri": [
    {{"cantiere": "nome del secondo cantiere menzionato", "ore": numero_decimale_o_null,
      "testo": "porzione di racconto relativa SOLO a questo cantiere, riscritta in modo che si legga da sola",
      "lavorazioni": ["lavorazioni fatte in QUEL cantiere"], "riassunto": "frase breve su quel cantiere"}}
  ]
}}

Regole:
- Se l'operaio cita un numero di ore (es. "otto ore", "7 ore e mezza"), estrailo come numero
- Se cita materiali specifici, inseriscili nella lista materiali
- Se cita un costo aggiuntivo o una spesa non prevista, inseriscila in spese_extra
- Imposta extra_preventivo a true SOLO se l'operaio dice esplicitamente che il lavoro è extra,
  fuori preventivo, non concordato o da aggiungere al preventivo (es. "questo è un lavoro extra",
  "non era nel preventivo", "da fatturare a parte") — non dedurlo da solo, in caso di dubbio lascialo false
- Non inventare dati non presenti nel testo — se un cantiere non è chiaramente riconoscibile lascialo null
  piuttosto che indovinare
- I campi lavorazioni e materiali devono essere liste di stringhe brevi
- ATTENZIONE ai cantieri multipli: rileggi sempre il racconto cercando cambi di luogo — parole come
  "poi sono andato a/al/da", "dopo pranzo mi sono spostato", "nel pomeriggio ero a", "stamattina invece",
  "prima... poi...", o due nomi di cantiere diversi citati in punti diversi del racconto, sono il segnale
  che si tratta di PIÙ cantieri nella stessa giornata, non uno solo con più fasi di lavoro
- In quel caso: metti il primo cantiere nei campi principali (cantiere, ore, testo, lavorazioni,
  riassunto = SOLO quella parte, non tutto il racconto) e OGNI cantiere successivo come voce separata
  in altri_cantieri, ciascuno con il proprio testo/ore/lavorazioni — il campo "testo" di ogni voce deve
  coprire, insieme agli altri, l'intero racconto originale senza perdere né duplicare frasi
- Esempio: "Stamattina ero al cantiere Rossi, ho fatto la posa del cartongesso per 4 ore. Poi nel
  pomeriggio sono passato dal cantiere Bianchi per la rasatura, altre 3 ore" → cantiere: "Rossi", ore: 4,
  testo: "Stamattina ho fatto la posa del cartongesso.", altri_cantieri: [{{"cantiere": "Bianchi", "ore": 3,
  "testo": "Nel pomeriggio ho fatto la rasatura."}}]
- Lascia altri_cantieri: [] se parla di un solo cantiere (caso normale, la maggioranza dei rapportini)

Rapportino:
{testo}

JSON:"""

def _estrai_dati(testo: str, cantieri_nomi: list) -> dict:
    """Chiama Claude per estrarre i dati strutturati dal testo del rapportino."""
    if not settings.ANTHROPIC_API_KEY:
        return {"cantiere": None, "ore": None, "lavorazioni": [], "materiali": [],
                "criticita": None, "spese_extra": [], "extra_preventivo": False, "extra_preventivo_nota": None,
                "riassunto": testo[:200], "data_lavoro": None,
                "altri_cantieri": [], "testo": testo}
    import anthropic
    claude = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)

    hint_cantieri = ""
    if cantieri_nomi:
        hint_cantieri = f"\nCantieri attivi conosciuti (cerca la corrispondenza migliore, anche parziale o con nomi simili): {', '.join(cantieri_nomi[:20])}\n"

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
        dati = _json.loads(raw)
        if not dati.get("testo"):
            dati["testo"] = testo
        return dati
    except Exception:
        return {"cantiere": None, "ore": None, "lavorazioni": [], "materiali": [],
                "criticita": None, "spese_extra": [], "extra_preventivo": False, "extra_preventivo_nota": None,
                "riassunto": testo[:200], "data_lavoro": None,
                "altri_cantieri": [], "testo": testo}


_PAROLE_NOISE = {"cantiere", "cliente", "via", "presso", "sig", "signor", "signora", "ditta", "azienda"}


def _normalizza_nome(s: Optional[str]) -> str:
    """Minuscolo, senza accenti, senza punteggiatura, senza parole generiche — così
    'Cantiere Rossi' e 'rossi' (o 'Rossì' trascritto male) combaciano lo stesso."""
    if not s:
        return ""
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode("ascii").lower()
    s = re.sub(r"[^\w\s]", " ", s)
    parole = [p for p in s.split() if p not in _PAROLE_NOISE]
    return " ".join(parole)


def _match_cantiere(nome_rilevato: Optional[str], cantieri: list) -> Optional[int]:
    """Match fuzzy del nome cantiere rilevato (dalla voce, quindi impreciso) con i cantieri
    nel DB: prima sottostringa sul nome/indirizzo normalizzati, poi — se non trova nulla —
    una parola significativa in comune (es. il cognome del cliente), per essere tollerante
    a piccoli errori di trascrizione invece di lasciare il rapportino sempre fuori cantiere."""
    nome_norm = _normalizza_nome(nome_rilevato)
    if not nome_norm:
        return None
    for c in cantieri:
        nome_c = _normalizza_nome(c.nome)
        if nome_c and (nome_norm in nome_c or nome_c in nome_norm):
            return c.id
        indirizzo_c = _normalizza_nome(c.indirizzo)
        if indirizzo_c and (nome_norm in indirizzo_c or indirizzo_c in nome_norm):
            return c.id
    parole_rilevate = {p for p in nome_norm.split() if len(p) >= 4}
    if parole_rilevate:
        for c in cantieri:
            if parole_rilevate & set(_normalizza_nome(c.nome).split()):
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
        "extra_preventivo": r.extra_preventivo or False,
        "extra_preventivo_nota": r.extra_preventivo_nota,
        "riassunto": r.riassunto,
        "stato": r.stato,
        "fuori_cantiere": r.fuori_cantiere,
        "multi_cantiere": r.multi_cantiere,
        "segmenti_cantieri": r.segmenti_cantieri or [],
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


def _whisper_prompt(db: Session) -> str:
    """WHISPER_PROMPT + nomi dei cantieri attivi, in coda — Whisper usa solo l'ultima parte
    del prompt come contesto, mettere qui i nomi propri aiuta a trascriverli giusti invece
    di sentirli male (es. 'Rossi' capito 'Rosi'), che è la causa più comune di mancato
    abbinamento automatico del cantiere."""
    cantieri_attivi = db.query(Cantiere).filter(Cantiere.stato.in_(["attivo", "in_corso", "preventivo", "sospeso"])).all()
    nomi = [c.nome for c in cantieri_attivi if c.nome]
    if not nomi:
        return WHISPER_PROMPT
    return WHISPER_PROMPT + f" Cantieri attivi: {', '.join(nomi[:15])}."


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

    suffix = _suffix_audio(audio)
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
        whisper_kwargs = {"model": "gpt-4o-transcribe", "file": None, "response_format": "json", "prompt": _whisper_prompt(db)}
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
        suffix = _suffix_audio(file)
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(await file.read()); tmp_path = tmp.name
        if os.path.getsize(tmp_path) < 1024:
            try: os.unlink(tmp_path)
            except Exception: pass
            raise HTTPException(422, "Registrazione vuota o troppo breve — riprova parlando qualche secondo")
        try:
            from openai import OpenAI
            client = OpenAI(api_key=settings.OPENAI_API_KEY)
            whisper_kwargs = {"model": "gpt-4o-transcribe", "file": None, "response_format": "json", "prompt": _whisper_prompt(db)}
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
    multi_cantiere = False
    segmenti_cantieri = None
    if cantiere_id:
        # Verifica che l'operativo sia assegnato a quel cantiere
        cantiere_obj = db.query(Cantiere).filter(Cantiere.id == cantiere_id).first()
        if not cantiere_obj:
            cantiere_id = None
    else:
        cantiere_id = _match_cantiere(dati.get("cantiere"), cantieri_attivi)

        # Rilevamento multi-cantiere: Claude segnala se il rapportino parla di più cantieri.
        # Costruiamo l'elenco segmenti (primo cantiere + eventuali altri) con il match automatico
        # per ciascuno — se il nome non corrisponde a nessun cantiere attivo, cantiere_id resta null
        # cosi' l'admin lo vede segnalato e sceglie a mano in fase di divisione.
        altri = dati.get("altri_cantieri") or []
        if altri:
            multi_cantiere = True
            segmenti_cantieri = [{
                "cantiere": dati.get("cantiere"),
                "cantiere_id": cantiere_id,
                "ore": dati.get("ore"),
                "testo": dati.get("testo"),
                "lavorazioni": dati.get("lavorazioni") or [],
                "riassunto": dati.get("riassunto"),
            }]
            for alt in altri:
                nome_alt = alt.get("cantiere")
                segmenti_cantieri.append({
                    "cantiere": nome_alt,
                    "cantiere_id": _match_cantiere(nome_alt, cantieri_attivi),
                    "ore": alt.get("ore"),
                    "testo": alt.get("testo"),
                    "lavorazioni": alt.get("lavorazioni") or [],
                    "riassunto": alt.get("riassunto"),
                })

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
        extra_preventivo = dati.get("extra_preventivo") or False,
        extra_preventivo_nota = dati.get("extra_preventivo_nota"),
        riassunto       = dati.get("riassunto") or testo_ita[:200],
        stato           = "inviato",
        fuori_cantiere  = cantiere_id is None,
        foto_urls       = foto_urls,
        multi_cantiere  = multi_cantiere,
        segmenti_cantieri = segmenti_cantieri,
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

    # Costruisce voci_estratte con le ore del rapportino — già segnate come registrate
    # perché le ore vengono imputate automaticamente al cantiere (vedi sotto), senza bisogno
    # che l'admin clicchi "→ Ore" a mano
    nome_op = ""
    if r.operativo:
        nome_op = f"{r.operativo.nome} {r.operativo.cognome}".strip()
    voci = []
    if r.ore_lavorate and r.ore_lavorate > 0:
        voci.append({
            "tipo": "ore_extra",
            "operaio": nome_op,
            "ore": float(r.ore_lavorate),
            "attivita": r.riassunto or "",
            "approvato": True,
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
        extra_preventivo = r.extra_preventivo or False,
        extra_preventivo_nota = r.extra_preventivo_nota,
    )
    db.add(diario); db.flush()
    r.diario_id = diario.id

    # Calcolo automatico ore lavorate → registrazione diretta nella sezione ore del cantiere
    if r.ore_lavorate and r.ore_lavorate > 0:
        ore_extra = OreExtra(
            cantiere_id    = cantiere_id,
            diario_id      = diario.id,
            operaio_nome   = nome_op or "Operativo",
            ore            = float(r.ore_lavorate),
            attivita       = r.riassunto or "",
            tariffa_oraria = 0.0,
            totale         = 0.0,
            data           = data_obj,
            approvato      = True,
            creato_da      = r.operativo_id,
        )
        db.add(ore_extra); db.flush()
        r.ore_extra_id = ore_extra.id

        # Aggiorna anche il registro ore personale dell'operativo — così non deve
        # inserirle a mano una seconda volta nella sezione "Ore lavorate"
        ore_personali = OreLavorate(
            utente_id   = r.operativo_id,
            data        = data_obj,
            ore         = float(r.ore_lavorate),
            descrizione = r.riassunto or "Rapportino di cantiere",
            rapportino_id = r.id,
        )
        db.add(ore_personali); db.flush()
        r.ore_lavorate_id = ore_personali.id


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
        # Sposta anche le ore già registrate automaticamente, se presenti
        if r.ore_extra_id:
            ore_extra = db.query(OreExtra).filter(OreExtra.id == r.ore_extra_id).first()
            if ore_extra:
                ore_extra.cantiere_id = cantiere.id
    elif r.stato == "validato":
        # Rapportino validato senza diario (era fuori cantiere): crealo ora
        _crea_diario_da_rapportino(db, r, cantiere.id)

    db.commit()
    return _rap_dict(r)


class ModificaBody(BaseModel):
    testo_italiano: Optional[str] = None
    riassunto: Optional[str] = None
    ore_lavorate: Optional[float] = None
    lavorazioni: Optional[List[str]] = None
    materiali: Optional[List[str]] = None
    criticita: Optional[str] = None
    extra_preventivo: Optional[bool] = None
    extra_preventivo_nota: Optional[str] = None


@router.put("/{rapportino_id}")
def modifica_rapportino(
    rapportino_id: int,
    body: ModificaBody,
    db: Session = Depends(get_db),
    user: Utente = Depends(get_current_user),
):
    """Admin: corregge il testo/ore/lavorazioni di un rapportino (es. errori di trascrizione).
    Se già validato, aggiorna anche la nota diario e le ore registrate automaticamente."""
    if user.ruolo not in RUOLI_ADMIN:
        raise HTTPException(403)
    r = db.query(RapportinoOperativo).filter(RapportinoOperativo.id == rapportino_id).first()
    if not r: raise HTTPException(404)

    dati = body.model_dump(exclude_unset=True)
    for campo in ("testo_italiano", "riassunto", "ore_lavorate", "lavorazioni", "materiali", "criticita",
                  "extra_preventivo", "extra_preventivo_nota"):
        if campo in dati:
            setattr(r, campo, dati[campo])

    # Tiene allineata la nota diario già pubblicata, se esiste
    if r.diario_id:
        diario = db.query(DiarioGiornaliero).filter(DiarioGiornaliero.id == r.diario_id).first()
        if diario:
            testo_diario = r.testo_italiano or r.riassunto
            if r.materiali:
                testo_diario += f"\n\nMateriali usati: {', '.join(r.materiali)}"
            if r.criticita:
                testo_diario += f"\n\n⚠️ Criticità: {r.criticita}"
            diario.attivita = testo_diario
            diario.extra_preventivo = r.extra_preventivo or False
            diario.extra_preventivo_nota = r.extra_preventivo_nota

    # Se le ore sono cambiate e c'era già una registrazione automatica, aggiornala
    if "ore_lavorate" in dati and r.ore_extra_id:
        ore_extra = db.query(OreExtra).filter(OreExtra.id == r.ore_extra_id).first()
        if ore_extra:
            if r.ore_lavorate and r.ore_lavorate > 0:
                ore_extra.ore = float(r.ore_lavorate)
                ore_extra.totale = round(ore_extra.ore * (ore_extra.tariffa_oraria or 0), 2)
            else:
                db.delete(ore_extra)
                r.ore_extra_id = None

    if "ore_lavorate" in dati and r.ore_lavorate_id:
        ore_personali = db.query(OreLavorate).filter(OreLavorate.id == r.ore_lavorate_id).first()
        if ore_personali:
            if r.ore_lavorate and r.ore_lavorate > 0:
                ore_personali.ore = float(r.ore_lavorate)
                ore_personali.aggiornato_il = datetime.utcnow()
            else:
                db.delete(ore_personali)
                r.ore_lavorate_id = None

    db.commit()
    return _rap_dict(r)


@router.put("/{rapportino_id}/rianalizza")
def rianalizza_rapportino(
    rapportino_id: int,
    db: Session = Depends(get_db),
    user: Utente = Depends(get_current_user),
):
    """Admin: rilancia il testo già registrato nell'estrazione IA aggiornata (matching cantiere
    migliorato, rilevamento multi-cantiere con testo diviso per segmento) — per sistemare i
    rapportini vecchi (estratti col prompt precedente) senza doverli ricorreggere a mano."""
    if user.ruolo not in RUOLI_ADMIN:
        raise HTTPException(403)
    r = db.query(RapportinoOperativo).filter(RapportinoOperativo.id == rapportino_id).first()
    if not r: raise HTTPException(404)
    if not r.testo_italiano:
        raise HTTPException(400, "Nessun testo da rianalizzare")
    if r.stato == "diviso":
        raise HTTPException(400, "Rapportino già diviso")

    cantieri_attivi = db.query(Cantiere).filter(Cantiere.stato.in_(["attivo", "in_corso", "preventivo", "sospeso"])).all()
    cantieri_nomi = [c.nome for c in cantieri_attivi if c.nome]
    dati = _estrai_dati(r.testo_italiano, cantieri_nomi)

    r.cantiere_rilevato = dati.get("cantiere")
    r.ore_lavorate = dati.get("ore")
    r.lavorazioni = dati.get("lavorazioni") or []
    r.materiali = dati.get("materiali") or []
    r.criticita = dati.get("criticita")
    r.spese_extra = dati.get("spese_extra") or []
    r.extra_preventivo = dati.get("extra_preventivo") or False
    r.extra_preventivo_nota = dati.get("extra_preventivo_nota")
    r.riassunto = dati.get("riassunto") or r.riassunto

    altri = dati.get("altri_cantieri") or []
    if altri:
        cantiere_id_primario = r.cantiere_id or _match_cantiere(dati.get("cantiere"), cantieri_attivi)
        r.multi_cantiere = True
        segmenti = [{
            "cantiere": dati.get("cantiere"), "cantiere_id": cantiere_id_primario,
            "ore": dati.get("ore"), "testo": dati.get("testo"),
            "lavorazioni": dati.get("lavorazioni") or [], "riassunto": dati.get("riassunto"),
        }]
        for alt in altri:
            nome_alt = alt.get("cantiere")
            segmenti.append({
                "cantiere": nome_alt, "cantiere_id": _match_cantiere(nome_alt, cantieri_attivi),
                "ore": alt.get("ore"), "testo": alt.get("testo"),
                "lavorazioni": alt.get("lavorazioni") or [], "riassunto": alt.get("riassunto"),
            })
        r.segmenti_cantieri = segmenti
    else:
        r.multi_cantiere = False
        r.segmenti_cantieri = None

    # Se non aveva ancora un cantiere assegnato, prova il match migliorato — non tocca invece
    # un cantiere già assegnato (validazione manuale o precedente), per non disfare correzioni fatte
    if r.fuori_cantiere or not r.cantiere_id:
        match = _match_cantiere(dati.get("cantiere"), cantieri_attivi)
        if match:
            r.cantiere_id = match
            r.fuori_cantiere = False

    # Se le ore sono cambiate e c'era già una registrazione automatica, aggiornala; se il
    # rapportino era già validato ma non aveva ancora ore registrate (dati vecchi, da prima
    # che questa automazione esistesse) e ora ne emergono, le crea ora invece di lasciarle perse
    nome_op = f"{r.operativo.nome} {r.operativo.cognome}".strip() if r.operativo else "Operativo"
    try:
        data_obj = date_today.fromisoformat(r.data_lavoro) if r.data_lavoro else date_today.today()
    except Exception:
        data_obj = date_today.today()

    if r.ore_extra_id:
        ore_extra = db.query(OreExtra).filter(OreExtra.id == r.ore_extra_id).first()
        if ore_extra:
            if r.ore_lavorate and r.ore_lavorate > 0:
                ore_extra.ore = float(r.ore_lavorate)
                ore_extra.totale = round(ore_extra.ore * (ore_extra.tariffa_oraria or 0), 2)
            else:
                db.delete(ore_extra)
                r.ore_extra_id = None
    elif r.diario_id and r.cantiere_id and r.ore_lavorate and r.ore_lavorate > 0:
        ore_extra = OreExtra(
            cantiere_id=r.cantiere_id, diario_id=r.diario_id, operaio_nome=nome_op,
            ore=float(r.ore_lavorate), attivita=r.riassunto or "", tariffa_oraria=0.0,
            totale=0.0, data=data_obj, approvato=True, creato_da=r.operativo_id,
        )
        db.add(ore_extra); db.flush()
        r.ore_extra_id = ore_extra.id

    if r.ore_lavorate_id:
        ore_personali = db.query(OreLavorate).filter(OreLavorate.id == r.ore_lavorate_id).first()
        if ore_personali:
            if r.ore_lavorate and r.ore_lavorate > 0:
                ore_personali.ore = float(r.ore_lavorate)
                ore_personali.aggiornato_il = datetime.utcnow()
            else:
                db.delete(ore_personali)
                r.ore_lavorate_id = None
    elif r.diario_id and r.ore_lavorate and r.ore_lavorate > 0:
        ore_personali = OreLavorate(
            utente_id=r.operativo_id, data=data_obj, ore=float(r.ore_lavorate),
            descrizione=r.riassunto or "Rapportino di cantiere", rapportino_id=r.id,
        )
        db.add(ore_personali); db.flush()
        r.ore_lavorate_id = ore_personali.id

    db.commit()
    return _rap_dict(r)


class SegmentoDividi(BaseModel):
    cantiere_id: int
    testo: Optional[str] = None
    ore: Optional[float] = None
    lavorazioni: Optional[List[str]] = []
    materiali: Optional[List[str]] = []
    riassunto: Optional[str] = None


@router.put("/{rapportino_id}/dividi")
def dividi_rapportino(
    rapportino_id: int,
    segmenti: List[SegmentoDividi],
    db: Session = Depends(get_db),
    user: Utente = Depends(get_current_user),
):
    """Admin: divide un rapportino multi-cantiere in un rapportino distinto per ciascun
    cantiere indicato — ognuno segue poi il normale flusso di validazione (diario + ore).
    Se il rapportino era già validato, elimina prima la nota diario e le ore registrate
    sotto il cantiere sbagliato (quello unico rilevato), per non contarle due volte."""
    if user.ruolo not in RUOLI_ADMIN:
        raise HTTPException(403)
    if not segmenti:
        raise HTTPException(400, "Indica almeno un cantiere")
    r = db.query(RapportinoOperativo).filter(RapportinoOperativo.id == rapportino_id).first()
    if not r: raise HTTPException(404)
    if r.stato == "diviso":
        raise HTTPException(400, "Rapportino già diviso")

    # Ripulisce diario/ore create in automatico dalla validazione precedente (se c'era) —
    # prima si azzerano i riferimenti sul rapportino (flush), poi si cancellano le righe,
    # per non violare i vincoli di chiave esterna
    vecchio_ore_extra_id = r.ore_extra_id
    vecchio_ore_lavorate_id = r.ore_lavorate_id
    vecchio_diario_id = r.diario_id
    r.ore_extra_id = None
    r.ore_lavorate_id = None
    r.diario_id = None
    db.flush()
    if vecchio_ore_extra_id:
        vecchie_ore = db.query(OreExtra).filter(OreExtra.id == vecchio_ore_extra_id).first()
        if vecchie_ore:
            db.delete(vecchie_ore)
    if vecchio_ore_lavorate_id:
        vecchie_ore_pers = db.query(OreLavorate).filter(OreLavorate.id == vecchio_ore_lavorate_id).first()
        if vecchie_ore_pers:
            db.delete(vecchie_ore_pers)
    if vecchio_diario_id:
        vecchio_diario = db.query(DiarioGiornaliero).filter(DiarioGiornaliero.id == vecchio_diario_id).first()
        if vecchio_diario:
            db.delete(vecchio_diario)
    db.flush()

    creati = []
    for i, seg in enumerate(segmenti):
        cantiere = db.query(Cantiere).filter(Cantiere.id == seg.cantiere_id).first()
        if not cantiere:
            raise HTTPException(404, f"Cantiere non trovato (segmento {i + 1})")

        # Testo specifico per questo cantiere: se l'admin l'ha scritto/incollato nel pannello
        # di divisione si usa quello, altrimenti il testo completo va solo sul primo segmento
        # (di default) e gli altri restano vuoti — così il rapportino NON viene duplicato
        # per intero su ogni cantiere, va effettivamente diviso
        testo_seg = (seg.testo or "").strip()
        if not testo_seg and i == 0:
            testo_seg = r.testo_italiano or ""

        nuovo = RapportinoOperativo(
            operativo_id      = r.operativo_id,
            cantiere_id       = cantiere.id,
            data_lavoro       = r.data_lavoro,
            testo_originale   = r.testo_originale,
            testo_elaborato   = testo_seg,
            testo_italiano    = testo_seg,
            lingua_originale  = r.lingua_originale,
            cantiere_rilevato = cantiere.nome,
            ore_lavorate      = seg.ore,
            lavorazioni       = seg.lavorazioni or [],
            materiali         = seg.materiali or [],
            criticita         = r.criticita if i == 0 else None,
            spese_extra       = r.spese_extra if i == 0 else [],
            extra_preventivo  = (r.extra_preventivo or False) if i == 0 else False,
            extra_preventivo_nota = r.extra_preventivo_nota if i == 0 else None,
            riassunto         = seg.riassunto or (testo_seg[:200] if testo_seg else r.riassunto),
            stato             = "inviato",
            fuori_cantiere    = False,
            foto_urls         = r.foto_urls or [],
        )
        db.add(nuovo)
        creati.append(nuovo)

    db.flush()
    r.stato = "diviso"
    r.note_admin = f"Diviso in {len(creati)} rapportini: " + ", ".join(f"#{n.id}" for n in creati)
    db.commit()
    return [_rap_dict(n) for n in creati]


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
