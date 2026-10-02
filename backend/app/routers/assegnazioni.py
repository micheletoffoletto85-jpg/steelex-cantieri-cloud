from datetime import date, timedelta
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.database import get_db
from app.models.assegnazione import AssegnazioneOperatore
from app.models.artigiano import Artigiano
from app.models.cantiere import Cantiere
from app.models.utente import Utente
from app.auth import get_current_user

router = APIRouter(prefix="/assegnazioni", tags=["Assegnazioni"])

RUOLI_ADMIN = {"admin", "capo_cantiere", "capo_cantiere_sub", "amministrazione", "direzione_lavori"}
RUOLI_OPERATIVI = {"artigiano", "capo_cantiere", "capo_cantiere_sub"}
# Ruoli ufficio: non lavorano in cantiere ma vanno comunque nel Gantt per segnare
# ferie / permessi / corsi (prima non comparivano e non era possibile registrarle)
RUOLI_UFFICIO = {"admin", "amministrazione"}

# Programmazione libera: attività fuori cantiere
TIPI_ASSEGNAZIONE = {"cantiere", "ferie", "corso", "permesso", "altro"}


def _dict(a: AssegnazioneOperatore) -> dict:
    if a.artigiano_id:
        nome = f"{a.artigiano.nome} {a.artigiano.cognome}" if a.artigiano else None
    elif a.utente_id:
        nome = f"{a.utente.nome} {a.utente.cognome}" if a.utente else None
    else:
        nome = None
    return {
        "id": a.id,
        "artigiano_id": a.artigiano_id,
        "utente_id": a.utente_id,
        "nome": nome,
        "data": a.data.isoformat() if a.data else None,
        "turno": a.turno,
        "tipo": a.tipo or "cantiere",
        "cantiere_id": a.cantiere_id,
        "cantiere_nome": a.cantiere.nome if a.cantiere else None,
        "lavorazione": a.lavorazione,
        "note": a.note,
    }


@router.get("/operatori")
def lista_operatori(
    db: Session = Depends(get_db),
    user: Utente = Depends(get_current_user),
):
    """Lista unificata: artigiani attivi + utenti operativi interni."""
    if user.ruolo not in RUOLI_ADMIN:
        raise HTTPException(403)
    return _lista_operatori(db)


def _lista_operatori(db: Session) -> list:
    """Righe del Gantt: artigiani attivi, poi interni operativi, poi ufficio."""
    artigiani = (
        db.query(Artigiano)
        .filter(Artigiano.attivo == True)
        .order_by(Artigiano.cognome, Artigiano.nome)
        .all()
    )
    # ID utenti già presenti in rubrica artigiani → non duplicare
    utenti_in_rubrica = {a.utente_id for a in artigiani if a.utente_id}
    utenti_op = (
        db.query(Utente)
        .filter(
            Utente.ruolo.in_(list(RUOLI_OPERATIVI)),
            Utente.attivo == True,
            ~Utente.id.in_(utenti_in_rubrica) if utenti_in_rubrica else True,
        )
        .order_by(Utente.cognome, Utente.nome)
        .all()
    )
    utenti_ufficio = (
        db.query(Utente)
        .filter(
            Utente.ruolo.in_(list(RUOLI_UFFICIO)),
            Utente.attivo == True,
            ~Utente.id.in_(utenti_in_rubrica) if utenti_in_rubrica else True,
        )
        .order_by(Utente.cognome, Utente.nome)
        .all()
    )

    result = []
    for a in artigiani:
        result.append({
            "tipo": "artigiano",
            "id": a.id,
            "nome": f"{a.nome} {a.cognome}",
            "azienda": a.azienda,
            "categoria": a.categoria,
        })
    for u in utenti_op:
        result.append({
            "tipo": "utente",
            "id": u.id,
            "nome": f"{u.nome} {u.cognome}",
            "azienda": None,
            "categoria": u.ruolo.replace("_", " "),
        })
    for u in utenti_ufficio:
        # stesso tipo "utente" degli operativi interni (così assMap/payload/impegnati
        # funzionano senza casi speciali) — la categoria li distingue in UI
        result.append({
            "tipo": "utente",
            "id": u.id,
            "nome": f"{u.nome} {u.cognome}",
            "azienda": None,
            "categoria": u.ruolo.replace("_", " "),
        })
    return result


