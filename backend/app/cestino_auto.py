"""Cestino "come quello di Windows": tutto quello che un utente elimina dall'app
(richieste DELETE) finisce nel cestino e si può ripristinare.

Come funziona, senza toccare i singoli endpoint:
  - il middleware mette in un ContextVar i dati della richiesta (chi, metodo);
  - un evento della sessione SQLAlchemy, prima di scrivere, fotografa le righe che
    stanno per sparire (con figli e nipoti, cestino.fotografa) e i soli campi
    modificati delle righe toccate (es. una foto tolta dalla lista di un diario);
  - dopo la scrittura annota le righe nuove create dall'eliminazione (es. il
    "segnaposto" della foto eliminata): al ripristino si tolgono;
  - una richiesta = una voce nel cestino.
I file su R2 eliminati nella stessa richiesta NON si cancellano subito: restano
finché si svuota il cestino (o 90 giorni), così il ripristino li ritrova.
"""
import contextvars
import copy
import uuid

import sqlalchemy as sa
from sqlalchemy import event, inspect as sa_inspect

from app import cestino

richiesta_corrente: contextvars.ContextVar = contextvars.ContextVar("richiesta_corrente", default=None)

# tabelle che non vanno nel cestino (rumore tecnico o cestino stesso)
_ESCLUSE = {
    "cestino", "registro_attivita", "chiavi_backup", "file_in_cestino", "error_log", "error_logs",
    "push_subscriptions", "notifiche_inapp", "assegnazioni_operatore", "alembic_version",
    "cantieri",  # il cantiere intero ha la sua fotografia (elimina_cantiere_completo)
}

NOMI = {
    "comm_preventivi": "Preventivo", "comm_preventivo_voci": "Voce di preventivo", "comm_clienti": "Cliente",
    "comm_listino": "Voce di listino", "comm_preventivi_artigiani": "Preventivo artigiano",
    "comm_stanze": "Stanza del rilievo", "comm_superfici": "Superficie del rilievo", "comm_foto": "Foto del rilievo",
    "comm_allegati": "Allegato", "rapportini_operativi": "Rapportino", "diari_giornalieri": "Diario",
    "foto_cantiere": "Foto", "documenti": "Documento", "archivio_docs": "Documento d'archivio",
    "spese": "Spesa", "fatture_fornitori": "Fattura fornitore", "ordini_acquisto": "Ordine", "bolle_consegna": "Bolla",
    "sal": "SAL", "fasi_lavoro": "Fase", "preventivi": "Computo/preventivo", "preventivi_artigiani": "Preventivo artigiano",
    "ore_extra": "Ore", "ore_lavorate": "Ore lavorate", "utenti": "Utente", "artigiani": "Artigiano",
    "note_campo": "Nota di campo", "non_conformita": "Non conformità", "misure_contabilita": "Misura",
    "appunti": "Appunto", "richieste_documenti": "Richiesta documenti", "stime_lavorazione": "Stima materiali",
}


def nuova_richiesta(metodo: str, percorso: str, utente_id):
    return {"id": uuid.uuid4().hex, "metodo": metodo, "percorso": percorso, "utente_id": utente_id,
            "voce": None, "foto": None}


def _etichetta(obj) -> str:
    t = obj.__table__.name
    base = NOMI.get(t, t.replace("_", " "))
    for attr in ("nome", "numero", "titolo", "descrizione", "nome_file", "filename", "cognome", "data"):
        v = getattr(obj, attr, None)
        if v:
            s = str(v)
            if attr == "nome" and getattr(obj, "cognome", None):
                s = f"{v} {obj.cognome}"
            return f"{base}: {s[:120]}"
    return f"{base} n. {getattr(obj, 'id', '')}"


def _pk(obj):
    st = sa_inspect(obj)
    ident = st.identity or st.mapper.primary_key_from_instance(obj)
    return ident[0] if ident and len(ident) == 1 else None


def _unisci(foto, nuova):
    if foto is None:
        return nuova
    for t, righe in nuova["righe"].items():
        dest = foto["righe"].setdefault(t, [])
        visti = {r.get("id") for r in dest}
        dest += [r for r in righe if r.get("id") not in visti]
    foto["stacchi"] += nuova.get("stacchi", [])
    foto["ripristina_valori"] = foto.get("ripristina_valori", []) + nuova.get("ripristina_valori", [])
    return foto


def _nome_utente(conn, uid):
    if not uid:
        return None
    r = conn.execute(sa.text("SELECT nome, cognome FROM utenti WHERE id = :i"), {"i": uid}).first()
    return f"{r[0]} {r[1] or ''}".strip() if r else None


