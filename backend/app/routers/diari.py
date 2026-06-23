import os, tempfile
from datetime import date as date_today
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from typing import List
from app.database import get_db
from app.models.diario import DiarioGiornaliero, OreExtra
from app.models.cantiere import Cantiere
from app.models.utente import Utente
from app.schemas.diario import DiarioCreate, DiarioOut, DiarioUpdate, OreExtraOut, OreExtraCreate, OreExtraUpdate

foto_router = APIRouter(prefix="/cantieri", tags=["Foto Cantiere"])
from app.auth import get_current_user
from app.config import settings
from app.storage import salva_file
from app.routers.notifiche import notifica_cantiere

router = APIRouter(prefix="/cantieri/{cantiere_id}/diari", tags=["Diario Giornaliero"])


def _diario_out(d: DiarioGiornaliero) -> dict:
    """Aggiunge autore_nome al dict del diario."""
    nome = None
    if d.autore:
        nome = f"{d.autore.nome} {d.autore.cognome}".strip() or d.autore.email
    out = DiarioOut.model_validate(d).model_dump()
    out["autore_nome"] = nome
    return out


_RUOLI_BOZZA = {"artigiano", "fornitore"}
_RUOLI_VALIDA = {"admin", "capo_cantiere", "amministrazione"}


@router.get("", response_model=List[DiarioOut])
def lista_diari(cantiere_id: int, db: Session = Depends(get_db), user: Utente = Depends(get_current_user)):
    if user.ruolo.value == "cliente":
        raise HTTPException(status_code=403, detail="Accesso non consentito")
    q = db.query(DiarioGiornaliero).filter(DiarioGiornaliero.cantiere_id == cantiere_id)
    # Artigiani/fornitori vedono solo le proprie bozze + quelle pubblicate
    if user.ruolo.value in _RUOLI_BOZZA:
        from sqlalchemy import or_
        q = q.filter(or_(
            DiarioGiornaliero.autore_id == user.id,
            DiarioGiornaliero.stato_validazione == "pubblicata",
        ))
    diari = q.order_by(DiarioGiornaliero.data.desc(), DiarioGiornaliero.creato_il.desc()).all()
    return [_diario_out(d) for d in diari]


@router.post("", response_model=DiarioOut, status_code=201)
def crea_diario(cantiere_id: int, data: DiarioCreate, db: Session = Depends(get_db), user: Utente = Depends(get_current_user)):
    stato = "bozza" if user.ruolo.value in _RUOLI_BOZZA else "pubblicata"
    diario = DiarioGiornaliero(**data.model_dump(exclude={"cantiere_id"}), autore_id=user.id, cantiere_id=cantiere_id, stato_validazione=stato)
    db.add(diario)
    db.commit()
    db.refresh(diario)
    try:
        if getattr(data, 'extra_preventivo', False):
            notifica_cantiere(db, cantiere_id,
                ruoli=["admin", "capo_cantiere", "capo_cantiere_sub", "direzione_lavori", "amministrazione"],
                titolo="⚠️ Extra preventivo nel diario",
                corpo=f"{user.nome} {user.cognome}: {(data.extra_preventivo_nota or data.attivita or '')[:80]}",
                escludi_id=user.id,
                tipo="extra_preventivo",
                url=f"/cantieri/{cantiere_id}#diario",
            )
        else:
            notifica_cantiere(db, cantiere_id,
                ruoli=["admin", "capo_cantiere", "capo_cantiere_sub", "direzione_lavori"],
                titolo="📋 Nuova nota diario",
                corpo=f"{user.nome} {user.cognome}: {(data.attivita or '')[:80]}",
                escludi_id=user.id,
                url=f"/cantieri/{cantiere_id}#diario",
            )
    except Exception: pass
    return _diario_out(diario)


@router.put("/{diario_id}", response_model=DiarioOut)
def aggiorna_diario(cantiere_id: int, diario_id: int, data: DiarioUpdate, db: Session = Depends(get_db), user: Utente = Depends(get_current_user)):
    diario = db.query(DiarioGiornaliero).filter(DiarioGiornaliero.id == diario_id, DiarioGiornaliero.cantiere_id == cantiere_id).first()
    if not diario:
        raise HTTPException(status_code=404, detail="Diario non trovato")
    for k, v in data.model_dump(exclude_none=True).items():
        setattr(diario, k, v)
    db.commit()
    db.refresh(diario)
    return _diario_out(diario)


