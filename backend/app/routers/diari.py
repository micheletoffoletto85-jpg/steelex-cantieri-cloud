import io, os, tempfile
from datetime import date as date_today
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional
from pydantic import BaseModel
from app.database import get_db
from app.models.diario import DiarioGiornaliero, OreExtra
from app.models.cantiere import Cantiere
from app.models.utente import Utente
from app.schemas.diario import DiarioCreate, DiarioOut, DiarioUpdate, OreExtraOut, OreExtraCreate, OreExtraUpdate

foto_router = APIRouter(prefix="/cantieri", tags=["Foto Cantiere"])
from app.auth import get_current_user
from app.config import settings
from app.storage import salva_file
from app.routers.notifiche import notifica_cantiere, invia_notifica

router = APIRouter(prefix="/cantieri/{cantiere_id}/diari", tags=["Diario Giornaliero"])


def _diario_out(d: DiarioGiornaliero) -> dict:
    """Aggiunge autore_nome al dict del diario."""
    nome = None
    if d.autore:
        nome = f"{d.autore.nome} {d.autore.cognome}".strip() or d.autore.email
    out = DiarioOut.model_validate(d).model_dump()
    out["autore_nome"] = nome

    # Rapportino collegato (se la nota nasce da un rapportino operativo) — usato
    # sia per esporre le ore quando voci_estratte è vuoto sia per il materiale usato
    from app.models.rapportino import RapportinoOperativo
    rap = None
    try:
        from sqlalchemy.orm import object_session
        sess = object_session(d)
        if sess:
            rap = sess.query(RapportinoOperativo).filter(RapportinoOperativo.diario_id == d.id).first()
    except Exception:
        pass

    if rap is not None:
        out["rapportino_id"] = rap.id
        out["rapportino_materiali"] = rap.materiali or []
        out["rapportino_materiale_extra"] = rap.materiale_extra
        out["rapportino_materiali_spese"] = rap.materiali_spese or []

    # Se il diario ha voci_estratte vuote ma viene da un rapportino, esponi le ore
    if not out.get("voci_estratte"):
        if rap and rap.ore_lavorate and rap.ore_lavorate > 0:
            op_nome = ""
            if rap.operativo:
                op_nome = f"{rap.operativo.nome} {rap.operativo.cognome}".strip()
            out["voci_estratte"] = [{
                "tipo": "ore_extra",
                "operaio": op_nome,
                "ore": float(rap.ore_lavorate),
                "attivita": rap.riassunto or "",
                "approvato": False,
            }]
    return out


def _sync_foto_archivio(db: Session, cantiere_id: int, urls, autore_id=None, nota=None) -> int:
    """Riversa nel Tab Foto del cantiere (foto_cantiere) le foto del diario non
    ancora presenti. Il commit resta a carico del chiamante. Ritorna quante ne
    ha aggiunte. Import locale di FotoCantiere: vedi nota nel modello."""
    urls = [u for u in (urls or []) if u]
    if not urls:
        return 0
    from app.models.foto_cantiere import FotoCantiere
    esistenti = {u for (u,) in db.query(FotoCantiere.url).filter(FotoCantiere.cantiere_id == cantiere_id).all()}
    ordine = db.query(func.max(FotoCantiere.ordine)).filter(FotoCantiere.cantiere_id == cantiere_id).scalar() or 0
    aggiunte = 0
    for u in urls:
        if u in esistenti:
            continue
        ordine += 1
        db.add(FotoCantiere(cantiere_id=cantiere_id, url=u, ordine=ordine, autore_id=autore_id, nota=nota))
        esistenti.add(u)
        aggiunte += 1
    return aggiunte


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
        if getattr(data, 'condividi_cliente', False):
            cantiere = db.query(Cantiere).filter(Cantiere.id == cantiere_id).first()
            cliente_ids = [u.id for u in (cantiere.artigiani if cantiere else []) if u.ruolo.value == "cliente"]
            if cliente_ids:
                invia_notifica(db, cliente_ids,
                    titolo="📋 Nuovo aggiornamento dal cantiere",
                    corpo=(data.attivita or '')[:80],
                    url=f"/cantieri/{cantiere_id}",
                    tipo="info", cantiere_id=cantiere_id,
                )
    except Exception: pass
    return _diario_out(diario)


_GIORNI_IT = ["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"]
_MESI_IT = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio",
            "agosto", "settembre", "ottobre", "novembre", "dicembre"]


def _data_it(d) -> str:
    return f"{_GIORNI_IT[d.weekday()]} {d.day} {_MESI_IT[d.month - 1]} {d.year}"


def _chiave_da_url_foto(url: str) -> str:
    if url.startswith("http"):
        from urllib.parse import urlparse
        return urlparse(url).path.lstrip("/")
    return os.path.join(settings.UPLOAD_DIR, url.removeprefix("/uploads/"))


def _foto_ridotta_per_pdf(contenuto: bytes, larghezza_max_px: int = 700):
    """Ridimensiona e ricomprime una foto prima di metterla nel PDF — le foto da
    smartphone arrivano spesso a 3-4000px e diversi MB: incollate a piena risoluzione
    (reportlab non le ridimensiona, disegna solo più piccolo) una relazione con qualche
    foto superava abbondantemente i 12s di timeout del client e pesava decine di MB.
    Ritorna (buffer_jpeg, larghezza, altezza) del file già ridotto."""
    from PIL import Image, ImageOps
    img = Image.open(io.BytesIO(contenuto))
    img = ImageOps.exif_transpose(img)  # rispetta la rotazione EXIF (foto verticali da telefono)
    if img.mode not in ("RGB", "L"):
        img = img.convert("RGB")
    if img.width > larghezza_max_px:
        nuova_h = round(img.height * larghezza_max_px / img.width)
        img = img.resize((larghezza_max_px, nuova_h), Image.LANCZOS)
    out = io.BytesIO()
    img.save(out, format="JPEG", quality=72, optimize=True)
    out.seek(0)
    return out, img.width, img.height