def prima_di_scrivere(session, flush_context, instances):
    ric = richiesta_corrente.get()
    if not ric or ric["metodo"] != "DELETE" or session.info.get("senza_cestino"):
        return
    eliminati = [o for o in session.deleted if hasattr(o, "__table__") and o.__table__.name not in _ESCLUSE]
    modificati = [o for o in session.dirty if hasattr(o, "__table__") and o.__table__.name not in _ESCLUSE
                  and session.is_modified(o, include_collections=False)]
    if not eliminati and not modificati:
        return
    conn = session.connection()
    foto = {"radice": None, "ids": [], "righe": {}, "stacchi": [], "ripristina_valori": []}
    for o in eliminati:
        pk = _pk(o)
        if pk is None:
            continue
        foto = _unisci(foto, cestino.fotografa(conn, o.__table__.name, [pk]))
        if foto["radice"] is None:
            foto["radice"], foto["ids"] = o.__table__.name, [pk]
    for o in modificati:
        pk = _pk(o)
        if pk is None:
            continue
        vecchi = {}
        st = sa_inspect(o)
        for attr in st.mapper.column_attrs:
            h = st.attrs[attr.key].history
            if h.has_changes() and h.deleted:
                col = attr.columns[0].name
                vecchi[col] = cestino.a_json(h.deleted[0])
        if vecchi:
            foto["ripristina_valori"].append({"tabella": o.__table__.name, "id": pk, "valori": vecchi})
    if not foto["righe"] and not foto["ripristina_valori"]:
        return
    from app.models.sicurezza import ElementoCestino
    principale = next((o for o in eliminati if str(_pk(o)) == ric["percorso"].rstrip("/").split("/")[-1]),
                      eliminati[0] if eliminati else modificati[0])
    if ric["voce"] is None:
        e = ElementoCestino(
            tipo=principale.__table__.name, oggetto_id=_pk(principale) or 0, nome=_etichetta(principale)[:300],
            dati=copy.deepcopy(foto), righe=cestino.conta_righe(foto) + len(foto["ripristina_valori"]),
            eliminato_da=ric["utente_id"], eliminato_da_nome=_nome_utente(conn, ric["utente_id"]),
            richiesta=ric["id"])
        session.add(e)
        ric["voce"], ric["foto"] = e, foto
    else:
        # mai modificare sul posto il JSON già scritto: SQLAlchemy non vedrebbe la differenza
        unita = _unisci(copy.deepcopy(ric["foto"]), foto)
        ric["foto"] = unita
        ric["voce"].dati = copy.deepcopy(unita)
        ric["voce"].righe = cestino.conta_righe(unita) + len(unita.get("ripristina_valori", []))


def dopo_scrivere(session, flush_context):
    ric = richiesta_corrente.get()
    if not ric or ric["metodo"] != "DELETE" or ric["voce"] is None:
        return
    nuove = [{"tabella": o.__table__.name, "id": _pk(o)} for o in session.new
             if hasattr(o, "__table__") and o.__table__.name not in _ESCLUSE and _pk(o) is not None]
    if nuove:
        ric.setdefault("da_annotare", []).extend(nuove)


def dopo_flush_completo(session, flush_context):
    # qui si può ancora modificare la voce: finisce nel flush successivo del commit
    ric = richiesta_corrente.get()
    if not ric or not ric.get("da_annotare") or ric["voce"] is None:
        return
    foto = copy.deepcopy(ric["foto"])
    foto["aggiunte"] = foto.get("aggiunte", []) + ric.pop("da_annotare")
    ric["foto"] = foto
    ric["voce"].dati = copy.deepcopy(foto)


def collega(session_factory):
    event.listen(session_factory, "before_flush", prima_di_scrivere)
    event.listen(session_factory, "after_flush", dopo_scrivere)
    event.listen(session_factory, "after_flush_postexec", dopo_flush_completo)


def ripristina_voce(conn, dati: dict, extra_stacco=None) -> dict:
    """Ripristino completo di una voce del cestino: righe, collegamenti, campi
    modificati e rimozione delle righe create dall'eliminazione."""
    esito = cestino.ripristina(conn, dati, extra_stacco=extra_stacco) if dati.get("righe") else {"righe": 0, "collegamenti": 0}
    meta = None
    if dati.get("ripristina_valori") or dati.get("aggiunte"):
        meta = cestino.struttura(conn)
    for rv in dati.get("ripristina_valori", []):
        t = meta.tables.get(rv["tabella"])
        if t is None:
            continue
        valori = {k: cestino.da_json(t.c[k], v) for k, v in rv["valori"].items() if k in t.c}
        conn.execute(sa.update(t).where(t.c.id == rv["id"]).values(**valori))
        esito["righe"] += 1
    for ag in dati.get("aggiunte", []):
        t = meta.tables.get(ag["tabella"])
        if t is not None and "id" in t.c:
            conn.execute(sa.delete(t).where(t.c.id == ag["id"]))
    return esito
