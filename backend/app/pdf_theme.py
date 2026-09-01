"""
Tema condiviso per i documenti PDF (reportlab).

Allinea i PDF esportati al design system dell'app (design-system/*/MASTER.md):
- tipografia Plus Jakarta Sans + IBM Plex Mono per gli importi
- palette di marca + colori semantici (ok / warn / danger)
- masthead con logo, titolo documento e filo d'accento
- footer con numero pagina, ragione sociale e data di generazione
- tabelle "flat": header scuro, righe a zebra tenue, niente griglia pesante

Ogni app tara solo BRAND (STEELEX arancione / FR charcoal); tutto il resto è identico.
"""
from __future__ import annotations
import os
from datetime import date

from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.lib.enums import TA_RIGHT, TA_CENTER, TA_JUSTIFY
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (SimpleDocTemplate, Table, TableStyle, Paragraph,
                                Spacer, HRFlowable, Image as RLImage)
from reportlab.lib.utils import ImageReader

_ASSETS = os.path.join(os.path.dirname(__file__), "assets")
_FONTS = os.path.join(_ASSETS, "fonts")

# ── Brand (STEELEX) — l'unica cosa che cambia tra le due app ───────────────────
BRAND = {
    "nome":            "STEELEX",
    "sottotitolo":     "Costruzioni Light Steel Frame",
    "ragione_sociale": "STEELEX — Fontana Raffaele Srl",
    "colore_primario": "#FF6B00",
    "colore_scuro":    "#1A1A2E",
    "logo":            os.path.join(_ASSETS, "logo_pdf.png"),
    "logo_altezza_mm": 15,
}

# ── Palette design system (MASTER.md) ─────────────────────────────────────────
INK      = colors.HexColor("#1B1B24")
MUTED    = colors.HexColor("#6B6862")
BORDER   = colors.HexColor("#E6E2D9")
HAIRLINE = colors.HexColor("#D7D2C6")
BG_SOFT  = colors.HexColor("#F6F4EF")   # zebra / info-box (neutro caldo)
OK       = colors.HexColor("#15803D")
WARN     = colors.HexColor("#B45309")
DANGER   = colors.HexColor("#C81E1E")

FONT       = "Jakarta"
FONT_BD    = "Jakarta-Bold"
FONT_SB    = "Jakarta-SemiBold"
FONT_MONO  = "PlexMono"
FONT_MONO_M = "PlexMono-Medium"

_fonts_ready = False


def register_fonts() -> None:
    """Registra i TTF una sola volta. Se mancano, si resta su Helvetica (nessun crash)."""
    global _fonts_ready, FONT, FONT_BD, FONT_SB, FONT_MONO, FONT_MONO_M
    if _fonts_ready:
        return
    try:
        pdfmetrics.registerFont(TTFont("Jakarta",          os.path.join(_FONTS, "PlusJakartaSans-Regular.ttf")))
        pdfmetrics.registerFont(TTFont("Jakarta-SemiBold", os.path.join(_FONTS, "PlusJakartaSans-SemiBold.ttf")))
        pdfmetrics.registerFont(TTFont("Jakarta-Bold",     os.path.join(_FONTS, "PlusJakartaSans-Bold.ttf")))
        pdfmetrics.registerFont(TTFont("PlexMono",         os.path.join(_FONTS, "IBMPlexMono-Regular.ttf")))
        pdfmetrics.registerFont(TTFont("PlexMono-Medium",  os.path.join(_FONTS, "IBMPlexMono-Medium.ttf")))
        pdfmetrics.registerFontFamily("Jakarta", normal="Jakarta", bold="Jakarta-Bold",
                                      italic="Jakarta", boldItalic="Jakarta-Bold")
        _fonts_ready = True
    except Exception:
        FONT = FONT_SB = "Helvetica"
        FONT_BD = "Helvetica-Bold"
        FONT_MONO = FONT_MONO_M = "Courier"
        _fonts_ready = True


def palette(brand: dict | None = None):
    b = brand or BRAND
    return colors.HexColor(b["colore_primario"]), colors.HexColor(b["colore_scuro"])