@router.get("/relazione-pdf")
def genera_relazione_pdf(
    cantiere_id: int,
    ids: str = Query(..., description="ID note diario separati da virgola"),
    db: Session = Depends(get_db),
    user: Utente = Depends(get_current_user),
):
    """Relazione PDF con intestazione aziendale che raggruppa una o più note del
    diario (testo, foto, ore lavorate) — pensata per relazionare al cliente
    lavori extra preventivo."""
    if user.ruolo.value not in _RUOLI_VALIDA:
        raise HTTPException(403, "Solo capocantiere, amministrazione o admin può generare la relazione")

    try:
        id_list = [int(x) for x in ids.split(",") if x.strip()]
    except ValueError:
        raise HTTPException(400, "Parametro ids non valido")
    if not id_list:
        raise HTTPException(400, "Nessuna nota selezionata")

    cantiere = db.query(Cantiere).filter(Cantiere.id == cantiere_id).first()
    if not cantiere:
        raise HTTPException(404, "Cantiere non trovato")

    diari = (db.query(DiarioGiornaliero)
             .filter(DiarioGiornaliero.id.in_(id_list), DiarioGiornaliero.cantiere_id == cantiere_id)
             .order_by(DiarioGiornaliero.data.asc())
             .all())
    if not diari:
        raise HTTPException(404, "Nessuna nota trovata")

    from xml.sax.saxutils import escape
    from reportlab.lib import colors
    from reportlab.lib.units import mm
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.platypus import (Table, TableStyle, Paragraph,
                                     Spacer, HRFlowable, Image as RLImage, KeepTogether)
    from app import pdf_theme as T
    from app.storage import leggi_file
    from concurrent.futures import ThreadPoolExecutor

    S = T.make_styles()
    PRIMARIO, SCURO = T.palette()

    style_giorno = ParagraphStyle("giorno_rel", parent=S["h2"], fontSize=12, spaceBefore=8, spaceAfter=2)
    style_meta   = S["meta"]
    style_testo  = ParagraphStyle("testo_rel", parent=S["body"], alignment=4)
    style_extra  = ParagraphStyle("extra_rel", parent=S["kicker"], spaceAfter=4)
    style_cella  = S["cell"]
    style_label  = S["value_b"]

    data_min = diari[0].data.strftime("%d/%m/%Y")
    data_max = diari[-1].data.strftime("%d/%m/%Y")
    periodo = data_min if data_min == data_max else f"dal {data_min} al {data_max}"

    story = []
    story += T.masthead(S, "Relazione lavori", periodo)
    indirizzo = ", ".join(x for x in [cantiere.indirizzo, cantiere.citta] if x)
    rows = [
        ("Cantiere", escape(cantiere.nome or "—")),
        ("Periodo", periodo),
    ]
    if cantiere.cliente:
        rows.append(("Cliente", escape(cantiere.cliente)))
    if indirizzo:
        rows.append(("Ubicazione", escape(indirizzo)))
    rows.append(("Data emissione", date_today.today().strftime("%d/%m/%Y")))
    story.append(T.info_grid(S, rows))
    story.append(Spacer(1, 7*mm))

    tot_ore = 0.0
    tot_foto = 0

    # Ore per nota, prese in blocco — e se almeno una riga è marcata come extra preventivo,
    # la relazione riporta SOLO quelle (è lo scopo della relazione: documentare cosa fatturare
    # a parte). Se invece nessuna riga è marcata, si comporta come report generale e le mostra
    # tutte, per non rompere l'uso "riassunto lavori" non legato alla fatturazione extra.
    tutte_le_ore = {
        d.id: db.query(OreExtra).filter(OreExtra.diario_id == d.id).order_by(OreExtra.id).all()
        for d in diari
    }
    solo_extra_preventivo = any(o.extra_preventivo for righe in tutte_le_ore.values() for o in righe)

    for d in diari:
        # Solo l'intestazione (data + meta + separatore) va tenuta insieme — è sempre
        # piccola. Il resto (testo, tabella ore, foto) può essere lungo quanto vuole e
        # deve poter scorrere su più pagine: un KeepTogether su tutto il blocco andava
        # in errore (o troncava il contenuto) su note con testo lungo.
        header = [Paragraph(_data_it(d.data), style_giorno)]
        meta_parts = []
        if d.meteo:
            meta_parts.append(d.meteo)
        if d.operai_presenti:
            meta_parts.append(f"{d.operai_presenti} operai presenti")
        if meta_parts:
            header.append(Paragraph(" · ".join(meta_parts), style_meta))
        header.append(HRFlowable(width="100%", thickness=0.5, color=colors.lightgrey, spaceAfter=4))
        story.append(KeepTogether(header))

        if d.extra_preventivo:
            nota_extra = f" — {escape(d.extra_preventivo_nota)}" if d.extra_preventivo_nota else ""
            story.append(Paragraph(f"LAVORAZIONE EXTRA PREVENTIVO{nota_extra}", style_extra))

        # Ore lavorate registrate per questa nota — filtrate a extra preventivo se la
        # relazione ne contiene almeno una (vedi sopra)
        ore_rows = tutte_le_ore.get(d.id, [])
        if solo_extra_preventivo:
            ore_rows = [o for o in ore_rows if o.extra_preventivo]

        # Testo del giorno: in una relazione "solo extra preventivo" NON usare il racconto
        # generale della giornata (descrive tutto il lavoro svolto, non solo la parte extra
        # fatturata a parte) — usa invece le note extra preventivo dedicate (della nota diario
        # e/o delle singole righe ore), così il cliente non vede un racconto generico abbinato
        # a poche ore di una sola persona. Nessun bisogno di toccare/ripristinare la nota
        # diario: basta compilare la nota extra preventivo dedicata (checkbox nel diario o
        # nella riga ore) per ottenere un testo mirato in relazione.
        if solo_extra_preventivo:
            note_dedicate = []
            if d.extra_preventivo_nota:
                note_dedicate.append(d.extra_preventivo_nota)
            for o in ore_rows:
                if o.extra_preventivo_nota and o.extra_preventivo_nota not in note_dedicate:
                    prefisso = f"{o.operaio_nome}: " if len(ore_rows) > 1 else ""
                    note_dedicate.append(f"{prefisso}{o.extra_preventivo_nota}")
            testo = "\n".join(note_dedicate) if note_dedicate else (d.attivita or "").strip()
        else:
            testo = (d.attivita or "").strip()

        for para in testo.split("\n"):
            if para.strip():
                story.append(Paragraph(escape(para), style_testo))
        if d.problemi:
            story.append(Paragraph(f"<b>Criticità:</b> {escape(d.problemi)}", style_testo))
        if ore_rows:
            # Celle come Paragraph, non stringhe nude: reportlab non va a capo il testo
            # dentro una Table se il contenuto è una stringa semplice, solo se è un
            # Flowable — con nomi/attività lunghe il testo sbordava dalla colonna.
            tabella_ore = [[Paragraph("Operaio", S["cell_h"]), Paragraph("Ore", S["cell_h"]), Paragraph("Attività", S["cell_h"])]]
            for o in ore_rows:
                tot_ore += o.ore or 0
                tabella_ore.append([
                    Paragraph(escape(o.operaio_nome or ""), style_cella),
                    Paragraph(f"{o.ore:g} h", S["num"]),
                    Paragraph(escape(o.attivita or ""), style_cella),
                ])
            nore = len(tabella_ore) - 1
            t = Table(tabella_ore, colWidths=[48*mm, 16*mm, 101*mm])
            t.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), SCURO),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("ROWBACKGROUNDS", (0, 1), (-1, nore), [colors.white, T.BG_SOFT]),
                ("LINEBELOW", (0, 1), (-1, nore), 0.4, T.BORDER),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
            ]))
            story.append(Spacer(1, 2*mm))
            story.append(t)

        story.append(Spacer(1, 3*mm))

        # Report fotografico — griglia 3 per riga
        foto_urls = d.foto_urls or []
        if foto_urls:
            tot_foto += len(foto_urls)
            cella_w = 55*mm
            # Il download da R2 è I/O-bound e indipendente per ogni foto: le scarichiamo
            # in parallelo invece che una alla volta per ridurre ulteriormente i tempi
            # di generazione (oltre al ridimensionamento sotto, non tocca il DB).
            def _scarica_foto(url):
                try:
                    return leggi_file(_chiave_da_url_foto(url))
                except Exception:
                    return None
            with ThreadPoolExecutor(max_workers=8) as executor:
                contenuti = list(executor.map(_scarica_foto, foto_urls))
            righe_foto, riga = [], []
            for risultato in contenuti:
                if risultato is None:
                    continue
                contenuto, _ = risultato
                try:
                    img_buf, iw, ih = _foto_ridotta_per_pdf(contenuto)
                    h = min(cella_w * ih / iw, 55*mm) if iw else cella_w
                    w = h * iw / ih if ih else cella_w
                    riga.append(RLImage(img_buf, width=w, height=h))
                except Exception:
                    continue
                if len(riga) == 3:
                    righe_foto.append(riga); riga = []
            if riga:
                riga += [""] * (3 - len(riga))
                righe_foto.append(riga)
            if righe_foto:
                foto_table = Table(righe_foto, colWidths=[cella_w]*3)
                foto_table.setStyle(TableStyle([
                    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                    ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                    ("TOPPADDING", (0, 0), (-1, -1), 3),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                ]))
                story.append(foto_table)
        story.append(Spacer(1, 6*mm))

    # Riepilogo
    story.append(Spacer(1, 3*mm))
    story.append(Paragraph("Riepilogo", S["h2"]))
    n_extra = sum(1 for d in diari if d.extra_preventivo)
    etichetta_ore = "Totale ore extra preventivo" if solo_extra_preventivo else "Totale ore lavorate"
    rows = [
        ("Giorni relazionati", str(len(diari))),
        (etichetta_ore, f"{tot_ore:g} h" if tot_ore else "—"),
        ("Foto allegate", str(tot_foto)),
    ]
    if n_extra:
        rows.append(("Di cui extra preventivo", str(n_extra)))
    story.append(T.info_grid(S, rows, col_label_mm=70))
    story.append(Spacer(1, 9*mm))

    story.append(T.signature_block(S, "Per presa visione — timbro e firma cliente", "Per l'impresa"))

    buf = io.BytesIO()
    T.build(buf, story, title=f"Relazione — {cantiere.nome}")

    nome_cantiere = (cantiere.nome or "cantiere").replace(" ", "_")
    nome_file = f"relazione_{nome_cantiere}_{data_min.replace('/', '-')}.pdf"
    from fastapi.responses import StreamingResponse
    return StreamingResponse(
        buf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{nome_file}"'},
    )


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
    if user.ruolo.value not in ("admin", "capo_cantiere", "capo_cantiere_sub", "direzione_lavori") and diario.autore_id != user.id:
        raise HTTPException(status_code=403, detail="Non autorizzato")
    # Sgancia eventuali rapportini che puntano a questo diario (FK senza cascade)
    from app.models.rapportino import RapportinoOperativo
    db.query(RapportinoOperativo).filter(RapportinoOperativo.diario_id == diario_id).update({"diario_id": None})
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
    # La foto del diario entra anche nell'archivio foto del cantiere (Tab Foto)
    try:
        _sync_foto_archivio(db, cantiere_id, [url], autore_id=user.id, nota="Da diario")
    except Exception:
        pass
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