@router.get("")
def lista_assegnazioni(
    anno: Optional[int] = None,
    mese: Optional[int] = None,
    data_inizio: Optional[date] = None,
    data_fine: Optional[date] = None,
    db: Session = Depends(get_db),
    user: Utente = Depends(get_current_user),
):
    if user.ruolo not in RUOLI_ADMIN:
        raise HTTPException(403)
    if data_inizio and data_fine:
        primo, ultimo = data_inizio, data_fine
    elif anno and mese:
        from calendar import monthrange
        primo = date(anno, mese, 1)
        ultimo = date(anno, mese, monthrange(anno, mese)[1])
    else:
        raise HTTPException(422, "Specificare anno+mese oppure data_inizio+data_fine")
    rows = (
        db.query(AssegnazioneOperatore)
        .filter(AssegnazioneOperatore.data >= primo, AssegnazioneOperatore.data <= ultimo)
        .all()
    )
    return [_dict(r) for r in rows]


# ── Export PDF ────────────────────────────────────────────────────────────────
# Stessa palette del Gantt a video (GanttOperatoriPage.jsx): colore per id cantiere
PALETTE_CANTIERI = [
    "#FF6B00", "#3b82f6", "#22c55e", "#a855f7", "#f59e0b",
    "#06b6d4", "#ec4899", "#64748b", "#84cc16", "#f97316",
    "#6366f1", "#14b8a6", "#e11d48", "#0ea5e9", "#8b5cf6",
]
TIPI_LIBERI_PDF = {
    "ferie":    ("Ferie",    "FER", "#eab308"),
    "corso":    ("Corso",    "COR", "#7c3aed"),
    "permesso": ("Permesso", "PRM", "#db2777"),
    "altro":    ("Altro",    "ALT", "#475569"),
}
MESI_IT = ["", "gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio",
           "agosto", "settembre", "ottobre", "novembre", "dicembre"]
GIORNI_BREVI = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"]


def sigle_cantieri(cantieri: dict) -> dict:
    """{id: nome} -> {id: sigla} univoche. Stessa regola del frontend (siglePerCantieri):
    prime 3 lettere; se doppione, 2 lettere + iniziale della seconda parola, poi numero."""
    out, usate = {}, set()
    for cid in sorted(cantieri):
        nome = (cantieri[cid] or "").strip()
        parole = "".join(ch if ch.isalnum() else " " for ch in nome).split()
        base = (parole[0][:3] if parole else "CAN").upper()
        sigla = base
        if sigla in usate and len(parole) > 1:
            sigla = (parole[0][:2] + parole[1][:1]).upper()
        n = 2
        while sigla in usate:
            sigla = f"{base[:2]}{n}"
            n += 1
        usate.add(sigla)
        out[cid] = sigla
    return out


def _testo_scuro(hex_col: str) -> bool:
    """True se sul colore serve testo scuro (sfondi chiari come giallo/lime)."""
    h = hex_col.lstrip("#")
    r, g, b = (int(h[i:i + 2], 16) for i in (0, 2, 4))
    return (0.299 * r + 0.587 * g + 0.114 * b) > 165


