import io
from datetime import date
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.database import get_db
from app.routers.auth import get_current_user
from pydantic import BaseModel
from typing import Optional

router = APIRouter(prefix="/ore-lavorate", tags=["ore-lavorate"])

# Chi può registrare le proprie ore: anche operativi/artigiani e capi cantiere (es. Flavian, Alberto)
RUOLI_AMMESSI = {"admin", "amministrazione", "artigiano", "operativo", "capo_cantiere", "capo_cantiere_sub"}
# Chi vede le ore di tutti: solo admin e amministrazione
RUOLI_VEDONO_TUTTI = {"admin", "amministrazione"}

def _check(utente):
    if utente.ruolo not in RUOLI_AMMESSI:
        raise HTTPException(403, "Accesso riservato ad admin, amministrazione e operativi")

class OreIn(BaseModel):
    data: str                      # YYYY-MM-DD
    ore: float                     # ore lavorate (es. 7.5)
    descrizione: str               # dettaglio operazioni svolte

@router.get("/utenti")
def lista_utenti(db: Session = Depends(get_db), utente=Depends(get_current_user)):
    """Utenti che possono registrare ore, per il filtro (solo admin/amministrazione)."""
    if utente.ruolo not in RUOLI_VEDONO_TUTTI:
        raise HTTPException(403, "Accesso riservato ad admin e amministrazione")
    rows = db.execute(text("""
        SELECT id, nome, cognome, ruolo::text AS ruolo FROM utenti
        WHERE ruolo::text IN ('admin', 'amministrazione', 'artigiano', 'operativo', 'capo_cantiere', 'capo_cantiere_sub') AND attivo = TRUE
        ORDER BY cognome, nome
    """)).mappings().all()
    return [dict(r) for r in rows]


# La query di lettura: il cantiere è dedotto dal rapportino collegato (le righe inserite
# a mano dall'ufficio non hanno cantiere). L'operatore è l'utente collegato oppure, per
# gli esterni occasionali senza account, il nome libero in operatore_nome.
_SELECT_ORE = """
    SELECT o.id, o.utente_id, o.operatore_nome, o.data, o.ore, o.descrizione,
           o.creato_il, o.aggiornato_il, u.nome, u.cognome,
           rp.cantiere_id AS cantiere_id, c.nome AS cantiere_nome,
           COALESCE(NULLIF(TRIM(COALESCE(u.nome, '') || ' ' || COALESCE(u.cognome, '')), ''), o.operatore_nome, 'Sconosciuto') AS operatore
    FROM ore_lavorate o
    LEFT JOIN utenti u ON u.id = o.utente_id
    LEFT JOIN rapportini_operativi rp ON rp.id = o.rapportino_id
    LEFT JOIN cantieri c ON c.id = rp.cantiere_id
"""


@router.get("")
def lista_ore(mese: Optional[str] = None, utente_id: Optional[int] = None,
              db: Session = Depends(get_db), utente=Depends(get_current_user)):
    """Registro ore del mese. Admin/amministrazione vedono tutti, gli operativi solo le proprie."""
    _check(utente)
    where = ["1=1"]
    params = {}
    if mese:  # formato YYYY-MM
        where.append("to_char(o.data, 'YYYY-MM') = :mese")
        params["mese"] = mese
    if utente.ruolo not in RUOLI_VEDONO_TUTTI:
        where.append("o.utente_id = :uid")
        params["uid"] = utente.id
    elif utente_id:
        where.append("o.utente_id = :uid")
        params["uid"] = utente_id
    rows = db.execute(text(f"""
        {_SELECT_ORE}
        WHERE {' AND '.join(where)}
        ORDER BY o.data DESC, o.id DESC
    """), params).mappings().all()
    return [dict(r) for r in rows]