@router.delete("/{diario_id}/foto", status_code=200)
def elimina_foto_diario(cantiere_id: int, diario_id: int, url: str, db: Session = Depends(get_db), user: Utente = Depends(get_current_user)):
    if user.ruolo.value not in ("admin", "capo_cantiere", "capo_cantiere_sub", "direzione_lavori"):
        raise HTTPException(status_code=403, detail="Non autorizzato")
    diario = db.query(DiarioGiornaliero).filter(DiarioGiornaliero.id == diario_id, DiarioGiornaliero.cantiere_id == cantiere_id).first()
    if not diario:
        raise HTTPException(status_code=404, detail="Diario non trovato")
    urls = [u for u in (diario.foto_urls or []) if u != url]
    diario.foto_urls = urls
    db.commit()
    db.refresh(diario)
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
            model="claude-haiku-4-5-20251001",
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


# ─── TAB FOTO CANTIERE — galleria curata (ordine/visibilità cliente/cancellazione) ─
# Import di FotoCantiere sempre locale alle funzioni: vedi nota nel modello.

_RUOLI_GALLERIA_CURA = {"admin", "capo_cantiere", "capo_cantiere_sub", "direzione_lavori"}
_RUOLI_GALLERIA_UPLOAD = _RUOLI_GALLERIA_CURA | {"artigiano"}


def _foto_out(f) -> dict:
    return {
        "id": f.id, "url": f.url, "ordine": f.ordine,
        "visibile_cliente": f.visibile_cliente, "nota": f.nota,
        "autore": f"{f.autore.nome} {f.autore.cognome}" if f.autore else None,
        "data": f.creato_il.date().isoformat() if f.creato_il else None,
    }


@foto_router.get("/{cantiere_id}/foto")
def lista_foto_cantiere(cantiere_id: int, db: Session = Depends(get_db), user: Utente = Depends(get_current_user)):
    """Galleria foto curata del cantiere — ordine e visibilità cliente decisi dallo staff."""
    from app.models.foto_cantiere import FotoCantiere
    from app.routers.cantieri import _check_accesso
    cantiere = db.query(Cantiere).filter(Cantiere.id == cantiere_id).first()
    if not cantiere:
        raise HTTPException(404, "Cantiere non trovato")
    _check_accesso(cantiere, user)

    # Auto-allineamento: le foto del diario che non sono ancora nell'archivio
    # (storiche + quelle aggiunte prima di questa sync) vengono riversate qui.
    if user.ruolo.value != "cliente":
        try:
            diari_foto = []
            for (fu,) in db.query(DiarioGiornaliero.foto_urls).filter(DiarioGiornaliero.cantiere_id == cantiere_id).all():
                diari_foto += list(fu or [])
            if _sync_foto_archivio(db, cantiere_id, diari_foto, nota="Da diario"):
                db.commit()
        except Exception:
            db.rollback()

    q = db.query(FotoCantiere).filter(FotoCantiere.cantiere_id == cantiere_id)
    if user.ruolo.value == "cliente":
        q = q.filter(FotoCantiere.visibile_cliente == True)
    foto = q.order_by(FotoCantiere.ordine.asc(), FotoCantiere.id.asc()).all()
    return [_foto_out(f) for f in foto]


@foto_router.post("/{cantiere_id}/foto")
async def upload_foto_cantiere(
    cantiere_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: Utente = Depends(get_current_user),
):
    """Carica una foto nella galleria curata del cantiere."""
    from app.models.foto_cantiere import FotoCantiere
    from app.routers.cantieri import _check_accesso
    cantiere = db.query(Cantiere).filter(Cantiere.id == cantiere_id).first()
    if not cantiere:
        raise HTTPException(404, "Cantiere non trovato")
    _check_accesso(cantiere, user)
    if user.ruolo.value not in _RUOLI_GALLERIA_UPLOAD:
        raise HTTPException(403, "Non autorizzato a caricare foto")

    _ct_map = {"image/jpeg": ".jpg", "image/jpg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/heic": ".heic"}
    ext = os.path.splitext(file.filename or "")[1].lower() or _ct_map.get((file.content_type or "").split(";")[0].strip(), "") or ".jpg"
    # salva_file() e' I/O bloccante (rete verso R2 o scrittura disco): va eseguita
    # in threadpool per non bloccare l'event loop e causare timeout a cascata
    from starlette.concurrency import run_in_threadpool
    url, _ = await run_in_threadpool(salva_file, await file.read(), f"foto/{cantiere_id}", ext)

    ultimo = db.query(func.max(FotoCantiere.ordine)).filter(FotoCantiere.cantiere_id == cantiere_id).scalar()
    foto = FotoCantiere(cantiere_id=cantiere_id, url=url, ordine=(ultimo or 0) + 1, autore_id=user.id)
    db.add(foto)
    db.commit()
    db.refresh(foto)
    return _foto_out(foto)


@foto_router.delete("/{cantiere_id}/foto/{foto_id}")
def elimina_foto_cantiere(cantiere_id: int, foto_id: int, db: Session = Depends(get_db), user: Utente = Depends(get_current_user)):
    from app.models.foto_cantiere import FotoCantiere
    from app.routers.cantieri import _check_accesso
    cantiere = db.query(Cantiere).filter(Cantiere.id == cantiere_id).first()
    if not cantiere:
        raise HTTPException(404, "Cantiere non trovato")
    _check_accesso(cantiere, user)
    if user.ruolo.value not in _RUOLI_GALLERIA_CURA:
        raise HTTPException(403, "Non autorizzato")
    foto = db.query(FotoCantiere).filter(FotoCantiere.id == foto_id, FotoCantiere.cantiere_id == cantiere_id).first()
    if not foto:
        raise HTTPException(404, "Foto non trovata")
    db.delete(foto)
    db.commit()
    return {"ok": True}


class FotoCantiereUpdate(BaseModel):
    visibile_cliente: Optional[bool] = None
    nota: Optional[str] = None