@router.delete("/{diario_id}", status_code=204)
def elimina_diario(cantiere_id: int, diario_id: int, db: Session = Depends(get_db), user: Utente = Depends(get_current_user)):
    diario = db.query(DiarioGiornaliero).filter(DiarioGiornaliero.id == diario_id, DiarioGiornaliero.cantiere_id == cantiere_id).first()
    if not diario:
        raise HTTPException(status_code=404, detail="Diario non trovato")
    if user.ruolo not in ("admin", "capo_cantiere", "capo_cantiere_sub", "direzione_lavori") and diario.autore_id != user.id:
        raise HTTPException(status_code=403, detail="Non autorizzato")
    db.delete(diario)
    db.commit()


@router.put("/{diario_id}/valida", response_model=DiarioOut)
def valida_diario(cantiere_id: int, diario_id: int, db: Session = Depends(get_db), user: Utente = Depends(get_current_user)):
    """Capocantiere/admin valida una bozza artigiano → pubblicata."""
    if user.ruolo.value not in _RUOLI_VALIDA:
        raise HTTPException(403, "Solo capocantiere o admin può validare")
    diario = db.query(DiarioGiornaliero).filter(DiarioGiornaliero.id == diario_id, DiarioGiornaliero.cantiere_id == cantiere_id).first()
    if not diario:
        raise HTTPException(404, "Diario non trovato")
    diario.stato_validazione = "pubblicata"
    db.commit(); db.refresh(diario)
    return _diario_out(diario)


@router.post("/{diario_id}/foto", response_model=DiarioOut)
async def upload_foto(cantiere_id: int, diario_id: int, file: UploadFile = File(...), db: Session = Depends(get_db), user: Utente = Depends(get_current_user)):
    diario = db.query(DiarioGiornaliero).filter(DiarioGiornaliero.id == diario_id).first()
    if not diario:
        raise HTTPException(status_code=404, detail="Diario non trovato")
    _ct_map = {"image/jpeg": ".jpg", "image/jpg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/heic": ".heic", "image/gif": ".gif"}
    ext = os.path.splitext(file.filename or "")[1].lower() or _ct_map.get((file.content_type or "").split(";")[0].strip(), "") or ".jpg"
    url, _ = salva_file(await file.read(), f"foto/{cantiere_id}", ext)
    urls = list(diario.foto_urls or [])
    urls.append(url)
    diario.foto_urls = urls
    db.commit()
    db.refresh(diario)
    try:
        notifica_cantiere(db, cantiere_id,
            ruoli=["admin", "capo_cantiere"],
            titolo="📷 Nuova foto nel diario",
            corpo=f"{user.nome} {user.cognome} ha aggiunto una foto al diario",
            escludi_id=user.id,
            url=f"/cantieri/{cantiere_id}#diario",
        )
    except Exception: pass
    return _diario_out(diario)


# ─── REGISTRAZIONE VOCALE → DIARIO ───────────────────────────────────────────

LINGUE_SUPPORTATE = {
    "it": "italiano", "en": "inglese", "de": "tedesco", "fr": "francese",
    "es": "spagnolo", "ro": "rumeno", "pl": "polacco", "uk": "ucraino", "ar": "arabo",
}

