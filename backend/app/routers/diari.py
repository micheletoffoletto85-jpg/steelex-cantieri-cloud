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
    # Se il diario ha voci_estratte vuote ma viene da un rapportino, esponi le ore
    if not out.get("voci_estratte"):
        from app.models.rapportino import RapportinoOperativo
        rap = None
        try:
            from sqlalchemy.orm import object_session
            sess = object_session(d)
            if sess:
                rap = sess.query(RapportinoOperativo).filter(RapportinoOperativo.diario_id == d.id).first()
        except Exception:
            pass
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
    from reportlab.lib.pagesizes import A4
    from reportlab.lib import colors
    from reportlab.lib.units import mm
    from reportlab.lib.utils import ImageReader
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.platypus import (SimpleDocTemplate, Table, TableStyle, Paragraph,
                                     Spacer, HRFlowable, Image as RLImage, KeepTogether)
    from app.routers.economico import PDF_BRAND
    from app.storage import leggi_file

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4,
                            leftMargin=15*mm, rightMargin=15*mm,
                            topMargin=15*mm, bottomMargin=18*mm)

    PRIMARIO = colors.HexColor(PDF_BRAND["colore_primario"])
    SCURO    = colors.HexColor(PDF_BRAND["colore_scuro"])
    GRIGIO   = colors.HexColor("#F5F5F5")

    styles = getSampleStyleSheet()
    style_titolo = ParagraphStyle("titolo_rel", parent=styles["Heading1"], textColor=PRIMARIO, fontSize=18, spaceAfter=2)
    style_sub = ParagraphStyle("sub_rel", parent=styles["Normal"], textColor=SCURO, fontSize=10)
    style_label = ParagraphStyle("label_rel", parent=styles["Normal"], textColor=SCURO, fontSize=9, fontName="Helvetica-Bold")
    style_giorno = ParagraphStyle("giorno_rel", parent=styles["Heading2"], textColor=SCURO, fontSize=13, spaceAfter=2, spaceBefore=8)
    style_meta = ParagraphStyle("meta_rel", parent=styles["Normal"], fontSize=8.5, textColor=colors.grey, spaceAfter=4)
    style_testo = ParagraphStyle("testo_rel", parent=styles["Normal"], fontSize=9.5, leading=13, spaceAfter=4)
    style_small = ParagraphStyle("small_rel", parent=styles["Normal"], fontSize=8, textColor=colors.grey)
    style_extra = ParagraphStyle("extra_rel", parent=styles["Normal"], fontSize=9, textColor=PRIMARIO,
                                  fontName="Helvetica-Bold", spaceAfter=4)
    style_cella = ParagraphStyle("cella_rel", parent=styles["Normal"], fontSize=8, leading=10, textColor=SCURO)

    story = []

    # Intestazione aziendale — stesso brand usato per i preventivi
    logo_path = PDF_BRAND["logo"]
    if os.path.exists(logo_path):
        try:
            iw, ih = ImageReader(logo_path).getSize()
            h = PDF_BRAND["logo_altezza_mm"] * mm
            img = RLImage(logo_path, width=iw * h / ih, height=h)
            img.hAlign = "LEFT"
            story.append(img)
        except Exception:
            story.append(Paragraph(PDF_BRAND["nome"], style_titolo))
    else:
        story.append(Paragraph(PDF_BRAND["nome"], style_titolo))
    story.append(Paragraph(PDF_BRAND["sottotitolo"], style_sub))
    story.append(Spacer(1, 2*mm))
    story.append(HRFlowable(width="100%", thickness=2, color=PRIMARIO, spaceAfter=6))

    story.append(Paragraph("RELAZIONE LAVORI", style_titolo))
    data_min = diari[0].data.strftime("%d/%m/%Y")
    data_max = diari[-1].data.strftime("%d/%m/%Y")
    periodo = data_min if data_min == data_max else f"dal {data_min} al {data_max}"
    info_data = [
        [Paragraph(f"<b>Cantiere:</b> {escape(cantiere.nome or '')}", style_label),
         Paragraph(f"<b>Periodo:</b> {periodo}", style_label)],
    ]
    if cantiere.cliente:
        info_data.append([Paragraph(f"<b>Cliente:</b> {escape(cantiere.cliente)}", style_label),
                           Paragraph(f"<b>Data emissione:</b> {date_today.today().strftime('%d/%m/%Y')}", style_label)])
    indirizzo = ", ".join(x for x in [cantiere.indirizzo, cantiere.citta] if x)
    if indirizzo:
        info_data.append([Paragraph(f"<b>Indirizzo:</b> {escape(indirizzo)}", style_label), ""])
    info_table = Table(info_data, colWidths=["55%", "45%"])
    info_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), GRIGIO),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.lightgrey),
    ]))
    story.append(Spacer(1, 3*mm))
    story.append(info_table)
    story.append(Spacer(1, 6*mm))

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
            story.append(Paragraph(f"⚠ LAVORAZIONE EXTRA PREVENTIVO{nota_extra}", style_extra))

        testo = (d.attivita or "").strip()
        for para in testo.split("\n"):
            if para.strip():
                story.append(Paragraph(escape(para), style_testo))
        if d.problemi:
            story.append(Paragraph(f"<b>Criticità:</b> {escape(d.problemi)}", style_testo))

        # Ore lavorate registrate per questa nota — filtrate a extra preventivo se la
        # relazione ne contiene almeno una (vedi sopra)
        ore_rows = tutte_le_ore.get(d.id, [])
        if solo_extra_preventivo:
            ore_rows = [o for o in ore_rows if o.extra_preventivo]
        if ore_rows:
            # Celle come Paragraph, non stringhe nude: reportlab non va a capo il testo
            # dentro una Table se il contenuto è una stringa semplice, solo se è un
            # Flowable — con nomi/attività lunghe il testo sbordava dalla colonna.
            tabella_ore = [["Operaio", "Ore", "Attività"]]
            for o in ore_rows:
                tot_ore += o.ore or 0
                tabella_ore.append([
                    Paragraph(escape(o.operaio_nome or ""), style_cella),
                    f"{o.ore:g}h",
                    Paragraph(escape(o.attivita or ""), style_cella),
                ])
            t = Table(tabella_ore, colWidths=[45*mm, 15*mm, 105*mm])
            t.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), SCURO),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTSIZE", (0, 0), (-1, -1), 8),
                ("GRID", (0, 0), (-1, -1), 0.3, colors.lightgrey),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("TOPPADDING", (0, 0), (-1, -1), 3),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ]))
            story.append(Spacer(1, 2*mm))
            story.append(t)

        story.append(Spacer(1, 3*mm))

        # Report fotografico — griglia 3 per riga
        foto_urls = d.foto_urls or []
        if foto_urls:
            tot_foto += len(foto_urls)
            cella_w = 55*mm
            righe_foto, riga = [], []
            for url in foto_urls:
                try:
                    contenuto, _ = leggi_file(_chiave_da_url_foto(url))
                    img_buf = io.BytesIO(contenuto)
                    iw, ih = ImageReader(img_buf).getSize()
                    img_buf.seek(0)
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
    story.append(HRFlowable(width="100%", thickness=1, color=colors.lightgrey))
    story.append(Spacer(1, 3*mm))
    n_extra = sum(1 for d in diari if d.extra_preventivo)
    etichetta_ore = "Totale ore extra preventivo" if solo_extra_preventivo else "Totale ore lavorate"
    riepilogo = [
        [Paragraph("<b>Giorni relazionati</b>", style_label), Paragraph(str(len(diari)), style_label)],
        [Paragraph(f"<b>{etichetta_ore}</b>", style_label), Paragraph(f"{tot_ore:g}h" if tot_ore else "—", style_label)],
        [Paragraph("<b>Foto allegate</b>", style_label), Paragraph(str(tot_foto), style_label)],
    ]
    if n_extra:
        riepilogo.append([Paragraph("<b>Di cui extra preventivo</b>", style_label), Paragraph(str(n_extra), style_label)])
    riep_table = Table(riepilogo, colWidths=["60%", "40%"])
    riep_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), GRIGIO),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.lightgrey),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(riep_table)
    story.append(Spacer(1, 8*mm))

    # Firma
    firma_data = [
        [Paragraph("Per presa visione:", style_label), Paragraph(PDF_BRAND["ragione_sociale"], style_label)],
        [Paragraph("_" * 35, style_small), Paragraph("_" * 35, style_small)],
        [Paragraph("Timbro e firma cliente", style_small), Paragraph("Firma", style_small)],
    ]
    firma_table = Table(firma_data, colWidths=["50%", "50%"])
    story.append(firma_table)

    doc.build(story)
    buf.seek(0)

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