@foto_router.patch("/{cantiere_id}/foto/{foto_id}")
def aggiorna_foto_cantiere(cantiere_id: int, foto_id: int, body: FotoCantiereUpdate, db: Session = Depends(get_db), user: Utente = Depends(get_current_user)):
    from app.models.foto_cantiere import FotoCantiere
    from app.routers.cantieri import _check_accesso
    cantiere = db.query(Cantiere).filter(Cantiere.id == cantiere_id).first()
    if not cantiere:
        raise HTTPException(404, "Cantiere non trovato")
    _check_accesso(cantiere, user)
    if user.ruolo.value not in _RUOLI_GALLERIA_CURA:
        raise HTTPException(403, "Non autorizzato")
    foto = db.query(FotoCantiere).filter(FotoCantiere.id == foto_id, FotoCantiere.cantiere_id == cantiere_id).first()
    if not foto:
        raise HTTPException(404, "Foto non trovata")
    if body.visibile_cliente is not None:
        foto.visibile_cliente = body.visibile_cliente
    if body.nota is not None:
        foto.nota = body.nota
    db.commit()
    db.refresh(foto)
    return _foto_out(foto)


class FotoRiordinaBody(BaseModel):
    ordine: List[int]  # id foto nel nuovo ordine


@foto_router.put("/{cantiere_id}/foto/riordina")
def riordina_foto_cantiere(cantiere_id: int, body: FotoRiordinaBody, db: Session = Depends(get_db), user: Utente = Depends(get_current_user)):
    from app.models.foto_cantiere import FotoCantiere
    from app.routers.cantieri import _check_accesso
    cantiere = db.query(Cantiere).filter(Cantiere.id == cantiere_id).first()
    if not cantiere:
        raise HTTPException(404, "Cantiere non trovato")
    _check_accesso(cantiere, user)
    if user.ruolo.value not in _RUOLI_GALLERIA_CURA:
        raise HTTPException(403, "Non autorizzato")
    foto_map = {f.id: f for f in db.query(FotoCantiere).filter(FotoCantiere.cantiere_id == cantiere_id).all()}
    for i, foto_id in enumerate(body.ordine):
        f = foto_map.get(foto_id)
        if f:
            f.ordine = i
    db.commit()
    return {"ok": True}


# ─── ORE EXTRA ────────────────────────────────────────────────────────────────

ore_router = APIRouter(prefix="/cantieri/{cantiere_id}/ore-extra", tags=["Ore Extra"])


def _ore_out(ore: OreExtra) -> dict:
    d = OreExtraOut.model_validate(ore).model_dump()
    d["utente_nome"] = f"{ore.operatore.nome} {ore.operatore.cognome}" if ore.operatore else None
    return d


def _tariffa_operatore(db: Session, utente_id, fallback_default: bool = True) -> float:
    """Costo orario di un operatore: il suo costo_orario se impostato, altrimenti
    COSTO_ORARIO_DEFAULT. Senza operatore torna 0."""
    if utente_id:
        u = db.query(Utente).filter(Utente.id == utente_id).first()
        if u and u.costo_orario and u.costo_orario > 0:
            return float(u.costo_orario)
        if fallback_default:
            return float(getattr(settings, "COSTO_ORARIO_DEFAULT", 0) or 0)
    return 0.0


@ore_router.get("", response_model=List[OreExtraOut])
def lista_ore(cantiere_id: int, db: Session = Depends(get_db), user: Utente = Depends(get_current_user)):
    righe = db.query(OreExtra).filter(OreExtra.cantiere_id == cantiere_id).order_by(OreExtra.data.desc()).all()
    return [_ore_out(o) for o in righe]


@ore_router.post("", response_model=OreExtraOut, status_code=201)
def crea_ore(cantiere_id: int, body: OreExtraCreate, db: Session = Depends(get_db), user: Utente = Depends(get_current_user)):
    dati = body.model_dump(exclude={"data"})
    # Se collegata a un operatore e non è stata passata una tariffa, usa il suo costo orario
    tariffa = body.tariffa_oraria or 0.0
    if body.utente_id and not tariffa:
        tariffa = _tariffa_operatore(db, body.utente_id)
    dati["tariffa_oraria"] = tariffa
    ore = OreExtra(
        cantiere_id=cantiere_id,
        creato_da=user.id,
        totale=round(body.ore * tariffa, 2),
        data=body.data or date_today.today(),
        **dati,
    )
    db.add(ore)
    db.flush()
    _sync_voce_extra(db, ore)
    db.commit()
    db.refresh(ore)
    return _ore_out(ore)


def _sync_voce_extra(db: Session, ore: OreExtra) -> None:
    """Allinea la voce nel computo per una riga ore segnata extra preventivo."""
    try:
        from app.routers.economico import sync_voce_extra_ore
        sync_voce_extra_ore(db, ore)
    except Exception:
        pass


@ore_router.put("/{ore_id}", response_model=OreExtraOut)
def aggiorna_ore(cantiere_id: int, ore_id: int, body: OreExtraUpdate, db: Session = Depends(get_db), user: Utente = Depends(get_current_user)):
    ore = db.query(OreExtra).filter(OreExtra.id == ore_id, OreExtra.cantiere_id == cantiere_id).first()
    if not ore: raise HTTPException(404, "Non trovato")
    dati = body.model_dump(exclude_none=True)
    for k, v in dati.items():
        setattr(ore, k, v)
    if body.extra_preventivo is False:   # exclude_none non passa il False
        ore.extra_preventivo = False
    # Se si collega un operatore e non c'e una tariffa esplicita, prendi il suo costo orario
    if ore.utente_id and not (dati.get("tariffa_oraria") or ore.tariffa_oraria):
        ore.tariffa_oraria = _tariffa_operatore(db, ore.utente_id)
    ore.totale = round((ore.ore or 0) * (ore.tariffa_oraria or 0), 2)
    db.flush()
    _sync_voce_extra(db, ore)
    db.commit(); db.refresh(ore)
    return _ore_out(ore)


@ore_router.delete("/{ore_id}", status_code=204)
def elimina_ore(cantiere_id: int, ore_id: int, db: Session = Depends(get_db), user: Utente = Depends(get_current_user)):
    ore = db.query(OreExtra).filter(OreExtra.id == ore_id, OreExtra.cantiere_id == cantiere_id).first()
    if not ore: raise HTTPException(404, "Non trovato")
    if ore.voce_extra_id:
        ore.extra_preventivo = False
        db.flush()
        _sync_voce_extra(db, ore)
    db.delete(ore); db.commit()


@ore_router.post("/ricalcola")
def ricalcola_ore(cantiere_id: int, db: Session = Depends(get_db), user: Utente = Depends(get_current_user)):
    """Sistema le righe ore incomplete: abbina l'operatore dal nome se manca, e
    (ri)calcola la tariffa — costo orario dell'operatore collegato, altrimenti
    COSTO_ORARIO_DEFAULT. Non tocca le righe con tariffa impostata a mano che hanno
    già un operatore."""
    from app.routers.rapportini import _match_operatore
    default_tar = float(getattr(settings, "COSTO_ORARIO_DEFAULT", 0) or 0)
    righe = db.query(OreExtra).filter(OreExtra.cantiere_id == cantiere_id).all()
    linkate = 0
    valorizzate = 0
    for o in righe:
        if not o.utente_id:
            uid = _match_operatore(db, o.operaio_nome, cantiere_id)
            if uid:
                o.utente_id = uid
                linkate += 1
        senza_costo = not (o.totale and o.totale > 0) or not (o.tariffa_oraria and o.tariffa_oraria > 0)
        if senza_costo and (o.ore or 0) > 0:
            tariffa = _tariffa_operatore(db, o.utente_id) if o.utente_id else default_tar
            if tariffa > 0:
                o.tariffa_oraria = tariffa
                o.totale = round(float(o.ore) * tariffa, 2)
                valorizzate += 1
        # il vecchio flag approvato non ha piu senso: le ore contano sempre
        if o.approvato:
            o.approvato = False
        if o.extra_preventivo or o.voce_extra_id:
            db.flush()
            _sync_voce_extra(db, o)
    db.commit()
    return {"aggiornate": valorizzate + linkate, "valorizzate": valorizzate, "collegate": linkate}