@router.post("")
def crea_ore(payload: OreIn, db: Session = Depends(get_db), utente=Depends(get_current_user)):
    _check(utente)
    if payload.ore <= 0 or payload.ore > 24:
        raise HTTPException(400, "Ore non valide (deve essere tra 0 e 24)")
    if not payload.descrizione.strip():
        raise HTTPException(400, "Il dettaglio delle operazioni è obbligatorio")
    r = db.execute(text("""
        INSERT INTO ore_lavorate (utente_id, data, ore, descrizione)
        VALUES (:uid, :data, :ore, :descrizione)
        RETURNING id, utente_id, data, ore, descrizione, creato_il, aggiornato_il
    """), {"uid": utente.id, "data": payload.data, "ore": payload.ore,
           "descrizione": payload.descrizione.strip()})
    db.commit()
    row = r.mappings().first()
    return {**dict(row), "nome": utente.nome, "cognome": utente.cognome}

def _riga_o_404(oid, db, utente):
    """Recupera la riga e verifica la proprietà (admin può tutto)."""
    row = db.execute(text("SELECT id, utente_id FROM ore_lavorate WHERE id = :id"),
                     {"id": oid}).mappings().first()
    if not row:
        raise HTTPException(404, "Registrazione non trovata")
    if utente.ruolo not in RUOLI_VEDONO_TUTTI and row["utente_id"] != utente.id:
        raise HTTPException(403, "Puoi modificare solo le tue registrazioni")
    return row

@router.put("/{oid}")
def aggiorna_ore(oid: int, payload: OreIn, db: Session = Depends(get_db), utente=Depends(get_current_user)):
    _check(utente)
    if payload.ore <= 0 or payload.ore > 24:
        raise HTTPException(400, "Ore non valide (deve essere tra 0 e 24)")
    _riga_o_404(oid, db, utente)
    db.execute(text("""
        UPDATE ore_lavorate
        SET data = :data, ore = :ore, descrizione = :descrizione, aggiornato_il = NOW()
        WHERE id = :id
    """), {"data": payload.data, "ore": payload.ore,
           "descrizione": payload.descrizione.strip(), "id": oid})
    db.commit()
    return {"ok": True}

@router.delete("/{oid}")
def elimina_ore(oid: int, db: Session = Depends(get_db), utente=Depends(get_current_user)):
    _check(utente)
    _riga_o_404(oid, db, utente)
    db.execute(text("DELETE FROM ore_lavorate WHERE id = :id"), {"id": oid})
    db.commit()
    return {"ok": True}


# ─────────────────────────────────────────────────────────────────────────────
# Stampa: tabella di tutte le ore lavorate divise per operatore e cantiere
# (controllo amministrazione — es. Susanna)
# ─────────────────────────────────────────────────────────────────────────────
def _mese_label(mese: Optional[str]) -> str:
    if not mese:
        return "Tutte le date"
    try:
        a, m = mese.split("-")
        nomi = ["", "gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno",
                "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"]
        return f"{nomi[int(m)]} {a}".capitalize()
    except Exception:
        return mese