@router.get("/pdf")
def export_pdf(
    data_inizio: date,
    data_fine: date,
    categoria: Optional[str] = None,
    solo_impegnati: bool = True,
    db: Session = Depends(get_db),
    user: Utente = Depends(get_current_user),
):
    """Gantt operatori del periodo in PDF A4 orizzontale: una riga per operatore,
    mattina/pomeriggio per ogni giorno, turni uguali consecutivi uniti in una barra,
    legenda cantieri con giornate-uomo pianificate."""
    if user.ruolo not in RUOLI_ADMIN:
        raise HTTPException(403)
    if data_fine < data_inizio:
        raise HTTPException(422, "Periodo non valido")
    if (data_fine - data_inizio).days > 42:
        raise HTTPException(422, "Periodo troppo lungo (max 6 settimane)")

    import io
    from fastapi.responses import StreamingResponse
    from reportlab.lib import colors
    from reportlab.lib.units import mm
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.enums import TA_CENTER, TA_LEFT
    from reportlab.platypus import Table, TableStyle, Paragraph, Spacer, KeepTogether
    from app import pdf_theme as T

    giorni = [data_inizio + timedelta(days=i) for i in range((data_fine - data_inizio).days + 1)]
    rows = (
        db.query(AssegnazioneOperatore)
        .filter(AssegnazioneOperatore.data >= data_inizio, AssegnazioneOperatore.data <= data_fine)
        .all()
    )
    amap = {}
    for r in rows:
        k = ("artigiano", r.artigiano_id) if r.artigiano_id else ("utente", r.utente_id)
        amap[(k, r.data, r.turno)] = r

    operatori = _lista_operatori(db)
    if categoria == "__interni__":
        operatori = [o for o in operatori if o["tipo"] == "utente"]
    elif categoria:
        operatori = [o for o in operatori if o["categoria"] == categoria]
    if solo_impegnati:
        impegnati = {k for (k, _d, _t) in amap}
        operatori = [o for o in operatori if (o["tipo"], o["id"]) in impegnati]

    nomi_cant = {r.cantiere_id: (r.cantiere.nome if r.cantiere else "") for r in rows if r.cantiere_id}
    sigle = sigle_cantieri(nomi_cant)

    def info(a):
        """(chiave raggruppamento, colore, sigla, testo lungo, nome legenda) di una cella."""
        if a is None:
            return None
        tipo = a.tipo or "cantiere"
        extra = f" · {a.lavorazione}" if a.lavorazione else ""
        if tipo != "cantiere":
            label, sig, col = TIPI_LIBERI_PDF.get(tipo, TIPI_LIBERI_PDF["altro"])
            return ((tipo, None, a.lavorazione), col, sig, label + extra, label)
        if not a.cantiere_id:
            return (("cantiere", None, a.lavorazione), "#94a3b8", "—", a.lavorazione or "—", "Senza cantiere")
        col = PALETTE_CANTIERI[(a.cantiere_id - 1) % len(PALETTE_CANTIERI)]
        nome = nomi_cant.get(a.cantiere_id, "")
        return (("cantiere", a.cantiere_id, a.lavorazione), col, sigle.get(a.cantiere_id, "?"), nome + extra, nome)

    # ── Geometria: A4 orizzontale, colonna nomi + 2 colonne (M/P) per giorno ──
    pag_w, _ = landscape(A4)
    utile = pag_w - 20 * mm
    nome_w = 44 * mm
    slot_w = (utile - nome_w) / (len(giorni) * 2)
    largo = slot_w * 2 >= 24 * mm          # vista settimana: spazio per i nomi completi
    row_h = (9 if largo else 6.2) * mm

    S = T.make_styles()
    scuro = colors.HexColor(T.BRAND["colore_scuro"])
    primario = colors.HexColor(T.BRAND["colore_primario"])
    testo_su = lambda col: colors.HexColor("#1B1B24") if _testo_scuro(col) else colors.white
    st_cell = ParagraphStyle("g_cell", fontName=T.FONT_SB, fontSize=6.6 if largo else 5,
                             leading=7.6 if largo else 5.8, alignment=TA_CENTER)
    st_nome = ParagraphStyle("g_nome", fontName=T.FONT_SB, fontSize=7.4, leading=8.6, textColor=T.INK)
    st_sub = ParagraphStyle("g_sub", fontName=T.FONT, fontSize=5.8, leading=6.8, textColor=T.MUTED)
    st_head = ParagraphStyle("g_head", fontName=T.FONT_BD, fontSize=7 if largo else 6, leading=7.6,
                             alignment=TA_CENTER, textColor=colors.white)
    st_mp = ParagraphStyle("g_mp", fontName=T.FONT, fontSize=5.2, leading=6, alignment=TA_CENTER,
                           textColor=T.MUTED)

    head1 = [Paragraph("OPERATORE", ParagraphStyle("g_h0", parent=st_head, alignment=TA_LEFT))]
    head2 = [""]
    for d in giorni:
        gg = GIORNI_BREVI[d.weekday()]
        lbl = f"{gg} {d.day}" if largo else f"{d.day}<br/><font size=4.6>{gg[:2]}</font>"
        head1 += [Paragraph(lbl, st_head), ""]
        head2 += [Paragraph("M", st_mp), Paragraph("P", st_mp)]
    data = [head1, head2]

    style = [
        ("BACKGROUND", (0, 0), (-1, 0), scuro),
        ("BACKGROUND", (0, 1), (-1, 1), T.BG_SOFT),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 1),
        ("RIGHTPADDING", (0, 0), (-1, -1), 1),
        ("TOPPADDING", (0, 0), (-1, -1), 1),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 1),
        ("LEFTPADDING", (0, 0), (0, -1), 4),
        ("LINEBELOW", (0, 1), (0, -1), 0.25, T.BORDER),
        # filo bianco tra le righe: le barre di operatori diversi non si toccano
        ("LINEBELOW", (1, 2), (-1, -1), 1.2, colors.white),
        ("LEFTPADDING", (1, 2), (-1, -1), 0),
        ("RIGHTPADDING", (1, 2), (-1, -1), 0),
        ("LINEAFTER", (0, 0), (0, -1), 0.6, T.HAIRLINE),
    ]
    for i, d in enumerate(giorni):
        c0 = 1 + i * 2
        style.append(("SPAN", (c0, 0), (c0 + 1, 0)))
        # separatore tra giorni, più marcato a inizio settimana
        lunedi = d.weekday() == 0
        style.append(("LINEBEFORE", (c0, 1), (c0, -1), 0.8 if lunedi else 0.3, T.HAIRLINE if lunedi else T.BORDER))
        if d.weekday() >= 5:
            style.append(("BACKGROUND", (c0, 2), (c0 + 1, -1), colors.HexColor("#EFEFEC")))
    oggi = date.today()
    if data_inizio <= oggi <= data_fine:
        c0 = 1 + (oggi - data_inizio).days * 2
        style.append(("BACKGROUND", (c0, 0), (c0 + 1, 0), primario))

    legenda = {}   # (tipo, cantiere_id) -> [colore, sigla, nome, mezze giornate]
    for ri, op in enumerate(operatori):
        r = 2 + ri
        k_op = (op["tipo"], op["id"])
        sub = op.get("azienda") or op.get("categoria") or ""
        riga = [[Paragraph(op["nome"], st_nome), Paragraph(sub, st_sub)] if sub else Paragraph(op["nome"], st_nome)]
        celle = [info(amap.get((k_op, d, t))) for d in giorni for t in ("M", "P")]
        riga += [""] * len(celle)
        if ri % 2:
            style.append(("BACKGROUND", (0, r), (0, r), T.BG_SOFT))
        # turni consecutivi identici -> una barra unica (SPAN)
        j = 0
        while j < len(celle):
            c = celle[j]
            if c is None:
                j += 1
                continue
            fine = j
            while fine + 1 < len(celle) and celle[fine + 1] is not None and celle[fine + 1][0] == c[0]:
                fine += 1
            span = fine - j + 1
            larghezza = span * slot_w
            testo = c[3] if largo and larghezza >= 22 * mm else c[2]
            st = ParagraphStyle("gc", parent=st_cell, textColor=testo_su(c[1]))
            if larghezza < 5 * mm:     # mezza giornata isolata in vista mese
                st.fontSize, st.leading = 3.9, 4.4
            riga[1 + j] = Paragraph(testo, st) if larghezza >= 3.4 * mm else ""
            if span > 1:
                style.append(("SPAN", (1 + j, r), (1 + fine, r)))
            style.append(("BACKGROUND", (1 + j, r), (1 + fine, r), colors.HexColor(c[1])))
            # filo bianco tra barre adiacenti di colore diverso
            style.append(("LINEBEFORE", (1 + j, r), (1 + j, r), 0.8, colors.white))
            lk = c[0][:2]
            voce = legenda.setdefault(lk, [c[1], c[2], c[4], 0])
            voce[3] += span
            j = fine + 1
        data.append(riga)

    # ── Intestazione documento ─────────────────────────────────────────────
    if data_inizio.day == 1 and (data_fine + timedelta(days=1)).day == 1:
        periodo = f"{MESI_IT[data_inizio.month]} {data_inizio.year}".capitalize()
    else:
        periodo = f"{data_inizio.strftime('%d/%m/%Y')} – {data_fine.strftime('%d/%m/%Y')}"
        if data_inizio.weekday() == 0 and (data_fine - data_inizio).days <= 6:
            periodo = f"Settimana {data_inizio.isocalendar()[1]} · {periodo}"
    if categoria == "__interni__":
        periodo += " · solo interni"
    elif categoria:
        periodo += f" · {categoria}"

    story = T.masthead(S, "Gantt operatori", periodo)
    if not operatori:
        story.append(Paragraph("Nessun operatore pianificato nel periodo selezionato.", S["body"]))
    else:
        tab = Table(data, colWidths=[nome_w] + [slot_w] * (len(giorni) * 2),
                    rowHeights=[7.5 * mm if largo else 8 * mm, 4 * mm] + [row_h] * len(operatori),
                    repeatRows=2)
        tab.setStyle(TableStyle(style))
        story.append(tab)

    if legenda:
        st_leg = ParagraphStyle("g_leg", fontName=T.FONT, fontSize=7.4, leading=9, textColor=T.INK)
        st_sig = ParagraphStyle("g_sig", fontName=T.FONT_BD, fontSize=6.5, leading=8, alignment=TA_CENTER)
        voci = sorted(legenda.values(), key=lambda v: -v[3])
        n_col = 3
        cella_w = utile / n_col
        righe_leg = []
        stile_leg = [
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("LEFTPADDING", (0, 0), (-1, -1), 3),
            ("RIGHTPADDING", (0, 0), (-1, -1), 3),
            ("TOPPADDING", (0, 0), (-1, -1), 2),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ]
        for i in range(0, len(voci), n_col):
            riga = []
            for k in range(n_col):
                if i + k >= len(voci):
                    riga += ["", ""]
                    continue
                col, sig, nome, mezze = voci[i + k]
                gg_txt = f"{mezze / 2:.1f}".rstrip("0").rstrip(".").replace(".", ",")
                riga += [
                    Paragraph(sig, ParagraphStyle("s", parent=st_sig, textColor=testo_su(col))),
                    Paragraph(f"{nome}  <font color='#6B6862'>· {gg_txt} gg</font>", st_leg),
                ]
                stile_leg.append(("BACKGROUND", (k * 2, len(righe_leg)), (k * 2, len(righe_leg)),
                                  colors.HexColor(col)))
            righe_leg.append(riga)
        leg = Table(righe_leg, colWidths=[11 * mm, cella_w - 11 * mm] * n_col, hAlign="LEFT")
        leg.setStyle(TableStyle(stile_leg))
        story += [Spacer(1, 5 * mm),
                  KeepTogether([Paragraph("Legenda · giornate-uomo pianificate", S["h2"]), leg])]

    buf = io.BytesIO()
    T.build(buf, story, title="Gantt operatori", pagesize=landscape(A4), margins_mm=(10, 10, 10, 18))
    nome_file = f"gantt_operatori_{data_inizio.isoformat()}_{data_fine.isoformat()}.pdf"
    return StreamingResponse(buf, media_type="application/pdf",
                             headers={"Content-Disposition": f'attachment; filename="{nome_file}"'})