# ═══════════════════════════════════════════════════════════════════════════════
# VERBALE DI CHIUSURA CANTIERE — documento relazionale (NON contabile)
# Import di ChiusuraCantiere sempre locale alle funzioni: vedi nota nel modello.
# ═══════════════════════════════════════════════════════════════════════════════

chiusura_router = APIRouter(prefix="/cantieri/{cantiere_id}/chiusura", tags=["Chiusura Cantiere"])

_RUOLI_CHIUSURA = {"admin", "capo_cantiere", "amministrazione"}

_MESI_IT_LONG = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno",
                 "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"]


def _data_estesa(d) -> str:
    if not d:
        return "—"
    return f"{d.day} {_MESI_IT_LONG[d.month - 1]} {d.year}"


def _durata_lavori(inizio, fine) -> str:
    if not inizio or not fine or fine < inizio:
        return "—"
    giorni = (fine - inizio).days
    mesi = giorni // 30
    resto = giorni % 30
    parti = []
    if mesi:
        parti.append(f"{mesi} mese" if mesi == 1 else f"{mesi} mesi")
    if resto or not parti:
        parti.append(f"{resto} giorno" if resto == 1 else f"{resto} giorni")
    return " e ".join(parti)


def _fasi_cantiere(db: Session, cantiere_id: int):
    from app.models.economico import FaseLavoro
    return (db.query(FaseLavoro)
            .filter(FaseLavoro.cantiere_id == cantiere_id)
            .order_by(FaseLavoro.ordine.asc(), FaseLavoro.id.asc())
            .all())


_STATO_FASE_LABEL = {
    "completata": "Completata", "in_corso": "In corso", "in_ritardo": "In ritardo",
    "sospesa": "Sospesa", "pianificata": "Pianificata",
}


def _periodo_fase(f) -> str:
    ini = f.data_inizio
    fin = f.data_fine_reale or f.data_fine_prevista
    if ini and fin:
        return f"{ini.strftime('%d.%m')} – {fin.strftime('%d.%m.%y')}"
    if ini:
        return ini.strftime("%d.%m.%Y")
    return "—"


def _chiusura_get(db: Session, cantiere_id: int):
    from app.models.chiusura import ChiusuraCantiere
    return db.query(ChiusuraCantiere).filter(ChiusuraCantiere.cantiere_id == cantiere_id).first()


def _chiusura_dict(c, cantiere) -> dict:
    return {
        "esiste": c is not None,
        "stato": (c.stato if c else "bozza"),
        "numero": (c.numero if c else None),
        "relazione": (c.relazione if c else None),
        "consegne": (c.consegne if c else None),
        "foto_ids": (c.foto_ids if c and c.foto_ids else []),
        "foto_copertina_id": (c.foto_copertina_id if c else None),
        "committente_nome": (c.committente_nome if c and c.committente_nome else (cantiere.cliente if cantiere else None)),
        "direzione_lavori": (c.direzione_lavori if c else None),
        "responsabile_nome": (c.responsabile_nome if c else None),
        "data_ultimazione": (c.data_ultimazione.isoformat() if c and c.data_ultimazione else None),
        "aggiornato_il": (c.aggiornato_il.isoformat() if c and c.aggiornato_il else None),
    }


class ChiusuraUpdate(BaseModel):
    relazione: Optional[str] = None
    consegne: Optional[str] = None
    foto_ids: Optional[List[int]] = None
    foto_copertina_id: Optional[int] = None
    committente_nome: Optional[str] = None
    direzione_lavori: Optional[str] = None
    responsabile_nome: Optional[str] = None
    data_ultimazione: Optional[date_today] = None


@chiusura_router.get("")
def leggi_chiusura(cantiere_id: int, db: Session = Depends(get_db), user: Utente = Depends(get_current_user)):
    if user.ruolo.value not in _RUOLI_CHIUSURA:
        raise HTTPException(403, "Sezione riservata allo staff interno")
    cantiere = db.query(Cantiere).filter(Cantiere.id == cantiere_id).first()
    if not cantiere:
        raise HTTPException(404, "Cantiere non trovato")

    from app.models.foto_cantiere import FotoCantiere
    c = _chiusura_get(db, cantiere_id)
    fasi = _fasi_cantiere(db, cantiere_id)
    foto = (db.query(FotoCantiere)
            .filter(FotoCantiere.cantiere_id == cantiere_id)
            .order_by(FotoCantiere.ordine.asc(), FotoCantiere.id.asc())
            .all())

    data_fine = (c.data_ultimazione if c and c.data_ultimazione else cantiere.data_fine_reale)
    out = _chiusura_dict(c, cantiere)

    # Se il verbale non è ancora stato compilato, pre-seleziona un set ragionevole di
    # foto (quelle già condivise col cliente, altrimenti le prime dell'archivio) così
    # il PDF non esce senza foto per dimenticanza.
    if not (c and c.foto_ids):
        suggerite = [f.id for f in foto if f.visibile_cliente] or [f.id for f in foto[:8]]
        out["foto_ids"] = suggerite
        if suggerite and not out.get("foto_copertina_id"):
            out["foto_copertina_id"] = suggerite[0]

    out["contesto"] = {
        "cantiere_nome": cantiere.nome,
        "oggetto": cantiere.nome,
        "indirizzo": ", ".join(x for x in [cantiere.indirizzo, cantiere.citta] if x)
                     + (f" ({cantiere.provincia})" if cantiere.provincia else ""),
        "stato_cantiere": cantiere.stato.value if hasattr(cantiere.stato, "value") else cantiere.stato,
        "data_inizio": cantiere.data_inizio.isoformat() if cantiere.data_inizio else None,
        "data_fine": data_fine.isoformat() if data_fine else None,
        "durata": _durata_lavori(cantiere.data_inizio, data_fine),
        "responsabile": (f"{cantiere.responsabile.nome} {cantiere.responsabile.cognome}".strip()
                         if cantiere.responsabile else None),
        "avanzamento": cantiere.avanzamento or 0,
        "n_fasi": len(fasi),
        "fasi": [{
            "id": f.id, "nome": f.nome, "periodo": _periodo_fase(f),
            "stato": _STATO_FASE_LABEL.get(
                f.stato.value if hasattr(f.stato, "value") else (f.stato or ""), "—"),
            "note": f.note or "",
        } for f in fasi],
        "foto": [{
            "id": f.id, "url": f.url, "nota": f.nota or "",
            "data": f.creato_il.date().isoformat() if f.creato_il else None,
        } for f in foto],
    }
    return out


@chiusura_router.put("")
def salva_chiusura(cantiere_id: int, body: ChiusuraUpdate,
                   db: Session = Depends(get_db), user: Utente = Depends(get_current_user)):
    if user.ruolo.value not in _RUOLI_CHIUSURA:
        raise HTTPException(403, "Sezione riservata allo staff interno")
    cantiere = db.query(Cantiere).filter(Cantiere.id == cantiere_id).first()
    if not cantiere:
        raise HTTPException(404, "Cantiere non trovato")

    from app.models.chiusura import ChiusuraCantiere
    from sqlalchemy.orm.attributes import flag_modified
    c = _chiusura_get(db, cantiere_id)
    if not c:
        c = ChiusuraCantiere(cantiere_id=cantiere_id, creato_da=user.id,
                             committente_nome=cantiere.cliente,
                             responsabile_nome=(f"{cantiere.responsabile.nome} {cantiere.responsabile.cognome}".strip()
                                                if cantiere.responsabile else None))
        db.add(c)

    dati = body.model_dump(exclude_unset=True)
    for campo, val in dati.items():
        setattr(c, campo, val)
    if "foto_ids" in dati:
        flag_modified(c, "foto_ids")
    db.commit()
    db.refresh(c)
    return _chiusura_dict(c, cantiere)