@router.get("/report.pdf")
def report_pdf(mese: Optional[str] = None, utente_id: Optional[int] = None,
               db: Session = Depends(get_db), utente=Depends(get_current_user)):
    """PDF con tutte le ore lavorate del mese raggruppate per operatore e cantiere.
    Solo admin/amministrazione."""
    if utente.ruolo not in RUOLI_VEDONO_TUTTI:
        raise HTTPException(403, "Accesso riservato ad admin e amministrazione")

    from reportlab.lib.units import mm
    from reportlab.platypus import Table, Paragraph, Spacer
    from app import pdf_theme as T

    where = ["1=1"]
    params = {}
    if mese:
        where.append("to_char(o.data, 'YYYY-MM') = :mese")
        params["mese"] = mese
    if utente_id:
        where.append("o.utente_id = :uid")
        params["uid"] = utente_id
    rows = db.execute(text(f"""
        {_SELECT_ORE}
        WHERE {' AND '.join(where)}
        ORDER BY operatore, c.nome NULLS FIRST, o.data
    """), params).mappings().all()

    S = T.make_styles()
    story = []
    story += T.masthead(S, "Ore lavorate", _mese_label(mese))

    if not rows:
        story.append(Paragraph("Nessuna registrazione per il periodo selezionato.", S["body"]))
        buf = io.BytesIO()
        T.build(buf, story, title="Ore lavorate")
        return StreamingResponse(buf, media_type="application/pdf",
                                 headers={"Content-Disposition": 'attachment; filename="ore_lavorate.pdf"'})

    def _f(x):
        return f"{float(x):.2f}".rstrip("0").rstrip(".").replace(".", ",")

    # ── Riepilogo: operatore × cantiere (giornate + ore) ──────────────────────
    agg = {}   # (operatore, cantiere) -> [giornate:set(data), ore]
    for r in rows:
        k = (r["operatore"], r["cantiere_nome"] or "— Senza cantiere (ufficio) —")
        d = agg.setdefault(k, [set(), 0.0])
        d[0].add(r["data"]); d[1] += float(r["ore"])

    story.append(Paragraph("Riepilogo per operatore e cantiere", S["h2"]))
    data_tab = [["Operatore", "Cantiere", "Giornate", "Ore"]]
    span_rows = []          # righe subtotale operatore (per lo stile)
    tot_gen_ore = 0.0
    tot_gen_gg = 0
    ultimo_op = None
    op_ore = 0.0
    op_gg = 0

    def _chiudi_operatore():
        nonlocal op_ore, op_gg
        if ultimo_op is not None:
            data_tab.append(["", f"Totale {ultimo_op}", str(op_gg), _f(op_ore) + " h"])
            span_rows.append(len(data_tab) - 1)
        op_ore = 0.0
        op_gg = 0

    for (op, cant), (giorni, ore) in sorted(agg.items(), key=lambda x: (x[0][0].lower(), x[0][1].lower())):
        if ultimo_op is not None and op != ultimo_op:
            _chiudi_operatore()
        ultimo_op = op
        data_tab.append([op, cant, str(len(giorni)), _f(ore) + " h"])
        op_ore += ore
        op_gg += len(giorni)
        tot_gen_ore += ore
        tot_gen_gg += len(giorni)
    _chiudi_operatore()
    data_tab.append(["", "TOTALE GENERALE", str(tot_gen_gg), _f(tot_gen_ore) + " h"])

    n_body = len(data_tab) - 2   # esclusa header + riga totale generale
    t = Table(data_tab, colWidths=[52*mm, 68*mm, 22*mm, 26*mm], repeatRows=1)
    st = T.data_table_style(n_body, has_totals=True, total_rows=1)
    from reportlab.lib import colors as _c
    for rr in span_rows:
        st.add("BACKGROUND", (0, rr), (-1, rr), T.BG_SOFT)
        st.add("FONTNAME", (0, rr), (-1, rr), T.FONT_SB)
    st.add("ALIGN", (2, 0), (-1, -1), "RIGHT")
    t.setStyle(st)
    story.append(t)
    story.append(Spacer(1, 8*mm))

    # ── Dettaglio giornaliero per operatore ──────────────────────────────────
    story.append(Paragraph("Dettaglio giornaliero", S["h2"]))
    per_op = {}
    for r in rows:
        per_op.setdefault(r["operatore"], []).append(r)

    for op in sorted(per_op, key=str.lower):
        righe_op = per_op[op]
        tot_op = sum(float(x["ore"]) for x in righe_op)
        story.append(Paragraph(f"{op}  —  {_f(tot_op)} h", S["value_b"]))
        dett = [["Data", "Cantiere", "Ore", "Dettaglio operazioni"]]
        for x in righe_op:
            dett.append([
                x["data"].strftime("%d/%m/%Y") if hasattr(x["data"], "strftime") else str(x["data"]),
                x["cantiere_nome"] or "— ufficio —",
                _f(x["ore"]),
                Paragraph((x["descrizione"] or "").strip()[:400], S["cell"]),
            ])
        dt = Table(dett, colWidths=[20*mm, 44*mm, 14*mm, 90*mm], repeatRows=1)
        dst = T.data_table_style(len(dett) - 1)
        dst.add("ALIGN", (2, 0), (2, -1), "RIGHT")
        dt.setStyle(dst)
        story.append(dt)
        story.append(Spacer(1, 5*mm))

    buf = io.BytesIO()
    T.build(buf, story, title="Ore lavorate")
    nome = f"ore_lavorate_{mese or 'tutte'}.pdf"
    return StreamingResponse(buf, media_type="application/pdf",
                             headers={"Content-Disposition": f'attachment; filename="{nome}"'})
