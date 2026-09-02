import os, re, tempfile, unicodedata, json as _json, logging
logger = logging.getLogger(__name__)
from datetime import datetime, date as date_today
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
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
    """Estensione per il file temporaneo: preferisce quella derivata dal content_type
    reale (impostato dal browser sul Blob registrato) quando riconosciuto — il filename
    lo etichetta a volte con un'estensione sbagliata (es. mobile che tagga sempre .webm
    anche col codec di fallback del browser), il che mandava in errore Whisper con
    'formato non supportato'. Il filename resta come fallback per content_type ignoti."""
    ct_suffix = _MIME_EXT_AUDIO.get((upload_file.content_type or "").split(";")[0].strip())
    if ct_suffix:
        return ct_suffix
    return os.path.splitext(upload_file.filename or "")[1] or ".webm"

RUOLI_OPERATIVO = {RuoloUtente.artigiano}
RUOLI_ADMIN     = {RuoloUtente.admin, RuoloUtente.capo_cantiere, RuoloUtente.amministrazione}

# ── Prompt estrazione da voce ──────────────────────────────────────────────────

PROMPT_ESTRAI = """Analizza questo rapportino di lavoro di un operaio edile.
Estrai le informazioni in formato JSON. Rispondi SOLO con il JSON.

{{
  "cantiere": "nome del cantiere menzionato, null se non specificato",
  "data_lavoro": "data YYYY-MM-DD se menzionata, null altrimenti",
  "ore": numero_ore_lavorate oppure null,
  "testo": "la porzione di racconto relativa SOLO a questo primo cantiere, riscritta in modo che si
    legga da sola senza il resto — se il rapportino parla di UN SOLO cantiere, qui va l'intero racconto",
  "descrizione_lavori": "descrizione chiara dei lavori principali svolti (in questo primo cantiere)",
  "lavorazioni": ["lista sintetica lavorazioni, max 5-6 parole ciascuna"],
  "materiali": ["lista materiali usati"],
  "descrizione_extra": "eventuali lavori extra o situazioni particolari, null se nessuna",
  "ore_extra": numero_ore_extra oppure null,
  "materiale_extra": "materiale extra usato non previsto, null se nessuno",
  "criticita": "problema emerso in una frase, null se nessuna criticità o non conformità",
  "spese_extra": [{{"descrizione": "cosa", "importo": numero_o_null}}],
  "colleghi": [{{"nome": "nome del collega citato come presente/al lavoro insieme",
                 "ore": numero_ore_o_null}}],
  "extra_preventivo": true_oppure_false,
  "extra_preventivo_nota": "breve nota su cosa è extra rispetto al preventivo, null se extra_preventivo è false",
  "riassunto": "frase di max 2 righe che riassume la giornata",
  "altri_cantieri": [
    {{"cantiere": "nome del secondo cantiere menzionato", "ore": numero_decimale_o_null,
      "testo": "porzione di racconto relativa SOLO a questo cantiere, riscritta in modo che si legga da sola",
      "lavorazioni": ["lavorazioni fatte in QUEL cantiere"], "riassunto": "frase breve su quel cantiere"}}
  ]
}}

Regole:
- Non inventare dati non presenti nel testo — se un cantiere non è chiaramente riconoscibile lascialo
  null piuttosto che indovinare
- "ore" è la DURATA del lavoro in ore, numero decimale (mezz'ora = 0.5, un quarto d'ora = 0.25).
  NON è un orario: "sono arrivato alle 8:30", "alle 17 ho staccato", "da mezzogiorno" sono ORARI,
  non durate. Metti un numero in "ore" SOLO se l'operaio dice quante ore ha lavorato, oppure dà
  sia l'ora di inizio sia quella di fine (allora calcola tu la durata). Se dà solo un orario o
  niente, lascia "ore" a null. Mai convertire "8:30" in 8.3 (semmai una durata di 8 ore e mezza è 8.5).
  Stessa regola per le "ore" dei colleghi e degli altri_cantieri.
- Se l'operaio nomina un collega presente/al lavoro insieme a lui (es. "io e Mesedin",
  "con Mario abbiamo fatto...", "eravamo in due, io e..."), inseriscilo in colleghi con il suo
  nome — se non specifica ore diverse per il collega, lascia ore a null (si userà lo stesso
  numero di ore del rapportino principale). Non confondere con menzioni generiche di altri
  operai non presenti quel giorno o riferiti ad altri cantieri
- Imposta extra_preventivo a true SOLO se l'operaio dice esplicitamente che il lavoro è extra,
  fuori preventivo, non concordato o da fatturare a parte (es. "questo è un lavoro extra",
  "non era nel preventivo", "da aggiungere al preventivo") — non dedurlo da solo, in caso di
  dubbio lascialo false. È un concetto diverso da descrizione_extra/materiale_extra (che sono
  note libere su lavori insoliti, non necessariamente fuori contratto)
- lavorazioni e materiali devono essere liste di stringhe brevi
- ATTENZIONE ai cantieri multipli: rileggi sempre il racconto cercando cambi di luogo — parole come
  "poi sono andato a/al/da", "dopo pranzo mi sono spostato", "nel pomeriggio ero a", "stamattina invece",
  "prima... poi...", o due nomi di cantiere diversi citati in punti diversi del racconto, sono il segnale
  che si tratta di PIÙ cantieri nella stessa giornata, non uno solo con più fasi di lavoro
- In quel caso: metti il primo cantiere nei campi principali (cantiere, ore, testo, descrizione_lavori,
  lavorazioni, riassunto = SOLO quella parte, non tutto il racconto) e OGNI cantiere successivo come
  voce separata in altri_cantieri, ciascuno con il proprio testo/ore/lavorazioni — il campo "testo" di
  ogni voce deve coprire, insieme agli altri, l'intero racconto originale senza perdere né duplicare frasi
- Esempio: "Stamattina ero al cantiere Rossi, ho fatto la posa del cartongesso per 4 ore. Poi nel
  pomeriggio sono passato dal cantiere Bianchi per la rasatura, altre 3 ore" → cantiere: "Rossi", ore: 4,
  testo: "Stamattina ho fatto la posa del cartongesso.", altri_cantieri: [{{"cantiere": "Bianchi", "ore": 3,
  "testo": "Nel pomeriggio ho fatto la rasatura."}}]
- Lascia altri_cantieri: [] se parla di un solo cantiere (caso normale, la maggioranza dei rapportini)

Rapportino:
{testo}

JSON:"""