class AssegnazioneBody(BaseModel):
    artigiano_id: Optional[int] = None
    utente_id: Optional[int] = None
    data: date
    turno: str
    tipo: Optional[str] = "cantiere"
    cantiere_id: Optional[int] = None
    lavorazione: Optional[str] = None
    note: Optional[str] = None


def _applica(db: Session, body: AssegnazioneBody, user: Utente) -> dict:
    """Upsert di una singola cella (operatore, data, turno) — senza commit.
    Una cella "vuota" (tipo cantiere senza cantiere/lavorazione/note) viene cancellata."""
    if body.turno not in ("M", "P"):
        raise HTTPException(422, "turno deve essere 'M' o 'P'")
    if not body.artigiano_id and not body.utente_id:
        raise HTTPException(422, "artigiano_id o utente_id obbligatorio")
    tipo = body.tipo or "cantiere"
    if tipo not in TIPI_ASSEGNAZIONE:
        raise HTTPException(422, f"tipo deve essere uno di: {', '.join(sorted(TIPI_ASSEGNAZIONE))}")

    q = db.query(AssegnazioneOperatore).filter(
        AssegnazioneOperatore.data == body.data,
        AssegnazioneOperatore.turno == body.turno,
    )
    if body.artigiano_id:
        q = q.filter(AssegnazioneOperatore.artigiano_id == body.artigiano_id)
    else:
        q = q.filter(AssegnazioneOperatore.utente_id == body.utente_id)

    existing = q.first()

    # Una cella "vuota" è tipo cantiere senza cantiere né lavorazione né note;
    # le attività libere (ferie, corso...) restano valide anche senza cantiere
    vuota = tipo == "cantiere" and body.cantiere_id is None and body.lavorazione is None and body.note is None

    if existing:
        if vuota:
            db.delete(existing)
            return {"deleted": True}
        existing.tipo = tipo
        existing.cantiere_id = body.cantiere_id if tipo == "cantiere" else None
        existing.lavorazione = body.lavorazione
        existing.note = body.note
        return {"row": existing}
    if vuota:
        return {"noop": True}
    row = AssegnazioneOperatore(
        artigiano_id=body.artigiano_id,
        utente_id=body.utente_id,
        data=body.data,
        turno=body.turno,
        tipo=tipo,
        cantiere_id=body.cantiere_id if tipo == "cantiere" else None,
        lavorazione=body.lavorazione,
        note=body.note,
        creato_da=user.id,
    )
    db.add(row)
    return {"row": row}