@chiusura_router.post("/genera-bozza")
def genera_bozza_relazione(cantiere_id: int, db: Session = Depends(get_db), user: Utente = Depends(get_current_user)):
    """Compila una BOZZA della descrizione lavori pescando da diario, fasi Gantt e
    rapportini. Non salva nulla: il testo torna al frontend per la revisione."""
    if user.ruolo.value not in _RUOLI_CHIUSURA:
        raise HTTPException(403, "Sezione riservata allo staff interno")
    if not settings.ANTHROPIC_API_KEY:
        raise HTTPException(503, "Servizio AI non configurato")
    cantiere = db.query(Cantiere).filter(Cantiere.id == cantiere_id).first()
    if not cantiere:
        raise HTTPException(404, "Cantiere non trovato")

    fasi = _fasi_cantiere(db, cantiere_id)
    diari = (db.query(DiarioGiornaliero)
             .filter(DiarioGiornaliero.cantiere_id == cantiere_id)
             .order_by(DiarioGiornaliero.data.asc()).all())

    righe_fasi = "\n".join(
        f"- {f.nome} ({_periodo_fase(f)}) — "
        f"{_STATO_FASE_LABEL.get(f.stato.value if hasattr(f.stato,'value') else (f.stato or ''), '')}"
        + (f"; {f.note}" if f.note else "")
        for f in fasi) or "(nessuna fase registrata)"

    estratti = []
    for d in diari:
        testo = (d.attivita or "").strip()
        if testo:
            estratti.append(f"[{d.data.strftime('%d/%m/%Y')}] {testo}")
    righe_diario = "\n".join(estratti[:80]) or "(nessuna nota di diario)"

    import anthropic
    claude = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
    prompt = f"""Sei un tecnico di un'impresa edile italiana specializzata in costruzioni Light Steel Frame (LSF).
Devi scrivere la sezione "DESCRIZIONE DEI LAVORI ESEGUITI" di un VERBALE DI CHIUSURA CANTIERE.
È un documento relazionale e formale destinato al committente e alla direzione lavori — NON è un documento contabile: non citare importi, prezzi, costi o margini.

DATI DEL CANTIERE
Oggetto: {cantiere.nome}
Committente: {cantiere.cliente}
Ubicazione: {", ".join(x for x in [cantiere.indirizzo, cantiere.citta] if x)}
Inizio lavori: {_data_estesa(cantiere.data_inizio)}
Fine lavori: {_data_estesa(cantiere.data_fine_reale)}

FASI DEL CRONOPROGRAMMA
{righe_fasi}

NOTE DAL DIARIO DI CANTIERE (in ordine cronologico)
{righe_diario}

ISTRUZIONI
- Scrivi in italiano tecnico ma scorrevole, in terza persona ("i lavori hanno riguardato...", "si è proceduto con...").
- 3-5 paragrafi, ognuno separato da una riga vuota. Nessun elenco puntato, nessun titolo.
- Ricostruisci il racconto complessivo dell'opera: fondazioni, struttura, involucro, coperture, impianti, finiture, consegna — usando quello che emerge dai dati.
- Se un'informazione non c'è, non inventarla: resta sul generale.
- Chiudi con una frase sul rispetto del cronoprogramma e sull'esito positivo delle verifiche finali, solo se coerente con i dati.
- Rispondi SOLO con il testo della relazione, senza premesse né commenti."""

    testo = None
    for modello in ("claude-sonnet-4-6", "claude-haiku-4-5-20251001"):
        try:
            msg = claude.messages.create(
                model=modello, max_tokens=1600,
                messages=[{"role": "user", "content": prompt}],
            )
            testo = msg.content[0].text.strip()
            break
        except Exception:
            continue
    if not testo:
        raise HTTPException(502, "Errore nella generazione della bozza")
    return {"relazione": testo}


@chiusura_router.post("/conferma")
def conferma_chiusura(cantiere_id: int, db: Session = Depends(get_db), user: Utente = Depends(get_current_user)):
    """Marca il verbale come definitivo e chiude il cantiere (stato = completato,
    data fine reale = data di ultimazione del verbale)."""
    if user.ruolo.value not in _RUOLI_CHIUSURA:
        raise HTTPException(403, "Sezione riservata allo staff interno")
    cantiere = db.query(Cantiere).filter(Cantiere.id == cantiere_id).first()
    if not cantiere:
        raise HTTPException(404, "Cantiere non trovato")
    c = _chiusura_get(db, cantiere_id)
    if not c or not (c.relazione or "").strip():
        raise HTTPException(400, "Compila la relazione prima di confermare la chiusura")

    if not c.numero:
        anno = (c.data_ultimazione or date_today.today()).year
        from app.models.chiusura import ChiusuraCantiere
        n = db.query(ChiusuraCantiere).filter(
            ChiusuraCantiere.numero.isnot(None),
            ChiusuraCantiere.numero.like(f"{anno} /%")).count()
        c.numero = f"{anno} / {n + 1:03d}"
    c.stato = "definitivo"

    data_fine = c.data_ultimazione or date_today.today()
    c.data_ultimazione = data_fine
    from app.models.cantiere import StatoCantiere
    cantiere.stato = StatoCantiere.completato
    cantiere.data_fine_reale = data_fine
    if not (cantiere.avanzamento or 0) >= 100:
        cantiere.avanzamento = 100.0
    db.commit()
    db.refresh(c)
    try:
        notifica_cantiere(db, cantiere_id,
            ruoli=["admin", "amministrazione", "direzione_lavori"],
            titolo="🏁 Cantiere chiuso",
            corpo=f"{cantiere.nome}: verbale di chiusura n. {c.numero} confermato da {user.nome} {user.cognome}",
            escludi_id=user.id,
            url=f"/cantieri/{cantiere_id}#chiusura",
        )
    except Exception:
        pass
    return _chiusura_dict(c, cantiere)