@router.post("/voce", response_model=DiarioOut, status_code=201)
async def registra_voce_nel_diario(
    cantiere_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: Utente = Depends(get_current_user),
):
    """
    Riceve un audio, lo trascrive con Whisper, lo elabora con Claude:
    - Testo organizzato → attivita del diario
    - Estrae voci contabilizzabili: ore extra + materiali utilizzati
    Salva automaticamente come voce del diario giornaliero di oggi.
    """
    if not settings.OPENAI_API_KEY:
        raise HTTPException(503, "OpenAI API key non configurata")
    if not settings.ANTHROPIC_API_KEY:
        raise HTTPException(503, "Anthropic API key non configurata")

    # Salva audio in file temp
    suffix = os.path.splitext(file.filename or "audio.webm")[1] or ".webm"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name

    try:
        # ── Step 1: Whisper ──────────────────────────────────────────────────
        from openai import OpenAI
        client_openai = OpenAI(api_key=settings.OPENAI_API_KEY)
        with open(tmp_path, "rb") as af:
            risposta = client_openai.audio.transcriptions.create(
                model="whisper-1", file=af, response_format="verbose_json"
            )
        testo_originale = risposta.text.strip()
        lingua = getattr(risposta, "language", "it") or "it"
        lingua_nome = LINGUE_SUPPORTATE.get(lingua, lingua)

        # ── Step 2: Claude — traduzione + organizzazione + estrazione voci ───
        import anthropic, json as _json
        claude = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)

        prompt = f"""Sei un assistente esperto di cantieri edili italiani.
Ricevi la trascrizione di una nota vocale registrata in cantiere da un operaio o artigiano.
Lingua rilevata: {lingua_nome}.

Il tuo compito è produrre un JSON con questa struttura esatta:
{{
  "testo_diario": "testo pulito e organizzato in italiano, pronto per il diario di cantiere (1-5 frasi, no bullet point)",
  "ore_extra": [
    {{"operaio": "nome operaio", "ore": 2.5, "attivita": "descrizione lavoro svolto", "tariffa_suggerita": 25.0}}
  ],
  "materiali": [
    {{"descrizione": "nome materiale", "quantita": 12, "um": "cad", "prezzo_unitario_stimato": 1.5}}
  ],
  "problemi": "eventuali problemi o criticità emerse (o null)"
}}

REGOLE:
- testo_diario: scrivi in italiano, riorganizza il contenuto in modo logico, elimina ripetizioni
- ore_extra: estrai SOLO ore di lavoro extra o straordinario menzionate esplicitamente
- materiali: estrai SOLO materiali, componenti, forniture menzionate
- tariffa_suggerita: stima ragionevole per manodopera edile (15-45 €/h), 0 se non si può stimare
- prezzo_unitario_stimato: stima di mercato, 0 se non si può stimare
- Se non ci sono ore extra o materiali, metti array vuoti []
- Rispondi SOLO con il JSON, senza markdown, senza testo aggiuntivo

Testo trascritto:
{testo_originale}"""

        msg = claude.messages.create(
            model="claude-haiku-4-5",
            max_tokens=2048,
            messages=[{"role": "user", "content": prompt}]
        )
        testo_claude = msg.content[0].text.strip()
        if testo_claude.startswith("```"):
            testo_claude = testo_claude.split("```")[1]
            if testo_claude.startswith("json"): testo_claude = testo_claude[4:]

        try:
            estratto = _json.loads(testo_claude)
        except Exception:
            estratto = {"testo_diario": testo_originale, "ore_extra": [], "materiali": [], "problemi": None}

        # Costruisci lista voci contabilizzabili
        voci = []
        for o in (estratto.get("ore_extra") or []):
            voci.append({
                "tipo": "ore_extra",
                "operaio": o.get("operaio", "Operaio"),
                "ore": float(o.get("ore", 0)),
                "attivita": o.get("attivita", ""),
                "tariffa_oraria": float(o.get("tariffa_suggerita", 0)),
                "totale": round(float(o.get("ore", 0)) * float(o.get("tariffa_suggerita", 0)), 2),
                "approvato": False,
            })
        for m in (estratto.get("materiali") or []):
            q = float(m.get("quantita", 1))
            p = float(m.get("prezzo_unitario_stimato", 0))
            voci.append({
                "tipo": "materiale",
                "descrizione": m.get("descrizione", "Materiale"),
                "quantita": q,
                "um": m.get("um", "cad"),
                "prezzo_unitario": p,
                "totale": round(q * p, 2),
                "approvato": False,
            })

        # ── Step 3: salva nel diario ─────────────────────────────────────────
        oggi = date_today.today()
        diario = DiarioGiornaliero(
            cantiere_id=cantiere_id,
            autore_id=user.id,
            data=oggi,
            attivita=estratto.get("testo_diario", testo_originale),
            problemi=estratto.get("problemi"),
            fonte="voce",
            testo_originale=testo_originale,
            lingua_originale=lingua,
            voci_estratte=voci,
            stato_validazione="bozza" if user.ruolo.value in _RUOLI_BOZZA else "pubblicata",
        )
        db.add(diario)
        db.commit()
        db.refresh(diario)
        try:
            notifica_cantiere(db, cantiere_id,
                ruoli=["admin", "capo_cantiere", "capo_cantiere_sub", "direzione_lavori"],
                titolo="🎙️ Nuova nota vocale nel diario",
                corpo=f"{user.nome} {user.cognome}: {(diario.attivita or '')[:80]}",
                escludi_id=user.id,
                url=f"/cantieri/{cantiere_id}#diario",
            )
        except Exception: pass
        return _diario_out(diario)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Errore elaborazione audio: {str(e)}")
    finally:
        try: os.unlink(tmp_path)
        except: pass


# ─── TAB FOTO CANTIERE ────────────────────────────────────────────────────────