def make_styles(brand: dict | None = None) -> dict:
    """Set completo di ParagraphStyle coerenti col design system."""
    register_fonts()
    PRIMARIO, SCURO = palette(brand)
    S = {}
    S["title"]    = ParagraphStyle("t_title", fontName=FONT_BD, fontSize=21, leading=24, textColor=SCURO, spaceAfter=2)
    S["kicker"]   = ParagraphStyle("t_kicker", fontName=FONT_BD, fontSize=8, leading=11, textColor=PRIMARIO,
                                   spaceAfter=3)  # eyebrow/etichetta d'accento
    S["subtitle"] = ParagraphStyle("t_sub", fontName=FONT, fontSize=9.5, leading=13, textColor=MUTED)
    S["h2"]       = ParagraphStyle("t_h2", fontName=FONT_SB, fontSize=12.5, leading=16, textColor=SCURO,
                                   spaceBefore=10, spaceAfter=5)
    S["body"]     = ParagraphStyle("t_body", fontName=FONT, fontSize=9.5, leading=13.5, textColor=INK, spaceAfter=4)
    S["body_j"]   = ParagraphStyle("t_body_j", parent=S["body"], alignment=TA_JUSTIFY)
    S["label"]    = ParagraphStyle("t_label", fontName=FONT_SB, fontSize=7.5, leading=10, textColor=MUTED)  # UPPERCASE a mano
    S["value"]    = ParagraphStyle("t_value", fontName=FONT, fontSize=9.5, leading=13, textColor=INK)
    S["value_b"]  = ParagraphStyle("t_value_b", fontName=FONT_SB, fontSize=9.5, leading=13, textColor=INK)
    S["meta"]     = ParagraphStyle("t_meta", fontName=FONT, fontSize=8, leading=11, textColor=MUTED)
    S["note"]     = ParagraphStyle("t_note", fontName=FONT, fontSize=8.5, leading=12, textColor=MUTED, spaceAfter=3)
    S["cell"]     = ParagraphStyle("t_cell", fontName=FONT, fontSize=8, leading=10.5, textColor=INK)
    S["cell_h"]   = ParagraphStyle("t_cell_h", fontName=FONT_SB, fontSize=7.5, leading=10, textColor=colors.white)
    S["num"]      = ParagraphStyle("t_num", fontName=FONT_MONO, fontSize=8, leading=10.5, textColor=INK, alignment=TA_RIGHT)
    S["num_b"]    = ParagraphStyle("t_num_b", fontName=FONT_MONO_M, fontSize=9, leading=12, textColor=INK, alignment=TA_RIGHT)
    S["sign"]     = ParagraphStyle("t_sign", fontName=FONT, fontSize=8, leading=11, textColor=MUTED)
    S["sign_b"]   = ParagraphStyle("t_sign_b", fontName=FONT_SB, fontSize=8.5, leading=11, textColor=INK)
    return S


def _logo_flowable(brand: dict, styles: dict):
    b = brand or BRAND
    path = b.get("logo")
    if path and os.path.exists(path):
        try:
            iw, ih = ImageReader(path).getSize()
            h = b.get("logo_altezza_mm", 15) * mm
            img = RLImage(path, width=iw * h / ih, height=h)
            img.hAlign = "LEFT"
            return img
        except Exception:
            pass
    return Paragraph(b["nome"], styles["title"])


def masthead(styles: dict, doc_label: str, doc_ref: str = "", *, brand: dict | None = None) -> list:
    """Logo a sinistra + etichetta/numero documento a destra + filo d'accento."""
    b = brand or BRAND
    PRIMARIO, SCURO = palette(b)
    right = []
    if doc_label:
        right.append(Paragraph(doc_label.upper(), styles["kicker"]))
    if doc_ref:
        right.append(Paragraph(doc_ref, styles["meta"]))
    head = Table([[_logo_flowable(b, styles), right or ""]], colWidths=["58%", "42%"])
    head.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ALIGN", (1, 0), (1, 0), "RIGHT"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    return [head,
            HRFlowable(width="100%", thickness=2, color=PRIMARIO, spaceBefore=2, spaceAfter=2),
            Paragraph(b["sottotitolo"], styles["subtitle"]),
            Spacer(1, 6 * mm)]


def info_grid(styles: dict, rows: list[tuple[str, str]], *, col_label_mm: float = 40) -> Table:
    """Coppie etichetta/valore pulite: label muted UPPERCASE, valore scuro, hairline sotto ogni riga."""
    data = [[Paragraph(k.upper(), styles["label"]), Paragraph(v or "—", styles["value"])] for k, v in rows]
    t = Table(data, colWidths=[col_label_mm * mm, "*"])
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LINEBELOW", (0, 0), (-1, -1), 0.5, BORDER),
        ("LINEABOVE", (0, 0), (-1, 0), 0.5, BORDER),
    ]))
    return t