def _estrai_dati(testo: str, cantieri_nomi: list) -> dict:
    vuoto = {"cantiere": None, "ore": None, "lavorazioni": [], "materiali": [],
             "criticita": None, "spese_extra": [], "riassunto": testo[:200],
             "data_lavoro": None, "descrizione_lavori": testo[:300], "testo": testo,
             "descrizione_extra": None, "ore_extra": None, "materiale_extra": None,
             "colleghi": [], "extra_preventivo": False, "extra_preventivo_nota": None, "altri_cantieri": []}
    if not settings.ANTHROPIC_API_KEY:
        return vuoto
    import anthropic
    claude = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)

    hint = ""
    if cantieri_nomi:
        hint = f"\nCantieri attivi: {', '.join(cantieri_nomi[:20])}\n"

    prompt = PROMPT_ESTRAI.format(testo=testo) + hint
    msg = claude.messages.create(
        model="claude-haiku-4-5-20251001", max_tokens=4096,
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
        return vuoto


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
        indirizzo_c = _normalizza_nome(getattr(c, "indirizzo", None))
        if indirizzo_c and (nome_norm in indirizzo_c or indirizzo_c in nome_norm):
            return c.id
    parole_rilevate = {p for p in nome_norm.split() if len(p) >= 4}
    if parole_rilevate:
        for c in cantieri:
            if parole_rilevate & set(_normalizza_nome(c.nome).split()):
                return c.id
    return None


_RUOLI_OPERATIVI_MATCH = ("operativo", "artigiano", "capo_cantiere", "capo_cantiere_sub")


def _cantieri_per_match(db: Session) -> list:
    """Cantieri candidati per l'abbinamento del nome (dettato nel rapportino). Esclude
    solo quelli chiusi/annullati. `stato` in produzione può essere enum nativo Postgres:
    il cast a testo evita 'invalid input value for enum' con valori non-label come 'attivo'."""
    from sqlalchemy import String as _Str
    return db.query(Cantiere).filter(
        Cantiere.stato.cast(_Str).notin_(["completato", "annullato"])
    ).all()


def _query_operatori(db: Session):
    """Utenti con ruolo operativo. `ruolo` in produzione è un enum nativo Postgres
    (senza il valore 'operativo'): il confronto diretto con una lista di stringhe
    solleva 'invalid input value for enum'. Il cast a testo lo evita."""
    from sqlalchemy import String as _Str
    return db.query(Utente).filter(Utente.ruolo.cast(_Str).in_(_RUOLI_OPERATIVI_MATCH))


def _candidati_operatori(db: Session, cantiere_id: Optional[int]) -> list:
    """Utenti candidati per l'abbinamento di un collega citato: prima il team del
    cantiere, poi tutti gli utenti con ruolo operativo."""
    cand, visti = [], set()
    if cantiere_id:
        c = db.query(Cantiere).filter(Cantiere.id == cantiere_id).first()
        for u in (c.artigiani if c else []):
            if u.id not in visti:
                visti.add(u.id); cand.append(u)
    for u in _query_operatori(db).all():
        if u.id not in visti:
            visti.add(u.id); cand.append(u)
    return cand


def _match_operatore(db: Session, nome: Optional[str], cantiere_id: Optional[int]) -> Optional[int]:
    """Abbina il nome di un collega citato nel rapportino a un utente reale (team
    cantiere o operatori). Match sul nome normalizzato: nome completo, solo nome,
    solo cognome, o token in comune. I candidati del team hanno la precedenza."""
    n = _normalizza_nome(nome)
    if not n:
        return None
    cand = _candidati_operatori(db, cantiere_id)
    n_tok = set(n.split())
    # 1° giro: match forte (nome completo / nome / cognome esatti)
    for u in cand:
        full = _normalizza_nome(f"{u.nome} {u.cognome}")
        if n == full or n == _normalizza_nome(u.nome) or n == _normalizza_nome(u.cognome):
            return u.id
    # 2° giro: il nome citato è contenuto nel nome completo (o viceversa)
    for u in cand:
        full = _normalizza_nome(f"{u.nome} {u.cognome}")
        if full and (n in full or full in n):
            return u.id
    # 3° giro: almeno un token significativo in comune
    for u in cand:
        toks = set(_normalizza_nome(f"{u.nome} {u.cognome}").split())
        if {t for t in (n_tok & toks) if len(t) >= 3}:
            return u.id
    return None


def _costo_orario(u: Optional[Utente]) -> float:
    if u and u.costo_orario and u.costo_orario > 0:
        return float(u.costo_orario)
    return float(getattr(settings, "COSTO_ORARIO_DEFAULT", 0) or 0)


def _sync_voce_extra_ore_safe(db: Session, ore) -> None:
    """Se la riga ore è extra preventivo, crea/aggiorna la voce nel computo."""
    try:
        from app.routers.economico import sync_voce_extra_ore
        sync_voce_extra_ore(db, ore)
    except Exception:
        pass


def _colleghi_risolti(db: Session, r: RapportinoOperativo) -> list:
    """Lista colleghi_ore arricchita con utente_id (memorizzato o abbinato al volo) e
    utente_nome, per la UI admin."""
    out = []
    for c in (r.colleghi_ore or []):
        nome = (c.get("nome") or "").strip()
        uid = c.get("utente_id") or _match_operatore(db, nome, r.cantiere_id)
        u = db.query(Utente).filter(Utente.id == uid).first() if uid else None
        out.append({
            "nome": nome,
            "ore": c.get("ore"),
            "utente_id": u.id if u else None,
            "utente_nome": f"{u.nome} {u.cognome}" if u else None,
        })
    return out


def _rap_dict(r: RapportinoOperativo, db: Optional[Session] = None) -> dict:
    colleghi = _colleghi_risolti(db, r) if db is not None else (r.colleghi_ore or [])
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
        "descrizione_lavori": r.descrizione_lavori,
        "foto_avanzamento_urls": r.foto_avanzamento_urls or [],
        "descrizione_extra": r.descrizione_extra,
        "foto_extra_urls": r.foto_extra_urls or [],
        "ore_extra": r.ore_extra,
        "materiale_extra": r.materiale_extra,
        "ore_lavorate": r.ore_lavorate,
        "colleghi_ore": colleghi,
        "extra_preventivo": r.extra_preventivo or False,
        "extra_preventivo_nota": r.extra_preventivo_nota,
        "lavorazioni": r.lavorazioni or [],
        "materiali": r.materiali or [],
        "materiali_spese": r.materiali_spese or [],
        "criticita": r.criticita,
        "spese_extra": r.spese_extra or [],
        "riassunto": r.riassunto,
        "stato": r.stato,
        "fuori_cantiere": r.fuori_cantiere,
        "multi_cantiere": r.multi_cantiere,
        "segmenti_cantieri": r.segmenti_cantieri or [],
        "validato_da": f"{r.validato_da.nome} {r.validato_da.cognome}" if r.validato_da else None,
        "validato_il": r.validato_il.isoformat() if r.validato_il else None,
        "note_admin": r.note_admin,
    }