@foto_router.get("/{cantiere_id}/foto")
def lista_foto_cantiere(cantiere_id: int, db: Session = Depends(get_db), user: Utente = Depends(get_current_user)):
    """Aggrega tutte le foto del cantiere: dal diario e dai pin sui documenti."""
    from app.models.documento import Documento
    cantiere = db.query(Cantiere).filter(Cantiere.id == cantiere_id).first()
    if not cantiere:
        raise HTTPException(404, "Cantiere non trovato")

    foto = []

    # Foto dai diari giornalieri
    diari = db.query(DiarioGiornaliero).filter(DiarioGiornaliero.cantiere_id == cantiere_id).order_by(DiarioGiornaliero.data.desc()).all()
    for d in diari:
        for url in (d.foto_urls or []):
            foto.append({
                "url": url,
                "fonte": "diario",
                "fonte_id": d.id,
                "fonte_label": f"Diario {d.data.strftime('%d/%m/%Y') if d.data else ''}",
                "autore": f"{d.autore.nome} {d.autore.cognome}" if d.autore else None,
                "data": str(d.data) if d.data else None,
            })

    # Foto dai pin sui documenti
    docs = db.query(Documento).filter(Documento.cantiere_id == cantiere_id).all()
    for doc in docs:
        for pin in (doc.pin_dati or []):
            for url in (pin.get("foto_urls") or []):
                foto.append({
                    "url": url,
                    "fonte": "pin",
                    "fonte_id": doc.id,
                    "fonte_label": f"Pin su {doc.nome}",
                    "autore": pin.get("autore"),
                    "data": pin.get("creato_il", "")[:10] if pin.get("creato_il") else None,
                    "nota": pin.get("nota"),
                })

    # Ordina per data decrescente
    foto.sort(key=lambda f: f.get("data") or "", reverse=True)
    return foto


@foto_router.post("/{cantiere_id}/foto")
async def upload_foto_cantiere(
    cantiere_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: Utente = Depends(get_current_user),
):
    """Carica una foto direttamente nel cantiere — crea una nota diario per contenerla."""
    cantiere = db.query(Cantiere).filter(Cantiere.id == cantiere_id).first()
    if not cantiere:
        raise HTTPException(404, "Cantiere non trovato")

    _ct_map = {"image/jpeg": ".jpg", "image/jpg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/heic": ".heic"}
    ext = os.path.splitext(file.filename or "")[1].lower() or _ct_map.get((file.content_type or "").split(";")[0].strip(), "") or ".jpg"
    url, _ = salva_file(await file.read(), f"foto/{cantiere_id}", ext)

    # Inserisce in una nota diario di oggi (o ne crea una nuova dedicata)
    oggi = date_today.today()
    diario = db.query(DiarioGiornaliero).filter(
        DiarioGiornaliero.cantiere_id == cantiere_id,
        DiarioGiornaliero.data == oggi,
        DiarioGiornaliero.autore_id == user.id,
        DiarioGiornaliero.fonte == "foto_diretta",
    ).first()
    if not diario:
        diario = DiarioGiornaliero(
            cantiere_id=cantiere_id,
            data=oggi,
            autore_id=user.id,
            attivita="Foto caricate dalla tab Foto",
            fonte="foto_diretta",
            stato_validazione="pubblicata",
            foto_urls=[],
        )
        db.add(diario)
        db.flush()

    urls = list(diario.foto_urls or [])
    urls.append(url)
    diario.foto_urls = urls
    db.commit()

    return {"url": url, "diario_id": diario.id}


# ─── ORE EXTRA ────────────────────────────────────────────────────────────────

ore_router = APIRouter(prefix="/cantieri/{cantiere_id}/ore-extra", tags=["Ore Extra"])


@ore_router.get("", response_model=List[OreExtraOut])
def lista_ore(cantiere_id: int, db: Session = Depends(get_db), user: Utente = Depends(get_current_user)):
    return db.query(OreExtra).filter(OreExtra.cantiere_id == cantiere_id).order_by(OreExtra.data.desc()).all()


@ore_router.post("", response_model=OreExtraOut, status_code=201)
def crea_ore(cantiere_id: int, body: OreExtraCreate, db: Session = Depends(get_db), user: Utente = Depends(get_current_user)):
    totale = round(body.ore * body.tariffa_oraria, 2)
    ore = OreExtra(
        cantiere_id=cantiere_id,
        creato_da=user.id,
        totale=totale,
        data=body.data or date_today.today(),
        **body.model_dump(exclude={"data"}),
    )
    db.add(ore)
    db.commit()
    db.refresh(ore)
    return ore


@ore_router.put("/{ore_id}", response_model=OreExtraOut)
def aggiorna_ore(cantiere_id: int, ore_id: int, body: OreExtraUpdate, db: Session = Depends(get_db), user: Utente = Depends(get_current_user)):
    ore = db.query(OreExtra).filter(OreExtra.id == ore_id, OreExtra.cantiere_id == cantiere_id).first()
    if not ore: raise HTTPException(404, "Non trovato")
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(ore, k, v)
    ore.totale = round(ore.ore * ore.tariffa_oraria, 2)
    db.commit(); db.refresh(ore)
    return ore


@ore_router.delete("/{ore_id}", status_code=204)
def elimina_ore(cantiere_id: int, ore_id: int, db: Session = Depends(get_db), user: Utente = Depends(get_current_user)):
    ore = db.query(OreExtra).filter(OreExtra.id == ore_id, OreExtra.cantiere_id == cantiere_id).first()
    if not ore: raise HTTPException(404, "Non trovato")
    db.delete(ore); db.commit()