def data_table_style(n_body: int, *, accent=None, has_totals: bool = False, total_rows: int = 0):
    """TableStyle 'flat' per le tabelle voci: header scuro, zebra tenue, hairline riga, totale su accento.

    Riga 0 = header. Righe 1..n_body = corpo. Le eventuali righe totali seguono il corpo;
    l'ultima di `total_rows` prende lo sfondo d'accento.
    """
    PRIMARIO = accent or colors.HexColor(BRAND["colore_primario"])
    cmds = [
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor(BRAND["colore_scuro"])),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), FONT_SB),
        ("FONTSIZE", (0, 0), (-1, 0), 7.5),
        ("ALIGN", (0, 0), (-1, 0), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ROWBACKGROUNDS", (0, 1), (-1, n_body), [colors.white, BG_SOFT]),
        ("LINEBELOW", (0, 1), (-1, n_body), 0.4, BORDER),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
    ]
    if has_totals and total_rows:
        first_tot = n_body + 1
        last_tot = n_body + total_rows
        cmds += [
            ("LINEABOVE", (0, first_tot), (-1, first_tot), 1, PRIMARIO),
            ("FONTNAME", (0, first_tot), (-1, last_tot), FONT_SB),
            ("FONTSIZE", (0, first_tot), (-1, last_tot), 9),
            ("BACKGROUND", (0, last_tot), (-1, last_tot), PRIMARIO),
            ("TEXTCOLOR", (0, last_tot), (-1, last_tot), colors.white),
        ]
    return TableStyle(cmds)


def signature_block(styles: dict, left_role: str, right_role: str, *, brand: dict | None = None) -> Table:
    b = brand or BRAND
    data = [
        [Paragraph(left_role, styles["sign_b"]), Paragraph(right_role, styles["sign_b"])],
        [Spacer(1, 12 * mm), Spacer(1, 12 * mm)],
        [Paragraph("Data e firma", styles["sign"]), Paragraph(b["ragione_sociale"], styles["sign"])],
    ]
    t = Table(data, colWidths=["50%", "50%"])
    t.setStyle(TableStyle([
        ("LINEABOVE", (0, 2), (0, 2), 0.7, HAIRLINE),
        ("LINEABOVE", (1, 2), (1, 2), 0.7, HAIRLINE),
        ("TOPPADDING", (0, 2), (-1, 2), 3),
        ("RIGHTPADDING", (0, 0), (0, -1), 14),
        ("LEFTPADDING", (1, 0), (1, -1), 14),
    ]))
    return t


def _page_decoration(brand: dict):
    b = brand or BRAND
    gen = date.today().strftime("%d/%m/%Y")

    def on_page(canvas, doc):
        canvas.saveState()
        w, h = A4
        y = 12 * mm
        canvas.setStrokeColor(BORDER)
        canvas.setLineWidth(0.5)
        canvas.line(doc.leftMargin, y + 4 * mm, w - doc.rightMargin, y + 4 * mm)
        canvas.setFont(FONT, 7)
        canvas.setFillColor(MUTED)
        canvas.drawString(doc.leftMargin, y, f"{b['ragione_sociale']}  ·  generato il {gen}")
        canvas.drawRightString(w - doc.rightMargin, y, f"Pag. {doc.page}")
        canvas.restoreState()

    return on_page


def build(buf, story, *, title: str, brand: dict | None = None,
          margins_mm: tuple[float, float, float, float] = (16, 16, 15, 20)):
    """SimpleDocTemplate con margini coerenti e footer su ogni pagina."""
    register_fonts()
    b = brand or BRAND
    lm, rm, tm, bm = margins_mm
    doc = SimpleDocTemplate(buf, pagesize=A4, title=title,
                            leftMargin=lm * mm, rightMargin=rm * mm,
                            topMargin=tm * mm, bottomMargin=bm * mm)
    deco = _page_decoration(b)
    doc.build(story, onFirstPage=deco, onLaterPages=deco)
    buf.seek(0)
    return buf


# Compat: il vecchio nome usato da economico.py / diari.py
PDF_BRAND = BRAND
