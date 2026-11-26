"""Cestino, registro attività e backup (solo admin; il backup anche con chiave)."""
import hashlib
import io
import json
import secrets
import zipfile
from datetime import datetime, timezone, date
from typing import Optional

import sqlalchemy as sa
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app import cestino, registro
from app.auth import require_admin
from app.config import settings
from app.database import get_db
from app.models.sicurezza import ElementoCestino, RegistroAttivita, ChiaveBackup
from app.models.utente import Utente, RuoloUtente

router = APIRouter(prefix="/sicurezza", tags=["Sicurezza e backup"])


def _nome(u) -> str:
    return f"{u.nome} {u.cognome}".strip()


# ───────────────────────────── cestino ─────────────────────────────

@router.get("/cestino")
def lista_cestino(db: Session = Depends(get_db), user: Utente = Depends(require_admin)):
    righe = db.query(ElementoCestino).order_by(ElementoCestino.eliminato_il.desc()).limit(300).all()
    return [{
        "id": e.id, "tipo": e.tipo, "oggetto_id": e.oggetto_id, "nome": e.nome, "righe": e.righe,
        "eliminato_il": e.eliminato_il, "eliminato_da_nome": e.eliminato_da_nome,
        "ripristinato_il": e.ripristinato_il, "ripristinato_da_nome": e.ripristinato_da_nome,
        "dettaglio": {k: len(v) for k, v in (e.dati or {}).get("righe", {}).items()},
    } for e in righe]


def _riattacca_preventivo(conn, s: dict):
    # il preventivo commerciale torna "accettato" com'era (l'eliminazione lo aveva rimesso a "inviato")
    if s["tabella"] == "comm_preventivi" and s["colonna"] == "cantiere_id":
        r = s.get("riga") or {}
        conn.execute(sa.text(
            "UPDATE comm_preventivi SET stato = :st, esito_il = :es WHERE id = :id AND stato = 'inviato'"),
            {"st": r.get("stato"), "es": r.get("esito_il"), "id": s["pk_val"][0]})


@router.post("/cestino/{elemento_id}/ripristina")
def ripristina_dal_cestino(elemento_id: int, db: Session = Depends(get_db), user: Utente = Depends(require_admin)):
    e = db.query(ElementoCestino).filter(ElementoCestino.id == elemento_id).first()
    if not e:
        raise HTTPException(404, "Elemento non trovato")
    if e.ripristinato_il:
        raise HTTPException(409, "Già ripristinato")
    conn = db.connection()
    radice = e.dati.get("radice")
    if conn.execute(sa.text(f"SELECT 1 FROM {radice} WHERE id = :i"), {"i": e.oggetto_id}).first():
        raise HTTPException(409, "Esiste già: non c'è niente da ripristinare")
    esito = cestino.ripristina(conn, e.dati, extra_stacco=_riattacca_preventivo)
    e.ripristinato_il = datetime.now(timezone.utc)
    e.ripristinato_da_nome = _nome(user)
    db.commit()
    return {"ok": True, **esito, "oggetto_id": e.oggetto_id}


# ───────────────────────────── registro ─────────────────────────────

@router.get("/registro")
def leggi_registro(
    dal: Optional[date] = None, al: Optional[date] = None,
    utente_id: Optional[int] = None, cantiere_id: Optional[int] = None,
    cerca: Optional[str] = None, solo_eliminazioni: bool = False,
    limit: int = Query(300, ge=1, le=2000),
    db: Session = Depends(get_db), user: Utente = Depends(require_admin),
):
    q = db.query(RegistroAttivita)
    if dal:
        q = q.filter(RegistroAttivita.quando >= datetime.combine(dal, datetime.min.time()))
    if al:
        q = q.filter(RegistroAttivita.quando < datetime.combine(al, datetime.max.time()))
    if utente_id:
        q = q.filter(RegistroAttivita.utente_id == utente_id)
    if cantiere_id:
        q = q.filter(RegistroAttivita.cantiere_id == cantiere_id)
    if solo_eliminazioni:
        q = q.filter(RegistroAttivita.metodo == "DELETE")
    if cerca:
        like = f"%{cerca}%"
        q = q.filter(sa.or_(RegistroAttivita.descrizione.ilike(like), RegistroAttivita.percorso.ilike(like),
                            RegistroAttivita.utente_nome.ilike(like)))
    righe = q.order_by(RegistroAttivita.quando.desc()).limit(limit).all()
    ids = {r.cantiere_id for r in righe if r.cantiere_id}
    nomi = {}
    if ids:
        from app.models.cantiere import Cantiere
        nomi = dict(db.query(Cantiere.id, Cantiere.nome).filter(Cantiere.id.in_(ids)).all())
        for c in db.query(ElementoCestino).filter(ElementoCestino.tipo == "cantiere", ElementoCestino.oggetto_id.in_(ids)).all():
            nomi.setdefault(c.oggetto_id, c.nome)
    return [{
        "id": r.id, "quando": r.quando, "utente_id": r.utente_id, "utente_nome": r.utente_nome,
        "metodo": r.metodo, "percorso": r.percorso, "esito": r.esito, "descrizione": r.descrizione,
        "cantiere_id": r.cantiere_id, "cantiere_nome": nomi.get(r.cantiere_id),
    } for r in righe]


# ───────────────────────────── chiavi backup ─────────────────────────────

def _impronta(chiave: str) -> str:
    return hashlib.sha256(chiave.encode()).hexdigest()


class ChiaveIn(BaseModel):
    nome: str = "PC ufficio"