@router.put("")
def upsert_assegnazione(
    body: AssegnazioneBody,
    db: Session = Depends(get_db),
    user: Utente = Depends(get_current_user),
):
    if user.ruolo not in RUOLI_ADMIN:
        raise HTTPException(403)
    esito = _applica(db, body, user)
    db.commit()
    if "row" in esito:
        db.refresh(esito["row"])
        return _dict(esito["row"])
    return esito


class BulkBody(BaseModel):
    celle: List[AssegnazioneBody]


@router.put("/bulk")
def upsert_bulk(
    body: BulkBody,
    db: Session = Depends(get_db),
    user: Utente = Depends(get_current_user),
):
    """Salva più celle in una sola transazione (selezione multipla dal Gantt).
    Prima ogni cella era una PUT separata: richieste in parallelo, refetch a raffica
    e salvataggi parziali se una falliva. Ora o passano tutte o nessuna."""
    if user.ruolo not in RUOLI_ADMIN:
        raise HTTPException(403)
    if not body.celle:
        return {"salvate": 0, "rimosse": 0}
    if len(body.celle) > 2000:
        raise HTTPException(422, "Troppe celle in una sola operazione")
    # Una cella ripetuta nella stessa richiesta violerebbe l'indice univoco: tengo l'ultima
    uniche = {}
    for c in body.celle:
        uniche[(c.artigiano_id, c.utente_id, c.data, c.turno)] = c
    salvate = rimosse = 0
    try:
        for c in uniche.values():
            esito = _applica(db, c, user)
            db.flush()
            if "row" in esito:
                salvate += 1
            elif esito.get("deleted"):
                rimosse += 1
        db.commit()
    except HTTPException:
        db.rollback()
        raise
    return {"salvate": salvate, "rimosse": rimosse}