@chiusura_router.post("/genera-pdf")
def genera_verbale_pdf(cantiere_id: int, db: Session = Depends(get_db), user: Utente = Depends(get_current_user)):
    if user.ruolo.value not in _RUOLI_CHIUSURA:
        raise HTTPException(403, "Sezione riservata allo staff interno")
    cantiere = db.query(Cantiere).filter(Cantiere.id == cantiere_id).first()
    if not cantiere:
        raise HTTPException(404, "Cantiere non trovato")
    c = _chiusura_get(db, cantiere_id)
    if not c:
        raise HTTPException(400, "Verbale non ancora compilato")

    from xml.sax.saxutils import escape
    from reportlab.lib.pagesizes import A4
    from reportlab.lib import colors
    from reportlab.lib.units import mm
    from reportlab.lib.utils import ImageReader
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.platypus import (SimpleDocTemplate, Table, TableStyle, Paragraph,
                                    Spacer, HRFlowable, Image as RLImage, KeepTogether, PageBreak)
    from app import pdf_theme as T
    from app.routers.economico import PDF_BRAND
    from app.models.foto_cantiere import FotoCantiere
    from app.storage import leggi_file

    T.register_fonts()
    _F, _FB = T.FONT, T.FONT_BD
    PRIMARIO, SCURO = T.palette()
    GRIGIO   = T.BG_SOFT
    MUTED    = T.MUTED

    styles = getSampleStyleSheet()
    st_brand   = ParagraphStyle("cv_brand", parent=styles["Normal"], fontName=_FB, fontSize=16, textColor=SCURO, leading=18)
    st_brand_s = ParagraphStyle("cv_brand_s", parent=styles["Normal"], fontName=_F, fontSize=7.5, textColor=MUTED, leading=10)
    st_eyebrow = ParagraphStyle("cv_eyebrow", parent=styles["Normal"], fontName=_FB, fontSize=8.5, textColor=PRIMARIO, leading=12, spaceAfter=2)
    st_title   = ParagraphStyle("cv_title", parent=styles["Heading1"], fontName=_FB, fontSize=25, textColor=SCURO, leading=28, spaceBefore=6, spaceAfter=4)
    st_h2      = ParagraphStyle("cv_h2", parent=styles["Heading2"], fontName=T.FONT_SB, fontSize=14, textColor=SCURO, leading=18, spaceBefore=2, spaceAfter=8)
    st_body    = ParagraphStyle("cv_body", parent=styles["Normal"], fontName=_F, fontSize=10, leading=15, spaceAfter=7, alignment=4)
    st_label   = ParagraphStyle("cv_label", parent=styles["Normal"], fontName=T.FONT_SB, fontSize=7.5, textColor=MUTED, leading=11)
    st_val     = ParagraphStyle("cv_val", parent=styles["Normal"], fontName=_F, fontSize=10, textColor=SCURO, leading=13)
    st_meta    = ParagraphStyle("cv_meta", parent=styles["Normal"], fontName=_F, fontSize=8.5, textColor=MUTED, leading=11)
    st_cell    = ParagraphStyle("cv_cell", parent=styles["Normal"], fontName=_F, fontSize=8.5, leading=11, textColor=SCURO)
    st_cellh   = ParagraphStyle("cv_cellh", parent=styles["Normal"], fontName=T.FONT_SB, fontSize=7.5, textColor=SCURO, leading=10)
    st_cap     = ParagraphStyle("cv_cap", parent=styles["Normal"], fontName=_F, fontSize=8, textColor=MUTED, leading=10, spaceBefore=3)
    st_sign    = ParagraphStyle("cv_sign", parent=styles["Normal"], fontName=_F, fontSize=8, textColor=MUTED, leading=11)
    st_signb   = ParagraphStyle("cv_signb", parent=styles["Normal"], fontName=T.FONT_SB, fontSize=8.5, textColor=SCURO, leading=11)

    data_fine = c.data_ultimazione or cantiere.data_fine_reale
    committente = c.committente_nome or cantiere.cliente or "—"
    indirizzo = ", ".join(x for x in [cantiere.indirizzo, cantiere.citta] if x)
    if cantiere.provincia:
        indirizzo += f" ({cantiere.provincia})"
    numero = c.numero or "bozza"

    # Logo aziendale per l'intestazione (stesso file dei preventivi); testo di ripiego
    _logo_path = PDF_BRAND.get("logo")
    _logo_reader = None
    if _logo_path and os.path.exists(_logo_path):
        try:
            _logo_reader = ImageReader(_logo_path)
        except Exception:
            _logo_reader = None

    def _brand_cell():
        if _logo_reader:
            try:
                iw, ih = _logo_reader.getSize()
                h = PDF_BRAND.get("logo_altezza_mm", 16) * mm
                img = RLImage(_logo_path, width=iw * h / ih, height=h)
                img.hAlign = "LEFT"
                return img
            except Exception:
                pass
        return Table([[Paragraph(PDF_BRAND["nome"], st_brand)],
                      [Paragraph(PDF_BRAND["sottotitolo"], st_brand_s)]], style=[
            ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0),
            ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 1)])

    def masthead(pag, tot):
        tab = Table([[
            _brand_cell(),
            Paragraph(f"Verbale n. <b>{escape(numero)}</b><br/>Cantiere <b>{escape(cantiere.nome or '')}</b>", st_meta),
        ]], colWidths=["58%", "42%"])
        tab.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("ALIGN", (1, 0), (1, 0), "RIGHT"),
            ("LINEBELOW", (0, 0), (-1, -1), 1.4, SCURO),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ]))
        return tab

    def footer(pag, tot):
        t = Table([[Paragraph(escape(PDF_BRAND["ragione_sociale"]), st_meta),
                    Paragraph(f"Pag. {pag} / {tot}", st_meta)]], colWidths=["70%", "30%"])
        t.setStyle(TableStyle([
            ("LINEABOVE", (0, 0), (-1, -1), 0.5, colors.lightgrey),
            ("ALIGN", (1, 0), (1, 0), "RIGHT"),
            ("TOPPADDING", (0, 0), (-1, -1), 6),
        ]))
        return t

    def foto_flowable(fid, larghezza, altezza_max):
        f = db.query(FotoCantiere).filter(FotoCantiere.id == fid,
                                          FotoCantiere.cantiere_id == cantiere_id).first()
        if not f:
            return None, None
        try:
            contenuto, _ = leggi_file(_chiave_da_url_foto(f.url))
            buf_img, iw, ih = _foto_ridotta_per_pdf(contenuto, larghezza_max_px=900)
            h = min(larghezza * ih / iw, altezza_max) if iw else altezza_max
            w = h * iw / ih if ih else larghezza
            return RLImage(buf_img, width=w, height=h), f
        except Exception:
            return None, f

    TOT_PAG = 5
    story = []

    # ── Pag 1 — Copertina ──────────────────────────────────────────────
    story.append(masthead(1, TOT_PAG))
    story.append(Spacer(1, 22*mm))
    story.append(Paragraph("DOCUMENTO DI FINE LAVORI", st_eyebrow))
    story.append(Paragraph("Verbale di chiusura del cantiere", st_title))
    story.append(HRFlowable(width=56, thickness=2, color=PRIMARIO, spaceBefore=4, spaceAfter=16))

    meta_rows = [
        [Paragraph("OGGETTO", st_label), Paragraph(escape(cantiere.nome or "—"), st_val)],
        [Paragraph("COMMITTENTE", st_label), Paragraph(escape(committente), st_val)],
        [Paragraph("UBICAZIONE", st_label), Paragraph(escape(indirizzo or "—"), st_val)],
        [Paragraph("ULTIMAZIONE LAVORI", st_label), Paragraph(_data_estesa(data_fine), st_val)],
    ]
    mt = Table(meta_rows, colWidths=[42*mm, "*"])
    mt.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), GRIGIO),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.white),
        ("TOPPADDING", (0, 0), (-1, -1), 8), ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("LEFTPADDING", (0, 0), (-1, -1), 10), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    story.append(mt)
    story.append(Spacer(1, 10*mm))

    if c.foto_copertina_id:
        img, _f = foto_flowable(c.foto_copertina_id, 170*mm, 90*mm)
        if img:
            img.hAlign = "CENTER"
            story.append(img)
    story.append(Spacer(1, 12*mm))
    story.append(footer(1, TOT_PAG))
    story.append(PageBreak())

    # ── Pag 2 — Dati generali + Descrizione ────────────────────────────
    story.append(masthead(2, TOT_PAG))
    story.append(Spacer(1, 8*mm))
    story.append(Paragraph("01 · DATI GENERALI", st_eyebrow))
    story.append(Paragraph("Identificazione del cantiere", st_h2))

    resp = c.responsabile_nome or (f"{cantiere.responsabile.nome} {cantiere.responsabile.cognome}".strip()
                                   if cantiere.responsabile else "—")
    dati_rows = [
        ("Committente", committente),
        ("Oggetto dei lavori", cantiere.nome or "—"),
        ("Ubicazione", indirizzo or "—"),
        ("Inizio lavori", _data_estesa(cantiere.data_inizio)),
        ("Ultimazione lavori", _data_estesa(data_fine)),
        ("Durata effettiva", _durata_lavori(cantiere.data_inizio, data_fine)),
        ("Responsabile di cantiere", resp),
        ("Direzione lavori", c.direzione_lavori or "—"),
        ("Impresa esecutrice", PDF_BRAND["ragione_sociale"]),
    ]
    dt = Table([[Paragraph(k.upper(), st_label), Paragraph(escape(str(v)), st_val)] for k, v in dati_rows],
               colWidths=[50*mm, "*"])
    dt.setStyle(TableStyle([
        ("LINEABOVE", (0, 0), (-1, 0), 1.4, SCURO),
        ("LINEBELOW", (0, 0), (-1, -1), 0.5, colors.HexColor("#E6E0D6")),
        ("TOPPADDING", (0, 0), (-1, -1), 7), ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    story.append(dt)
    story.append(Spacer(1, 10*mm))

    story.append(Paragraph("02 · RELAZIONE", st_eyebrow))
    story.append(Paragraph("Descrizione dei lavori eseguiti", st_h2))
    testo_rel = (c.relazione or "").strip() or "—"
    for para in testo_rel.split("\n"):
        if para.strip():
            story.append(Paragraph(escape(para.strip()), st_body))
    story.append(Spacer(1, 6*mm))
    story.append(footer(2, TOT_PAG))
    story.append(PageBreak())

    # ── Pag 3 — Riepilogo lavorazioni ─────────────────────────────────
    story.append(masthead(3, TOT_PAG))
    story.append(Spacer(1, 8*mm))
    story.append(Paragraph("03 · CRONOLOGIA", st_eyebrow))
    story.append(Paragraph("Riepilogo delle lavorazioni", st_h2))

    fasi = _fasi_cantiere(db, cantiere_id)
    durata_gg = ((data_fine - cantiere.data_inizio).days
                 if (data_fine and cantiere.data_inizio and data_fine >= cantiere.data_inizio) else None)
    synth = Table([[
        Paragraph(f"<b>{len(fasi)}</b>", st_val), Paragraph(f"<b>{durata_gg if durata_gg is not None else '—'}</b>", st_val),
        Paragraph(f"<b>{int(cantiere.avanzamento or 0)}%</b>", st_val),
    ], [
        Paragraph("FASI DI LAVORO", st_label), Paragraph("GIORNI", st_label), Paragraph("AVANZAMENTO", st_label),
    ]], colWidths=["33%", "33%", "34%"])
    synth.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), GRIGIO),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.white),
        ("TOPPADDING", (0, 0), (-1, -1), 7), ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ("LEFTPADDING", (0, 0), (-1, -1), 12),
    ]))
    story.append(synth)
    story.append(Spacer(1, 8*mm))

    if fasi:
        rows = [[Paragraph("LAVORAZIONE", st_cellh), Paragraph("PERIODO", st_cellh),
                 Paragraph("ESITO", st_cellh), Paragraph("NOTE", st_cellh)]]
        for f in fasi:
            rows.append([
                Paragraph(escape(f.nome or ""), st_cell),
                Paragraph(_periodo_fase(f), st_cell),
                Paragraph(_STATO_FASE_LABEL.get(f.stato.value if hasattr(f.stato, "value") else (f.stato or ""), "—"), st_cell),
                Paragraph(escape(f.note or "—"), st_cell),
            ])
        wt = Table(rows, colWidths=[55*mm, 28*mm, 25*mm, "*"], repeatRows=1)
        wt.setStyle(TableStyle([
            ("LINEBELOW", (0, 0), (-1, 0), 1.4, PRIMARIO),
            ("LINEBELOW", (0, 1), (-1, -1), 0.5, colors.HexColor("#E6E0D6")),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#FBFAF8")]),
            ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ("LEFTPADDING", (0, 0), (-1, -1), 4), ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ]))
        story.append(wt)
    else:
        story.append(Paragraph("Nessuna fase registrata nel cronoprogramma.", st_meta))
    story.append(Spacer(1, 6*mm))
    story.append(footer(3, TOT_PAG))
    story.append(PageBreak())

    # ── Pag 4 — Documentazione fotografica ────────────────────────────
    story.append(masthead(4, TOT_PAG))
    story.append(Spacer(1, 8*mm))
    story.append(Paragraph("04 · ALLEGATO FOTOGRAFICO", st_eyebrow))
    story.append(Paragraph("Documentazione fotografica", st_h2))

    foto_ids = [fid for fid in (c.foto_ids or [])]
    if foto_ids:
        cella_w = 82*mm
        celle = []
        for i, fid in enumerate(foto_ids, 1):
            img, f = foto_flowable(fid, cella_w, 62*mm)
            if not img:
                continue
            cap = f.nota or ""
            data_f = f.creato_il.date().strftime("%d.%m.%Y") if f and f.creato_il else ""
            testo_cap = f"<b>{i:02d}</b>  " + escape(" — ".join(x for x in [cap, data_f] if x) or "Foto di cantiere")
            celle.append([img, Paragraph(testo_cap, st_cap)])
        righe = []
        for j in range(0, len(celle), 2):
            coppia = celle[j:j + 2]
            riga_img = [coppia[0][0], coppia[1][0] if len(coppia) > 1 else ""]
            riga_cap = [coppia[0][1], coppia[1][1] if len(coppia) > 1 else ""]
            righe.append(riga_img)
            righe.append(riga_cap)
        if righe:
            ft = Table(righe, colWidths=[cella_w, cella_w])
            ft.setStyle(TableStyle([
                ("ALIGN", (0, 0), (-1, -1), "LEFT"), ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("TOPPADDING", (0, 0), (-1, -1), 2), ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
                ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 8),
            ]))
            story.append(ft)
        else:
            story.append(Paragraph("Impossibile caricare le foto selezionate.", st_meta))
    else:
        story.append(Paragraph("Nessuna foto selezionata per il verbale.", st_meta))
    story.append(Spacer(1, 6*mm))
    story.append(footer(4, TOT_PAG))
    story.append(PageBreak())

    # ── Pag 5 — Dichiarazione e firme ────────────────────────────────
    story.append(masthead(5, TOT_PAG))
    story.append(Spacer(1, 8*mm))
    story.append(Paragraph("05 · CHIUSURA", st_eyebrow))
    story.append(Paragraph("Dichiarazione di ultimazione", st_h2))

    decl = (f"Si dà atto che in data <b>{_data_estesa(data_fine)}</b> i lavori descritti nel presente "
            f"verbale risultano <b>ultimati a regola d'arte</b>, conformi al progetto e alle disposizioni "
            f"impartite dalla Direzione Lavori. Il cantiere viene formalmente chiuso e l'opera consegnata "
            f"al Committente.")
    dcl = Table([[Paragraph(decl, st_val)]], colWidths=["*"])
    dcl.setStyle(TableStyle([
        ("LINEBEFORE", (0, 0), (0, -1), 2.5, PRIMARIO),
        ("LEFTPADDING", (0, 0), (-1, -1), 12), ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(dcl)
    story.append(Spacer(1, 8*mm))

    if (c.consegne or "").strip():
        story.append(Paragraph("CONSEGNE AL COMMITTENTE", st_eyebrow))
        story.append(Paragraph(escape(c.consegne.strip()), st_val))
        story.append(Spacer(1, 14*mm))
    else:
        story.append(Spacer(1, 8*mm))

    firme = Table([[
        Paragraph("L'IMPRESA ESECUTRICE", st_sign), Paragraph("LA DIREZIONE LAVORI", st_sign),
        Paragraph("IL COMMITTENTE", st_sign),
    ], [
        Paragraph(escape(PDF_BRAND["ragione_sociale"]), st_signb),
        Paragraph(escape(c.direzione_lavori or "—"), st_signb),
        Paragraph(escape(committente), st_signb),
    ]], colWidths=["34%", "33%", "33%"])
    firme.setStyle(TableStyle([
        ("LINEABOVE", (0, 0), (-1, 0), 1, SCURO),
        ("TOPPADDING", (0, 0), (-1, 0), 6), ("TOPPADDING", (0, 1), (-1, 1), 2),
        ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 14),
    ]))
    story.append(Spacer(1, 30*mm))
    story.append(firme)
    story.append(Spacer(1, 8*mm))
    story.append(footer(5, TOT_PAG))

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=16*mm, rightMargin=16*mm,
                            topMargin=14*mm, bottomMargin=14*mm,
                            title=f"Verbale chiusura — {cantiere.nome}")
    doc.build(story)
    buf.seek(0)

    nome_file = f"verbale_chiusura_{(cantiere.nome or 'cantiere').replace(' ', '_')}.pdf"
    from fastapi.responses import StreamingResponse
    return StreamingResponse(buf, media_type="application/pdf",
                             headers={"Content-Disposition": f'attachment; filename="{nome_file}"'})