@router.get("/chiavi-backup")
def lista_chiavi(db: Session = Depends(get_db), user: Utente = Depends(require_admin)):
    return [{"id": k.id, "nome": k.nome, "creata_il": k.creata_il, "creata_da_nome": k.creata_da_nome,
             "ultimo_uso": k.ultimo_uso, "attiva": k.attiva}
            for k in db.query(ChiaveBackup).order_by(ChiaveBackup.id.desc()).all()]


@router.post("/chiavi-backup")
def crea_chiave(body: ChiaveIn, db: Session = Depends(get_db), user: Utente = Depends(require_admin)):
    chiave = "bk_" + secrets.token_urlsafe(32)
    k = ChiaveBackup(nome=(body.nome or "PC ufficio")[:120], impronta=_impronta(chiave), creata_da_nome=_nome(user))
    db.add(k)
    db.commit()
    # la chiave in chiaro si vede solo adesso: nel database resta solo l'impronta
    return {"id": k.id, "nome": k.nome, "chiave": chiave}


@router.delete("/chiavi-backup/{chiave_id}")
def revoca_chiave(chiave_id: int, db: Session = Depends(get_db), user: Utente = Depends(require_admin)):
    k = db.query(ChiaveBackup).filter(ChiaveBackup.id == chiave_id).first()
    if not k:
        raise HTTPException(404)
    k.attiva = False
    db.commit()
    return {"ok": True}


def admin_o_chiave(request: Request, db: Session = Depends(get_db)):
    chiave = request.headers.get("x-backup-key")
    if chiave:
        k = db.query(ChiaveBackup).filter(ChiaveBackup.impronta == _impronta(chiave), ChiaveBackup.attiva == True).first()  # noqa: E712
        if not k:
            raise HTTPException(401, "Chiave di backup non valida")
        k.ultimo_uso = datetime.now(timezone.utc)
        db.commit()
        return k
    uid = registro._utente_da_token(request.headers.get("authorization") or "")
    u = db.query(Utente).filter(Utente.id == uid, Utente.attivo == True).first() if uid else None  # noqa: E712
    if not u:
        raise HTTPException(401, "Serve l'accesso")
    if u.ruolo != RuoloUtente.admin:
        raise HTTPException(403, "Solo admin")
    return u


# ───────────────────────────── backup ─────────────────────────────

LEGGIMI = """BACKUP COMPLETO DEL DATABASE
App: {app} — creato il {quando}

Contiene TUTTE le tabelle del database, una per file, in formato JSON
(si apre con qualsiasi editor di testo; non serve nessun programma speciale).

  manifest.json      elenco tabelle, numero di righe, versione dello schema
  tabelle/*.json     le righe di ogni tabella

Per rimettere tutto in un database nuovo:
  1. crea un database PostgreSQL vuoto e avvia una volta il backend dell'app
     (crea lo schema giusto con le migrazioni)
  2. python backend/scripts/ripristina_backup.py <questo_file.zip> <DATABASE_URL>

Foto e documenti sono file separati (cartella file-r2 del backup sul PC).
"""


@router.get("/backup/database")
def backup_database(db: Session = Depends(get_db), chi=Depends(admin_o_chiave)):
    conn = db.connection()
    quando = datetime.now(timezone.utc)
    buf = io.BytesIO()
    conteggi = {}
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for nome, righe in cestino.esporta_tutto(conn):
            conteggi[nome] = len(righe)
            z.writestr(f"tabelle/{nome}.json", json.dumps(righe, ensure_ascii=False, default=str))
        try:
            versione = conn.execute(sa.text("SELECT version_num FROM alembic_version")).scalar()
        except Exception:
            versione = None
        app_nome = "STEELEX Cantieri"
        z.writestr("manifest.json", json.dumps({
            "app": app_nome, "creato_il": quando.isoformat(), "alembic": versione,
            "tabelle": conteggi, "righe_totali": sum(conteggi.values()),
        }, ensure_ascii=False, indent=2))
        z.writestr("LEGGIMI.txt", LEGGIMI.format(app=app_nome, quando=quando.strftime("%d/%m/%Y %H:%M UTC")))
    buf.seek(0)
    nome_file = f"backup-steelex-database-{quando.strftime('%Y-%m-%d_%H%M')}.zip"
    return StreamingResponse(buf, media_type="application/zip",
                             headers={"Content-Disposition": f'attachment; filename="{nome_file}"'})


@router.get("/backup/file-elenco")
def backup_elenco_file(chi=Depends(admin_o_chiave)):
    """Elenco di tutti i file su R2 (foto, documenti, audio) per il backup incrementale."""
    from app.storage import _r2_client
    client = _r2_client()
    if client is None:
        raise HTTPException(503, "Archivio file non configurato")
    out, token = [], None
    while True:
        kw = {"Bucket": settings.R2_BUCKET_NAME, "MaxKeys": 1000}
        if token:
            kw["ContinuationToken"] = token
        r = client.list_objects_v2(**kw)
        out += [{"chiave": o["Key"], "dimensione": o["Size"], "etag": o.get("ETag", "").strip('"'),
                 "modificato": o["LastModified"].isoformat()} for o in r.get("Contents", [])]
        if not r.get("IsTruncated"):
            break
        token = r.get("NextContinuationToken")
    return out


@router.get("/backup/file")
def backup_scarica_file(chiave: str, chi=Depends(admin_o_chiave)):
    from app.storage import _r2_client
    client = _r2_client()
    if client is None:
        raise HTTPException(503, "Archivio file non configurato")
    try:
        obj = client.get_object(Bucket=settings.R2_BUCKET_NAME, Key=chiave)
    except Exception:
        raise HTTPException(404, "File non trovato")
    return StreamingResponse(obj["Body"].iter_chunks(1024 * 256),
                             media_type=obj.get("ContentType") or "application/octet-stream")