GIORNI_LABEL = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"]
TIPI_LIBERI_LABEL = {"ferie": "Ferie", "corso": "Corso", "permesso": "Permesso", "altro": "Fuori cantiere"}


class PubblicaBody(BaseModel):
    anno: int
    settimana: int


@router.post("/pubblica-settimana")
def pubblica_settimana(
    body: PubblicaBody,
    db: Session = Depends(get_db),
    user: Utente = Depends(get_current_user),
):
    """Notifica a ogni operatore il suo programma della settimana, letto dal Gantt.

    Gli artigiani della rubrica senza account collegato non possono ricevere
    notifiche: il loro numero è riportato in `senza_account`.
    """
    if user.ruolo not in RUOLI_ADMIN:
        raise HTTPException(403)
    try:
        lunedi = date.fromisocalendar(body.anno, body.settimana, 1)
    except ValueError:
        raise HTTPException(422, "Settimana non valida")

    rows = (
        db.query(AssegnazioneOperatore)
        .filter(
            AssegnazioneOperatore.data >= lunedi,
            AssegnazioneOperatore.data <= lunedi + timedelta(days=6),
        )
        .all()
    )
    if not rows:
        raise HTTPException(404, "Nessuna assegnazione in questa settimana")

    # Risolve l'account utente di ogni assegnazione (diretto o via rubrica artigiani)
    artigiano_ids = {r.artigiano_id for r in rows if r.artigiano_id}
    link_utente = {}
    if artigiano_ids:
        for a in db.query(Artigiano).filter(Artigiano.id.in_(artigiano_ids)).all():
            if a.utente_id:
                link_utente[a.id] = a.utente_id

    per_utente = {}      # uid -> {data -> {turno -> testo}}
    senza_account = set()
    for r in rows:
        uid = r.utente_id or link_utente.get(r.artigiano_id)
        if not uid:
            if r.artigiano_id:
                senza_account.add(r.artigiano_id)
            continue
        dove = r.cantiere.nome if r.cantiere else TIPI_LIBERI_LABEL.get(r.tipo or "cantiere", "—")
        testo = dove + (f" ({r.lavorazione})" if r.lavorazione else "")
        per_utente.setdefault(uid, {}).setdefault(r.data, {})[r.turno] = testo

    from app.routers.notifiche import invia_notifica
    notificati = 0
    for uid, giorni in per_utente.items():
        righe = []
        for d in sorted(giorni):
            turni = giorni[d]
            label = GIORNI_LABEL[d.isoweekday() - 1]
            if "M" in turni and "P" in turni and turni["M"] != turni["P"]:
                righe.append(f"{label}: M {turni['M']} · P {turni['P']}")
            else:
                righe.append(f"{label}: {turni.get('M') or turni.get('P')}")
        corpo = f"Settimana {body.settimana}:\n" + "\n".join(righe)
        invia_notifica(db, [uid], "📅 Programma settimana", corpo, "/")
        notificati += 1

    return {"ok": True, "notificati": notificati, "senza_account": len(senza_account)}


@router.delete("/{ass_id}")
def elimina_assegnazione(
    ass_id: int,
    db: Session = Depends(get_db),
    user: Utente = Depends(get_current_user),
):
    if user.ruolo not in RUOLI_ADMIN:
        raise HTTPException(403)
    row = db.query(AssegnazioneOperatore).filter(AssegnazioneOperatore.id == ass_id).first()
    if not row:
        raise HTTPException(404)
    db.delete(row)
    db.commit()
    return {"ok": True}
