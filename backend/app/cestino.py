"""Fotografia e ripristino di righe del database, in modo generico.

Prima di eliminare un cantiere se ne fotografa TUTTO quello che sparirebbe
(righe del cantiere, dei figli e dei nipoti, seguendo le chiavi esterne vere del
database) e i collegamenti che verrebbero solo staccati (Gantt, preventivo
commerciale…). Il ripristino rimette le righe con gli stessi id e riattacca i
collegamenti. I file su R2 non vengono toccati dall'eliminazione, quindi foto e
documenti tornano visibili.

Le stesse funzioni di conversione servono al backup completo (tutte le tabelle
in JSON, apribile ovunque, senza pg_dump).
"""
import base64
import datetime as _dt
import decimal
import uuid

import sqlalchemy as sa

# Collegamenti da chi punta alla tabella che si sta eliminando: questi vengono
# solo staccati (cantiere_id = NULL) e al ripristino si riattaccano.
_SOLO_STACCA = ("SET NULL",)


def struttura(conn) -> sa.MetaData:
    meta = sa.MetaData()
    meta.reflect(bind=conn)
    if conn.dialect.name == "sqlite":
        # la riflessione SQLite non legge ON DELETE: lo prendiamo dal PRAGMA
        for t in meta.tables.values():
            azioni = {r[3]: r[6] for r in conn.exec_driver_sql(f"PRAGMA foreign_key_list('{t.name}')").fetchall()}
            for fk in t.foreign_keys:
                a = (azioni.get(fk.parent.name) or "").upper()
                if a and a != "NO ACTION":
                    fk.ondelete = a
    return meta


# ───────────────────────────── conversione valori ─────────────────────────────

def a_json(v):
    if v is None or isinstance(v, (bool, int, float, str, list, dict)):
        return v
    if isinstance(v, (_dt.datetime, _dt.date, _dt.time)):
        return v.isoformat()
    if isinstance(v, decimal.Decimal):
        return float(v)
    if isinstance(v, (bytes, bytearray, memoryview)):
        return {"__b64__": base64.b64encode(bytes(v)).decode()}
    if isinstance(v, uuid.UUID):
        return str(v)
    if hasattr(v, "value"):          # Enum python
        return v.value
    return str(v)


def riga_json(riga) -> dict:
    return {k: a_json(v) for k, v in riga._mapping.items()}


def da_json(col: sa.Column, v):
    if v is None:
        return None
    if isinstance(v, dict) and "__b64__" in v:
        return base64.b64decode(v["__b64__"])
    t = col.type
    try:
        if isinstance(t, sa.DateTime) and isinstance(v, str):
            return _dt.datetime.fromisoformat(v)
        if isinstance(t, sa.Date) and isinstance(v, str):
            return _dt.date.fromisoformat(v[:10])
        if isinstance(t, sa.Time) and isinstance(v, str):
            return _dt.time.fromisoformat(v)
    except ValueError:
        return v
    return v


def _pk(t: sa.Table, r: dict):
    cols = [c.name for c in t.primary_key.columns] or list(r.keys())
    return tuple(r.get(c) for c in cols)


# ───────────────────────────── fotografia ─────────────────────────────