async def _salva_foto_lista(files: list, prefisso: str) -> list:
    urls = []
    for f in files:
        if f and f.filename:
            try:
                import os as _os
                ext = _os.path.splitext(f.filename)[1].lower() or ".jpg"
                contenuto = await f.read()
                url, _ = salva_file(contenuto, prefisso, ext)
                if url:
                    urls.append(url)
            except Exception:
                logger.exception("[salva_foto] Errore su file=%s", getattr(f, 'filename', '?'))
                pass
    return urls


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
    cantieri_attivi = _cantieri_per_match(db)
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
      except Exception as e:
        logger.exception("[trascrivi] Errore Claude reordering — fallback a testo Whisper grezzo")
        testo_finale = testo_originale

    return {"testo": testo_finale, "lingua": lingua}


@router.post("/invia")
async def invia_rapportino(
    # Campi form strutturati
    cantiere_id: Optional[int] = Form(None),
    descrizione_lavori: Optional[str] = Form(None),
    descrizione_extra: Optional[str] = Form(None),
    ore_extra: Optional[float] = Form(None),
    materiale_extra: Optional[str] = Form(None),
    criticita: Optional[str] = Form(None),
    lingua_hint: Optional[str] = Form(None),
    # Audio (alternativo al form)
    audio: UploadFile = File(None),
    # Testo alternativo all'audio
    testo: str = Form(None),
    data_riferimento: Optional[str] = Form(None),
    # Foto
    foto_avanzamento: List[UploadFile] = File(default=[]),
    foto_extra: List[UploadFile] = File(default=[]),
    db: Session = Depends(get_db),
    user: Utente = Depends(get_current_user),
):
    """Operativo invia rapportino: form strutturato + foto, oppure audio → AI."""

    testo_originale = None
    testo_ita = None
    lingua = "it"
    dati_ai = {}

    if audio and audio.filename:
        # ── Modalità vocale: Whisper + Claude ────────────────────────────────
        if not settings.OPENAI_API_KEY:
            raise HTTPException(503, "OpenAI API key non configurata")
        suffix = _suffix_audio(audio)
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(await audio.read()); tmp_path = tmp.name
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
            logger.exception("[invia] Errore Whisper — utente=%s filename=%s", getattr(user, 'id', '?'), audio.filename)
            err_str = str(e).lower()
            if "quota" in err_str or "rate" in err_str or "429" in err_str:
                raise HTTPException(503, "Servizio di trascrizione momentaneamente sovraccarico — riprova tra qualche secondo")
            raise HTTPException(502, f"Errore trascrizione: {str(e)[:120]}")
        finally:
            try: os.unlink(tmp_path)
            except Exception: pass

        if not testo_originale:
            raise HTTPException(422, "Audio non udibile")

        if settings.ANTHROPIC_API_KEY and len(testo_originale.split()) >= 3:
            import anthropic
            claude = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
            LINGUE = {"it":"italiano","ro":"rumeno","en":"inglese","de":"tedesco",
                      "fr":"francese","pl":"polacco","uk":"ucraino"}
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
                    f"Traduci in italiano questo testo in {lingua_nome} di un operaio di cantiere.\n"
                    "Traduci fedelmente, parole semplici.\n\n"
                    f"Testo:\n{testo_elaborato}\n\nTraduzione:"
                )
                msg_b = claude.messages.create(
                    model="claude-sonnet-4-6", max_tokens=4096,
                    messages=[{"role":"user","content":TRADUCI}])
                testo_ita = msg_b.content[0].text.strip()
            else:
                testo_ita = testo_elaborato
        else:
            testo_ita = testo_originale

    elif testo:
        testo_originale = testo.strip()
        testo_ita = testo_originale

    # Estrai dati strutturati dal testo — sia che venga da audio che da testo diretto.
    # Prima questa chiamata girava solo dentro il ramo audio: i rapportini testuali
    # (la maggioranza nell'uso reale) non passavano mai dall'IA, quindi ore/cantiere/
    # criticità scritte nel testo restavano completamente ignorate
    if testo_ita:
        cantieri_attivi = _cantieri_per_match(db)
        cantieri_nomi = [c.nome for c in cantieri_attivi if c.nome]
        dati_ai = _estrai_dati(testo_ita, cantieri_nomi)

    # ── Salva foto ────────────────────────────────────────────────────────────
    foto_av_urls = await _salva_foto_lista(foto_avanzamento, "rapportini/avanzamento")
    foto_ex_urls = await _salva_foto_lista(foto_extra, "rapportini/extra")

    # ── Risolvi cantiere ──────────────────────────────────────────────────────
    multi_cantiere = False
    segmenti_cantieri = None
    if not cantiere_id and dati_ai.get("cantiere"):
        cantieri_attivi = _cantieri_per_match(db)
        cantiere_id = _match_cantiere(dati_ai.get("cantiere"), cantieri_attivi)

        # Rilevamento multi-cantiere: Claude segnala se il rapportino parla di più cantieri.
        # Se il nome non corrisponde a nessun cantiere attivo, cantiere_id resta null cosi'
        # l'admin lo vede segnalato e sceglie a mano in fase di divisione.
        altri = dati_ai.get("altri_cantieri") or []
        if altri:
            multi_cantiere = True
            segmenti_cantieri = [{
                "cantiere": dati_ai.get("cantiere"),
                "cantiere_id": cantiere_id,
                "ore": dati_ai.get("ore"),
                "testo": dati_ai.get("testo"),
                "lavorazioni": dati_ai.get("lavorazioni") or [],
                "riassunto": dati_ai.get("riassunto"),
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

    # ── Crea rapportino ───────────────────────────────────────────────────────
    rapportino = RapportinoOperativo(
        operativo_id      = user.id,
        cantiere_id       = cantiere_id,
        data_lavoro       = data_riferimento or dati_ai.get("data_lavoro") or str(date_today.today()),
        testo_originale   = testo_originale,
        testo_elaborato   = testo_ita,
        testo_italiano    = testo_ita,
        lingua_originale  = lingua,
        cantiere_rilevato = dati_ai.get("cantiere"),
        descrizione_lavori = descrizione_lavori or dati_ai.get("descrizione_lavori"),
        foto_avanzamento_urls = foto_av_urls,
        descrizione_extra = descrizione_extra or dati_ai.get("descrizione_extra"),
        foto_extra_urls   = foto_ex_urls,
        ore_extra         = ore_extra or dati_ai.get("ore_extra"),
        materiale_extra   = materiale_extra or dati_ai.get("materiale_extra"),
        ore_lavorate      = dati_ai.get("ore"),
        colleghi_ore      = dati_ai.get("colleghi") or [],
        extra_preventivo  = dati_ai.get("extra_preventivo") or False,
        extra_preventivo_nota = dati_ai.get("extra_preventivo_nota"),
        lavorazioni       = dati_ai.get("lavorazioni") or [],
        materiali         = dati_ai.get("materiali") or [],
        criticita         = criticita or dati_ai.get("criticita"),
        spese_extra       = dati_ai.get("spese_extra") or [],
        riassunto         = dati_ai.get("riassunto") or (testo_ita or "")[:200],
        stato             = "inviato",
        fuori_cantiere    = cantiere_id is None,
        multi_cantiere    = multi_cantiere,
        segmenti_cantieri = segmenti_cantieri,
    )
    db.add(rapportino); db.commit(); db.refresh(rapportino)

    # Notifica admin
    try:
        admins = db.query(Utente).filter(Utente.ruolo.in_(["admin","capo_cantiere"])).all()
        from app.routers.notifiche import invia_notifica
        for a in admins:
            invia_notifica(db, [a.id], "📋 Nuovo rapportino",
                           f"{user.nome} {user.cognome}: {rapportino.riassunto[:80]}", url="/rapportini")
    except Exception:
        pass

    return _rap_dict(rapportino, db)


@router.get("/miei")
def miei_rapportini(db: Session = Depends(get_db), user: Utente = Depends(get_current_user)):
    rs = db.query(RapportinoOperativo).filter(
        RapportinoOperativo.operativo_id == user.id
    ).order_by(RapportinoOperativo.creato_il.desc()).limit(50).all()
    return [_rap_dict(r, db) for r in rs]


@router.get("/da-validare")
def da_validare(db: Session = Depends(get_db), user: Utente = Depends(get_current_user)):
    if user.ruolo not in RUOLI_ADMIN:
        raise HTTPException(403)
    rs = db.query(RapportinoOperativo).filter(
        RapportinoOperativo.stato == "inviato"
    ).order_by(RapportinoOperativo.creato_il.desc()).all()
    return [_rap_dict(r, db) for r in rs]


@router.get("/operatori")
def lista_operatori(db: Session = Depends(get_db), user: Utente = Depends(get_current_user)):
    """Elenco utenti con ruolo operativo — per abbinare a mano i colleghi citati nei rapportini."""
    if user.ruolo not in RUOLI_ADMIN:
        raise HTTPException(403)
    us = _query_operatori(db).filter(Utente.attivo == True).order_by(Utente.cognome, Utente.nome).all()
    return [{"id": u.id, "nome": f"{u.nome} {u.cognome}", "ruolo": str(u.ruolo)} for u in us]


@router.get("/fuori-cantiere")
def fuori_cantiere(db: Session = Depends(get_db), user: Utente = Depends(get_current_user)):
    if user.ruolo not in RUOLI_ADMIN:
        raise HTTPException(403)
    rs = db.query(RapportinoOperativo).filter(
        RapportinoOperativo.fuori_cantiere == True,
        RapportinoOperativo.stato.in_(["inviato", "validato"]),
    ).order_by(RapportinoOperativo.creato_il.desc()).all()
    return [_rap_dict(r, db) for r in rs]


def _sostituisci_colleghi_ore(db: Session, r: RapportinoOperativo, cantiere_id: int, data_obj) -> None:
    """Ricrea le righe OreExtra dei colleghi citati nel rapportino (persone che hanno
    lavorato insieme all'operativo ma non hanno inviato un proprio rapportino) — cancella
    quelle vecchie legate a questo diario e le rifà dalla lista aggiornata, così una
    modifica o un rianalizza non lasciano righe duplicate o obsolete. La riga
    dell'operativo stesso (r.ore_extra_id) non viene toccata.

    Se il collega è abbinabile a un operatore reale (utente_id già memorizzato o match
    sul nome), la sua riga ore viene collegata all'utente, valorizzata col suo costo
    orario e riportata anche nel suo registro ore personale (OreLavorate)."""
    from sqlalchemy.orm.attributes import flag_modified
    if not r.diario_id:
        return
    # Righe ore dei colleghi da rifare: quelle di questo diario che NON sono la riga
    # dell'operativo e che non sono referenziate come riga principale di un rapportino
    # (evita ForeignKeyViolation su rapportini_operativi.ore_extra_id)
    ref_ids = {rid for (rid,) in db.query(RapportinoOperativo.ore_extra_id)
               .filter(RapportinoOperativo.ore_extra_id.isnot(None)).all()}
    ref_ids.add(r.ore_extra_id or 0)
    vecchie = db.query(OreExtra).filter(
        OreExtra.diario_id == r.diario_id,
        OreExtra.id.notin_(ref_ids),
    ).all()
    for oe in vecchie:
        if oe.voce_extra_id:            # togli la voce dal computo prima di cancellare la riga
            oe.extra_preventivo = False
            db.flush()
            _sync_voce_extra_ore_safe(db, oe)
        db.delete(oe)
    # Le righe registro-ore-personale dei colleghi legate a questo rapportino
    # (quella dell'operativo, r.ore_lavorate_id, resta)
    db.query(OreLavorate).filter(
        OreLavorate.rapportino_id == r.id,
        OreLavorate.id != (r.ore_lavorate_id or 0),
    ).delete(synchronize_session=False)
    db.flush()

    colleghi_norm = []
    for c in (r.colleghi_ore or []):
        nome = (c.get("nome") or "").strip()
        if not nome:
            continue
        ore_raw = c.get("ore")
        ore = float(ore_raw) if ore_raw else float(r.ore_lavorate or 0)
        if ore <= 0:
            continue
        uid = c.get("utente_id") or _match_operatore(db, nome, cantiere_id)
        u = db.query(Utente).filter(Utente.id == uid).first() if uid else None
        tariffa = _costo_orario(u) if u else 0.0
        c_extra = bool(c.get("extra_preventivo", r.extra_preventivo))
        riga = OreExtra(
            cantiere_id=cantiere_id, diario_id=r.diario_id, operaio_nome=nome,
            utente_id=(u.id if u else None),
            ore=ore, attivita=r.riassunto or "",
            tariffa_oraria=tariffa, totale=round(ore * tariffa, 2),
            data=data_obj, approvato=False, creato_da=r.operativo_id,
            extra_preventivo=c_extra,
            extra_preventivo_nota=(r.extra_preventivo_nota if c_extra else None),
        )
        db.add(riga); db.flush()
        _sync_voce_extra_ore_safe(db, riga)
        # La riga entra sempre nel registro Ore lavorate: se il collega ha un account
        # è collegato a lui, altrimenti (operatore esterno occasionale, "socio") resta
        # come nome libero in operatore_nome — l'importante è che lasci traccia.
        db.add(OreLavorate(
            utente_id=(u.id if u else None),
            operatore_nome=(None if u else nome),
            data=data_obj, ore=ore,
            descrizione=(r.riassunto or "Rapportino di cantiere") + f" — citato da {r.operativo.nome if r.operativo else 'collega'}",
            rapportino_id=r.id,
        ))
        colleghi_norm.append({"nome": nome, "ore": ore_raw, "utente_id": (u.id if u else None), "extra_preventivo": c_extra})

    # Memorizza gli abbinamenti risolti così restano stabili tra una modifica e l'altra
    r.colleghi_ore = colleghi_norm
    flag_modified(r, "colleghi_ore")
    db.flush()


def _registro_ore_fuori_cantiere(db: Session, r: RapportinoOperativo, data_obj) -> None:
    """Registra le ore di un rapportino SENZA cantiere (corsi, ferie, trasferte, lavori
    fuori commessa) nel registro personale Ore lavorate. Non tocca costi cantiere/diario
    (non esistono): serve solo a non perdere le ore. Operativo + eventuali colleghi citati,
    esterni compresi (operatore_nome)."""
    from sqlalchemy.orm.attributes import flag_modified
    # Riga dell'operativo
    if r.ore_lavorate and r.ore_lavorate > 0:
        row = db.query(OreLavorate).filter(OreLavorate.id == r.ore_lavorate_id).first() if r.ore_lavorate_id else None
        if row:
            row.ore = float(r.ore_lavorate)
            row.aggiornato_il = datetime.utcnow()
        else:
            row = OreLavorate(utente_id=r.operativo_id, data=data_obj, ore=float(r.ore_lavorate),
                              descrizione=r.riassunto or "Rapportino (fuori cantiere)", rapportino_id=r.id)
            db.add(row); db.flush()
            r.ore_lavorate_id = row.id
    elif r.ore_lavorate_id:
        vecchia = db.query(OreLavorate).filter(OreLavorate.id == r.ore_lavorate_id).first()
        r.ore_lavorate_id = None
        db.flush()
        if vecchia:
            db.delete(vecchia)

    # Righe dei colleghi citati (rifatte da zero a ogni passaggio)
    db.query(OreLavorate).filter(
        OreLavorate.rapportino_id == r.id,
        OreLavorate.id != (r.ore_lavorate_id or 0),
    ).delete(synchronize_session=False)
    db.flush()

    norm = []
    for c in (r.colleghi_ore or []):
        nome = (c.get("nome") or "").strip()
        if not nome:
            continue
        ore_raw = c.get("ore")
        ore = float(ore_raw) if ore_raw else float(r.ore_lavorate or 0)
        if ore <= 0:
            continue
        uid = c.get("utente_id") or _match_operatore(db, nome, None)
        u = db.query(Utente).filter(Utente.id == uid).first() if uid else None
        db.add(OreLavorate(
            utente_id=(u.id if u else None),
            operatore_nome=(None if u else nome),
            data=data_obj, ore=ore,
            descrizione=(r.riassunto or "Rapportino (fuori cantiere)") + f" — citato da {r.operativo.nome if r.operativo else 'collega'}",
            rapportino_id=r.id,
        ))
        norm.append({"nome": nome, "ore": ore_raw, "utente_id": (u.id if u else None)})
    r.colleghi_ore = norm
    flag_modified(r, "colleghi_ore")
    db.flush()


class ValidaBody(BaseModel):
    cantiere_id: Optional[int] = None
    note_admin: Optional[str] = None
    rifiuta: bool = False


def _costruisci_testo_diario(r: RapportinoOperativo) -> str:
    """Testo della nota diario a partire dal rapportino — usa sempre descrizione_lavori
    (la versione corretta a mano dall'admin, se c'è) e non la dettatura grezza. Prima le
    lavorazioni elencate non finivano da nessuna parte nel testo/PDF: ora ci sono."""
    testo = r.descrizione_lavori or r.testo_italiano or r.riassunto or ""
    if r.lavorazioni:
        testo += "\n\nLavorazioni: " + ", ".join(r.lavorazioni)
    if r.materiale_extra:
        testo += f"\n\nMateriale extra: {r.materiale_extra}"
    if r.materiali:
        testo += f"\n\nMateriali usati: {', '.join(r.materiali)}"
    if r.criticita:
        testo += f"\n\n⚠️ Criticità/NC: {r.criticita}"
    if r.descrizione_extra:
        testo += f"\n\nExtra: {r.descrizione_extra}"
    return testo


def _crea_diario_da_rapportino(db: Session, r: RapportinoOperativo, cantiere_id: int) -> None:
    """Crea la nota diario nel cantiere a partire dal rapportino e la collega."""
    data_str = r.data_lavoro or str(date_today.today())
    try:
        data_obj = date_today.fromisoformat(data_str)
    except Exception:
        data_obj = date_today.today()

    testo_diario = _costruisci_testo_diario(r)

    # unisci tutte le foto
    tutte_foto = list(r.foto_avanzamento_urls or []) + list(r.foto_extra_urls or [])

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
    for c in (r.colleghi_ore or []):
        nome_collega = (c.get("nome") or "").strip()
        ore_collega = c.get("ore")
        ore_collega = float(ore_collega) if ore_collega else float(r.ore_lavorate or 0)
        if nome_collega and ore_collega > 0:
            voci.append({
                "tipo": "ore_extra",
                "operaio": nome_collega,
                "ore": ore_collega,
                "attivita": r.riassunto or "",
                "approvato": True,
            })

    diario = DiarioGiornaliero(
        cantiere_id       = cantiere_id,
        data              = data_obj,
        autore_id         = r.operativo_id,
        attivita          = testo_diario,
        fonte             = "voce",
        testo_originale   = r.testo_originale,
        lingua_originale  = r.lingua_originale,
        stato_validazione = "pubblicata",
        foto_urls         = tutte_foto,
        voci_estratte     = voci,
        extra_preventivo  = r.extra_preventivo or False,
        extra_preventivo_nota = r.extra_preventivo_nota,
    )
    db.add(diario); db.flush()
    r.diario_id = diario.id

    # Le foto del rapportino entrano anche nell'archivio foto del cantiere (Tab Foto)
    if tutte_foto:
        try:
            from app.routers.diari import _sync_foto_archivio
            _sync_foto_archivio(db, cantiere_id, tutte_foto, autore_id=r.operativo_id, nota="Da rapportino")
        except Exception:
            pass

    # Calcolo automatico ore lavorate → registrazione diretta nella sezione ore del cantiere,
    # valorizzata col costo orario dell'operativo (entra nei costi del cantiere)
    if r.ore_lavorate and r.ore_lavorate > 0:
        tariffa_op = _costo_orario(r.operativo)
        ore_val = float(r.ore_lavorate)
        ore_extra_row = OreExtra(
            cantiere_id    = cantiere_id,
            diario_id      = diario.id,
            operaio_nome   = nome_op or "Operativo",
            utente_id      = r.operativo_id,
            ore            = ore_val,
            attivita       = r.riassunto or "",
            tariffa_oraria = tariffa_op,
            totale         = round(ore_val * tariffa_op, 2),
            data           = data_obj,
            approvato      = False,
            extra_preventivo = bool(r.extra_preventivo),
            extra_preventivo_nota = r.extra_preventivo_nota if r.extra_preventivo else None,
            creato_da      = r.operativo_id,
        )
        db.add(ore_extra_row); db.flush()
        r.ore_extra_id = ore_extra_row.id
        _sync_voce_extra_ore_safe(db, ore_extra_row)

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

    # Colleghi citati come presenti/al lavoro insieme (senza un proprio rapportino) —
    # anche le loro ore vanno registrate, non solo quelle di chi ha inviato il rapportino
    if r.colleghi_ore:
        _sostituisci_colleghi_ore(db, r, cantiere_id, data_obj)


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
            ore_extra_row = db.query(OreExtra).filter(OreExtra.id == r.ore_extra_id).first()
            if ore_extra_row:
                ore_extra_row.cantiere_id = cantiere.id
        # ...comprese quelle dei colleghi, legate allo stesso diario
        if r.diario_id:
            db.query(OreExtra).filter(
                OreExtra.diario_id == r.diario_id,
                OreExtra.id != (r.ore_extra_id or 0),
            ).update({"cantiere_id": cantiere.id}, synchronize_session=False)
    elif r.stato == "validato":
        # Rapportino validato senza diario (era fuori cantiere): le ore erano già a
        # registro come "senza cantiere" — ripuliscile, le rifà _crea_diario col cantiere
        db.query(OreLavorate).filter(OreLavorate.rapportino_id == r.id).delete(synchronize_session=False)
        r.ore_lavorate_id = None
        db.flush()
        _crea_diario_da_rapportino(db, r, cantiere.id)

    db.commit()
    return _rap_dict(r, db)


class CollegaOre(BaseModel):
    nome: str
    ore: Optional[float] = None
    utente_id: Optional[int] = None


class ModificaBody(BaseModel):
    testo_italiano: Optional[str] = None
    descrizione_lavori: Optional[str] = None
    descrizione_extra: Optional[str] = None
    riassunto: Optional[str] = None
    ore_lavorate: Optional[float] = None
    ore_extra: Optional[float] = None
    materiale_extra: Optional[str] = None
    lavorazioni: Optional[List[str]] = None
    materiali: Optional[List[str]] = None
    criticita: Optional[str] = None
    colleghi_ore: Optional[List[CollegaOre]] = None
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
    for campo in ("testo_italiano", "descrizione_lavori", "descrizione_extra", "riassunto",
                  "ore_lavorate", "ore_extra", "materiale_extra", "lavorazioni", "materiali", "criticita",
                  "colleghi_ore", "extra_preventivo", "extra_preventivo_nota"):
        if campo in dati:
            setattr(r, campo, dati[campo])

    # Tiene allineata la nota diario già pubblicata, se esiste
    if r.diario_id:
        diario = db.query(DiarioGiornaliero).filter(DiarioGiornaliero.id == r.diario_id).first()
        if diario:
            diario.attivita = _costruisci_testo_diario(r)
            diario.extra_preventivo = r.extra_preventivo or False
            diario.extra_preventivo_nota = r.extra_preventivo_nota

    # Se le ore sono cambiate e c'era già una registrazione automatica, aggiornala
    if "ore_lavorate" in dati and r.ore_extra_id:
        ore_extra_row = db.query(OreExtra).filter(OreExtra.id == r.ore_extra_id).first()
        if ore_extra_row:
            if r.ore_lavorate and r.ore_lavorate > 0:
                tariffa = ore_extra_row.tariffa_oraria or _costo_orario(r.operativo)
                ore_extra_row.ore = float(r.ore_lavorate)
                ore_extra_row.tariffa_oraria = tariffa
                ore_extra_row.utente_id = ore_extra_row.utente_id or r.operativo_id
                ore_extra_row.totale = round(ore_extra_row.ore * tariffa, 2)
            else:
                r.ore_extra_id = None
                db.flush()   # scrivi il NULL prima di cancellare la riga referenziata (FK)
                db.delete(ore_extra_row)

    if "ore_lavorate" in dati and r.ore_lavorate_id:
        ore_personali = db.query(OreLavorate).filter(OreLavorate.id == r.ore_lavorate_id).first()
        if ore_personali:
            if r.ore_lavorate and r.ore_lavorate > 0:
                ore_personali.ore = float(r.ore_lavorate)
                ore_personali.aggiornato_il = datetime.utcnow()
            else:
                r.ore_lavorate_id = None
                db.flush()
                db.delete(ore_personali)

    # Colleghi citati come presenti/al lavoro insieme — ricrea le loro righe ore se la
    # lista o le ore di riferimento sono cambiate (i colleghi senza ore proprie ereditano
    # le ore_lavorate del rapportino)
    _tocca_ore = ("colleghi_ore" in dati or "ore_lavorate" in dati or "riassunto" in dati)
    if _tocca_ore and r.diario_id and r.cantiere_id and r.colleghi_ore:
        try:
            data_obj = date_today.fromisoformat(r.data_lavoro) if r.data_lavoro else date_today.today()
        except Exception:
            data_obj = date_today.today()
        _sostituisci_colleghi_ore(db, r, r.cantiere_id, data_obj)
    elif _tocca_ore and r.stato == "validato" and not r.cantiere_id:
        try:
            data_obj = date_today.fromisoformat(r.data_lavoro) if r.data_lavoro else date_today.today()
        except Exception:
            data_obj = date_today.today()
        _registro_ore_fuori_cantiere(db, r, data_obj)

    db.commit()
    return _rap_dict(r, db)


class MaterialeSpesaBody(BaseModel):
    materiale: str
    importo: float
    fornitore: Optional[str] = None
    data: Optional[str] = None   # YYYY-MM-DD; default = data_lavoro del rapportino


@router.post("/{rapportino_id}/materiale-spesa")
def materiale_in_spesa(
    rapportino_id: int,
    body: MaterialeSpesaBody,
    db: Session = Depends(get_db),
    user: Utente = Depends(get_current_user),
):
    """Admin: registra un materiale del rapportino come Spesa del cantiere collegato.
    Tiene traccia in materiali_spese così il materiale non viene ri-contabilizzato."""
    if user.ruolo not in RUOLI_ADMIN:
        raise HTTPException(403)
    r = db.query(RapportinoOperativo).filter(RapportinoOperativo.id == rapportino_id).first()
    if not r:
        raise HTTPException(404)
    if not r.cantiere_id:
        raise HTTPException(400, "Assegna prima il rapportino a un cantiere")

    materiale = (body.materiale or "").strip()
    if not materiale:
        raise HTTPException(422, "Materiale mancante")
    if body.importo is None or body.importo < 0:
        raise HTTPException(422, "Importo non valido")

    from app.models.economico import Spesa
    from sqlalchemy.orm.attributes import flag_modified

    data_spesa = None
    for src in (body.data, r.data_lavoro):
        if src:
            try:
                data_spesa = date_today.fromisoformat(src)
                break
            except Exception:
                pass

    autore = f"{r.operativo.nome} {r.operativo.cognome}".strip() if r.operativo else "operativo"
    nota = f"Da rapportino #{r.id} di {autore}"
    if r.data_lavoro:
        nota += f" del {r.data_lavoro}"

    s = Spesa(
        cantiere_id=r.cantiere_id,
        descrizione=materiale,
        fornitore=((body.fornitore or "").strip() or None),
        categoria="materiali",
        importo=float(body.importo),
        data=data_spesa,
        note=nota,
        creato_da=user.id,
    )
    db.add(s)
    db.flush()

    riga = {"materiale": materiale, "spesa_id": s.id, "importo": float(body.importo)}
    r.materiali_spese = list(r.materiali_spese or []) + [riga]
    flag_modified(r, "materiali_spese")
    db.commit()
    db.refresh(r)

    try:
        notifica_cantiere(db, r.cantiere_id,
            ruoli=["admin", "direzione_lavori"],
            titolo="🧾 Spesa da rapportino",
            corpo=f"{materiale} — €{float(body.importo):.2f} (rapportino #{r.id})",
            escludi_id=user.id,
            url=f"/cantieri/{r.cantiere_id}#economia",
        )
    except Exception:
        pass

    return _rap_dict(r, db)


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
    # testo_italiano (il racconto completo originale) prima di descrizione_lavori: quest'ultimo
    # può essere un riassunto breve — scritto a mano dall'operativo nel form strutturato, o
    # generato da una ri-analisi precedente — e usarlo come sorgente principale fa perdere
    # dettagli (ore, nome cantiere) ad ogni ri-analisi successiva invece di ripartire sempre
    # dal racconto più ricco, che questa funzione non modifica mai
    testo_base = r.testo_italiano or r.descrizione_lavori
    if not testo_base:
        raise HTTPException(400, "Nessun testo da rianalizzare")
    if r.stato == "diviso":
        raise HTTPException(400, "Rapportino già diviso")

    cantieri_attivi = _cantieri_per_match(db)
    cantieri_nomi = [c.nome for c in cantieri_attivi if c.nome]
    dati = _estrai_dati(testo_base, cantieri_nomi)

    r.cantiere_rilevato = dati.get("cantiere")
    # Non-distruttivo: se la ri-analisi non trova ore o colleghi non cancellare quelli
    # già registrati (spesso il testo ri-analizzato è un riassunto più povero dell'originale)
    if dati.get("ore"):
        r.ore_lavorate = dati.get("ore")
    r.lavorazioni = dati.get("lavorazioni") or []
    r.materiali = dati.get("materiali") or []
    r.criticita = dati.get("criticita")
    r.spese_extra = dati.get("spese_extra") or []
    if dati.get("colleghi"):
        r.colleghi_ore = dati.get("colleghi")
    r.extra_preventivo = dati.get("extra_preventivo") or False
    r.extra_preventivo_nota = dati.get("extra_preventivo_nota")
    r.riassunto = dati.get("riassunto") or r.riassunto
    if dati.get("descrizione_lavori"):
        r.descrizione_lavori = dati.get("descrizione_lavori")

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

    # Aggiorna la riga ore dell'operativo SOLO se ci sono ore valide — non cancellarla
    # se la ri-analisi non le ha trovate
    if r.ore_lavorate and r.ore_lavorate > 0:
        ore_extra_row = db.query(OreExtra).filter(OreExtra.id == r.ore_extra_id).first() if r.ore_extra_id else None
        tariffa = (ore_extra_row.tariffa_oraria if ore_extra_row and ore_extra_row.tariffa_oraria else _costo_orario(r.operativo))
        if ore_extra_row:
            ore_extra_row.ore = float(r.ore_lavorate)
            ore_extra_row.tariffa_oraria = tariffa
            ore_extra_row.utente_id = ore_extra_row.utente_id or r.operativo_id
            ore_extra_row.totale = round(ore_extra_row.ore * tariffa, 2)
        elif r.diario_id and r.cantiere_id:
            ore_extra_row = OreExtra(
                cantiere_id=r.cantiere_id, diario_id=r.diario_id, operaio_nome=nome_op,
                utente_id=r.operativo_id,
                ore=float(r.ore_lavorate), attivita=r.riassunto or "", tariffa_oraria=tariffa,
                totale=round(float(r.ore_lavorate) * tariffa, 2), data=data_obj,
                approvato=False, creato_da=r.operativo_id,
            )
            db.add(ore_extra_row); db.flush()
            r.ore_extra_id = ore_extra_row.id

        ore_personali = db.query(OreLavorate).filter(OreLavorate.id == r.ore_lavorate_id).first() if r.ore_lavorate_id else None
        if ore_personali:
            ore_personali.ore = float(r.ore_lavorate)
            ore_personali.aggiornato_il = datetime.utcnow()
        elif r.stato == "validato":
            # anche i rapportini senza cantiere (fuori commessa) lasciano traccia nel registro
            ore_personali = OreLavorate(
                utente_id=r.operativo_id, data=data_obj, ore=float(r.ore_lavorate),
                descrizione=r.riassunto or "Rapportino di cantiere", rapportino_id=r.id,
            )
            db.add(ore_personali); db.flush()
            r.ore_lavorate_id = ore_personali.id

    if r.diario_id and r.cantiere_id:
        _sostituisci_colleghi_ore(db, r, r.cantiere_id, data_obj)
    elif r.stato == "validato" and not r.cantiere_id:
        _registro_ore_fuori_cantiere(db, r, data_obj)

    db.commit()
    return _rap_dict(r, db)


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
    # tutte le righe registro-ore di questo rapportino (operativo + colleghi, anche
    # quelle create quando era "fuori cantiere") — i figli le rifaranno alla validazione
    db.query(OreLavorate).filter(OreLavorate.rapportino_id == r.id).delete(synchronize_session=False)
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
            testo_seg = r.descrizione_lavori or r.testo_italiano or ""

        nuovo = RapportinoOperativo(
            operativo_id       = r.operativo_id,
            cantiere_id        = cantiere.id,
            data_lavoro        = r.data_lavoro,
            testo_originale    = r.testo_originale,
            testo_elaborato    = testo_seg,
            testo_italiano     = testo_seg,
            lingua_originale   = r.lingua_originale,
            cantiere_rilevato  = cantiere.nome,
            descrizione_lavori = testo_seg,
            foto_avanzamento_urls = r.foto_avanzamento_urls or [],
            descrizione_extra  = r.descrizione_extra if i == 0 else None,
            foto_extra_urls    = r.foto_extra_urls or [] if i == 0 else [],
            ore_extra          = r.ore_extra if i == 0 else None,
            materiale_extra    = r.materiale_extra if i == 0 else None,
            ore_lavorate       = seg.ore,
            lavorazioni        = seg.lavorazioni or [],
            materiali          = seg.materiali or [],
            criticita          = r.criticita if i == 0 else None,
            spese_extra        = r.spese_extra if i == 0 else [],
            riassunto          = seg.riassunto or (testo_seg[:200] if testo_seg else r.riassunto),
            stato              = "inviato",
            fuori_cantiere     = False,
        )
        db.add(nuovo)
        creati.append(nuovo)

    db.flush()
    r.stato = "diviso"
    r.note_admin = f"Diviso in {len(creati)} rapportini: " + ", ".join(f"#{n.id}" for n in creati)
    db.commit()
    return [_rap_dict(n, db) for n in creati]


@router.put("/{rapportino_id}/valida")
def valida_rapportino(
    rapportino_id: int,
    body: ValidaBody,
    db: Session = Depends(get_db),
    user: Utente = Depends(get_current_user),
):
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
        return _rap_dict(r, db)

    cantiere_id = body.cantiere_id or r.cantiere_id
    r.cantiere_id = cantiere_id
    r.fuori_cantiere = cantiere_id is None

    if cantiere_id:
        _crea_diario_da_rapportino(db, r, cantiere_id)
    else:
        # Nessun cantiere: le ore vanno comunque nel registro personale
        try:
            data_obj = date_today.fromisoformat(r.data_lavoro) if r.data_lavoro else date_today.today()
        except Exception:
            data_obj = date_today.today()
        _registro_ore_fuori_cantiere(db, r, data_obj)

    r.stato = "validato"
    r.note_admin = body.note_admin
    r.validato_da_id = user.id
    r.validato_il = datetime.utcnow()
    db.commit()

    try:
        from app.routers.notifiche import invia_notifica
        msg = "✅ Rapportino validato"
        invia_notifica(db, [r.operativo_id], msg, body.note_admin or "")
    except Exception:
        pass

    return _rap_dict(r, db)


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
    if user.ruolo in RUOLI_ADMIN:
        rs = db.query(RapportinoOperativo).order_by(
            RapportinoOperativo.creato_il.desc()).limit(100).all()
    else:
        rs = db.query(RapportinoOperativo).filter(
            RapportinoOperativo.operativo_id == user.id
        ).order_by(RapportinoOperativo.creato_il.desc()).limit(50).all()
    return [_rap_dict(r, db) for r in rs]