def fotografa(conn, radice: str, ids) -> dict:
    """Tutte le righe che spariscono eliminando `radice` con quegli id, più i
    collegamenti che vengono solo staccati. Restituisce un dict serializzabile."""
    meta = struttura(conn)
    prese: dict[str, dict] = {}          # tabella -> {pk: riga}
    stacchi = []                          # {tabella, pk, colonna, valore}
    figli: dict[str, list] = {}
    for t in meta.tables.values():
        for fk in t.foreign_keys:
            figli.setdefault(fk.column.table.name, []).append(fk)

    def prendi(t: sa.Table, righe):
        nuove = []
        dest = prese.setdefault(t.name, {})
        for r in righe:
            d = riga_json(r)
            k = _pk(t, d)
            if k not in dest:
                dest[k] = d
                nuove.append(d)
        return nuove

    root = meta.tables[radice]
    coda = [(root, prendi(root, conn.execute(sa.select(root).where(root.c.id.in_(list(ids)))).fetchall()))]
    while coda:
        t, righe = coda.pop()
        if not righe:
            continue
        for fk in figli.get(t.name, []):
            valori = {r.get(fk.column.name) for r in righe} - {None}
            if not valori:
                continue
            ft = fk.parent.table
            q = sa.select(ft).where(fk.parent.in_(list(valori)))
            trovate = conn.execute(q).fetchall()
            if (fk.ondelete or "").upper() in _SOLO_STACCA:
                for r in trovate:
                    d = riga_json(r)
                    stacchi.append({"tabella": ft.name, "pk": [c.name for c in ft.primary_key.columns],
                                    "pk_val": list(_pk(ft, d)), "colonna": fk.parent.name,
                                    "valore": d.get(fk.parent.name), "riga": d})
            else:
                coda.append((ft, prendi(ft, trovate)))
    return {
        "radice": radice, "ids": list(ids),
        "righe": {n: list(v.values()) for n, v in prese.items()},
        "stacchi": stacchi,
    }


def conta_righe(foto: dict) -> int:
    return sum(len(v) for v in foto["righe"].values())


# ───────────────────────────── ripristino ─────────────────────────────

def _inserisci(conn, t: sa.Table, valori: dict):
    if conn.dialect.name == "postgresql":
        from sqlalchemy.dialects.postgresql import insert
    else:
        from sqlalchemy.dialects.sqlite import insert
    conn.execute(insert(t).values(**valori).on_conflict_do_nothing())


def ripristina(conn, foto: dict, extra_stacco=None) -> dict:
    """Rimette le righe fotografate (stessi id) e riattacca i collegamenti che
    nel frattempo sono rimasti vuoti. `extra_stacco(conn, stacco)` permette
    di sistemare altri campi del collegamento (es. stato del preventivo)."""
    meta = struttura(conn)
    righe = foto["righe"]
    ordine = [t.name for t in meta.sorted_tables if t.name in righe]
    pos = {n: i for i, n in enumerate(ordine)}
    rinvii = []
    rimesse = 0
    for nome in ordine:
        t = meta.tables[nome]
        for r in righe[nome]:
            valori = {c.name: da_json(c, r[c.name]) for c in t.columns if c.name in r}
            # riferimenti a righe che entrano dopo (o alla stessa tabella): prima vuoti, poi si riempiono
            for fk in t.foreign_keys:
                col, dest = fk.parent, fk.column.table.name
                if valori.get(col.name) is not None and col.nullable and dest in pos and pos[dest] >= pos[nome]:
                    rinvii.append((t, valori, col.name, valori[col.name]))
                    valori = {**valori, col.name: None}
            _inserisci(conn, t, valori)
            rimesse += 1
    for t, valori, col, v in rinvii:
        pkc = list(t.primary_key.columns)
        cond = sa.and_(*[c == valori[c.name] for c in pkc])
        conn.execute(sa.update(t).where(cond).values({col: v}))
    riattaccati = 0
    for s in foto.get("stacchi", []):
        t = meta.tables.get(s["tabella"])
        if t is None or s["colonna"] not in t.c:
            continue
        cond = sa.and_(*[t.c[c] == v for c, v in zip(s["pk"], s["pk_val"])], t.c[s["colonna"]].is_(None))
        res = conn.execute(sa.update(t).where(cond).values({s["colonna"]: s["valore"]}))
        if res.rowcount:
            riattaccati += 1
            if extra_stacco:
                extra_stacco(conn, s)
    return {"righe": rimesse, "collegamenti": riattaccati}


# ───────────────────────────── backup completo ─────────────────────────────

def esporta_tutto(conn):
    """Genera (nome_tabella, [righe json]) per tutte le tabelle del database."""
    meta = struttura(conn)
    for t in meta.sorted_tables:
        pk = list(t.primary_key.columns)
        q = sa.select(t).order_by(*pk) if pk else sa.select(t)
        yield t.name, [riga_json(r) for r in conn.execute(q).fetchall()]
