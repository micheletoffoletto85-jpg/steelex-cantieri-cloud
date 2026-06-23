import json, logging
from fastapi import APIRouter, Depends, HTTPException
logger = logging.getLogger(__name__)
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.notifica import PushSubscription
from app.models.notifica_inapp import NotificaInApp
from app.models.utente import Utente, RuoloUtente
from app.auth import get_current_user
from app.config import settings
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

router = APIRouter(prefix="/notifiche", tags=["Notifiche"])


class SubscribeRequest(BaseModel):
    endpoint: str
    p256dh: str
    auth: str


@router.get("/vapid-public-key")
def get_vapid_public_key():
    if not settings.VAPID_PUBLIC_KEY:
        raise HTTPException(status_code=503, detail="Push notifications non configurate")
    return {"public_key": settings.VAPID_PUBLIC_KEY}


@router.post("/subscribe")
def subscribe(
    data: SubscribeRequest,
    db: Session = Depends(get_db),
    user: Utente = Depends(get_current_user),
):
    existing = db.query(PushSubscription).filter(
        PushSubscription.user_id == user.id,
        PushSubscription.endpoint == data.endpoint,
    ).first()
    if existing:
        existing.p256dh = data.p256dh
        existing.auth = data.auth
    else:
        sub = PushSubscription(
            user_id=user.id,
            endpoint=data.endpoint,
            p256dh=data.p256dh,
            auth=data.auth,
        )
        db.add(sub)
    db.commit()
    return {"ok": True}


class NotificaInAppOut(BaseModel):
    id: int
    cantiere_id: Optional[int] = None
    tipo: str
    titolo: str
    corpo: Optional[str] = None
    url: Optional[str] = None
    letta: bool
    creato_il: datetime
    class Config: from_attributes = True


@router.get("/inapp", response_model=List[NotificaInAppOut])
def get_notifiche_inapp(
    db: Session = Depends(get_db),
    user: Utente = Depends(get_current_user),
):
    return db.query(NotificaInApp).filter(
        NotificaInApp.user_id == user.id
    ).order_by(NotificaInApp.creato_il.desc()).limit(50).all()


@router.post("/inapp/{notifica_id}/leggi")
def segna_letta(
    notifica_id: int,
    db: Session = Depends(get_db),
    user: Utente = Depends(get_current_user),
):
    n = db.query(NotificaInApp).filter(NotificaInApp.id == notifica_id, NotificaInApp.user_id == user.id).first()
    if n:
        n.letta = True; db.commit()
    return {"ok": True}


@router.post("/inapp/leggi-tutte")
def segna_tutte_lette(
    db: Session = Depends(get_db),
    user: Utente = Depends(get_current_user),
):
    db.query(NotificaInApp).filter(
        NotificaInApp.user_id == user.id, NotificaInApp.letta == False
    ).update({"letta": True})
    db.commit()
    return {"ok": True}


@router.delete("/unsubscribe")
def unsubscribe(
    endpoint: str,
    db: Session = Depends(get_db),
    user: Utente = Depends(get_current_user),
):
    db.query(PushSubscription).filter(
        PushSubscription.user_id == user.id,
        PushSubscription.endpoint == endpoint,
    ).delete()
    db.commit()
    return {"ok": True}


@router.get("/diagnostica")
def diagnostica_push(
    db: Session = Depends(get_db),
    user: Utente = Depends(get_current_user),
):
    """Diagnostica chiave VAPID: testa tutti i formati possibili."""
    from app.webpush_sender import carica_chiave_ec
    subs = db.query(PushSubscription).filter(PushSubscription.user_id == user.id).all()
    raw = (settings.VAPID_PRIVATE_KEY or '').replace('\\n', '\n').strip()
    key_ok = False
    key_err = None
    try:
        carica_chiave_ec(raw)
        key_ok = True
    except Exception as e:
        key_err = str(e)

    return {
        "user_id": user.id,
        "subscriptions": len(subs),
        "endpoints": [s.endpoint[:80] for s in subs],
        "vapid_public": bool(settings.VAPID_PUBLIC_KEY),
        "vapid_private": bool(settings.VAPID_PRIVATE_KEY),
        "vapid_email": settings.VAPID_EMAIL,
        "chiave_ec_ok": key_ok,
        "chiave_ec_errore": key_err,
        "chiave_lunghezza": len(raw),
        "chiave_inizio": raw[:30] if raw else "",
    }


@router.post("/test-push")
def test_push(
    db: Session = Depends(get_db),
    user: Utente = Depends(get_current_user),
):
    """Manda push di test e ritorna risultato per-endpoint."""
    from app.webpush_sender import send_push, WebPushError

    subs = db.query(PushSubscription).filter(PushSubscription.user_id == user.id).all()
    vapid_ok = bool(settings.VAPID_PRIVATE_KEY and settings.VAPID_PUBLIC_KEY)
    if not vapid_ok:
        return {"ok": False, "dettaglio": "VAPID non configurato", "subscriptions": len(subs)}

    vapid_sub = settings.VAPID_EMAIL or ""
    if not vapid_sub.startswith("mailto:"):
        vapid_sub = f"mailto:{vapid_sub}"

    payload = json.dumps({
        "title": "🔔 Test Notifica FR",
        "body": f"Ciao {user.nome}! Push funzionante.",
        "url": "/",
        "icon": "/icons/icon-192.png",
    })

    risultati = []
    for sub in subs:
        tipo = "apple" if "apple.com" in sub.endpoint else "fcm" if "fcm" in sub.endpoint else "altro"
        try:
            sc = send_push(
                endpoint=sub.endpoint,
                p256dh=sub.p256dh,
                auth=sub.auth,
                payload=payload,
                vapid_private_key_raw=settings.VAPID_PRIVATE_KEY or '',
                vapid_sub=vapid_sub,
            )
            risultati.append({"tipo": tipo, "ok": True, "status": sc, "endpoint": sub.endpoint[:50] + "..."})
        except WebPushError as e:
            risultati.append({"tipo": tipo, "ok": False, "status": e.status_code, "errore": str(e)[:200], "risposta": e.response_text, "endpoint": sub.endpoint[:50] + "..."})
            if e.status_code in (404, 410):
                try: db.delete(sub); db.commit()
                except Exception: pass
        except Exception as e:
            risultati.append({"tipo": tipo, "ok": False, "errore": f"{type(e).__name__}: {e}"[:300], "endpoint": sub.endpoint[:50] + "..."})

    try:
        n = NotificaInApp(user_id=user.id, titolo="🔔 Test notifica", corpo="Test push inviato", url="/", tipo="info")
        db.add(n); db.commit()
    except Exception: pass

    tutti_ok = all(r["ok"] for r in risultati)
    return {"ok": tutti_ok, "subscriptions": len(subs), "risultati": risultati, "vapid_sub": vapid_sub}


# ─── HELPER: notifica basata su ruoli per un cantiere ─────────────────────────

def notifica_cantiere(
    db: Session,
    cantiere_id: int,
    ruoli: list[str],
    titolo: str,
    corpo: str,
    escludi_id: int | None = None,
    extra_user_ids: list[int] | None = None,
    tipo: str = "info",
    url: str | None = None,
):
    from app.models.utente import Utente as UtenteModel
    ruoli_estesi = list(set(ruoli) | {"admin", "capo_cantiere", "amministrazione"})
    dest = db.query(UtenteModel).filter(
        UtenteModel.ruolo.in_(ruoli_estesi),
        UtenteModel.attivo == True,
    ).all()
    ids = {u.id for u in dest}
    if extra_user_ids:
        ids.update(extra_user_ids)
    if escludi_id:
        ids.discard(escludi_id)
    if ids:
        dest_url = url or f"/cantieri/{cantiere_id}"
        invia_notifica(db, list(ids), titolo, corpo, dest_url, tipo=tipo, cantiere_id=cantiere_id)


# ─── HELPER: invia notifica a uno o più utenti ────────────────────────────────

def invia_notifica(
    db: Session,
    user_ids: list[int],
    titolo: str,
    corpo: str,
    url: str = "/",
    tipo: str = "info",
    cantiere_id: int | None = None,
):
    """Invia notifica in-app (DB) + push a tutti i dispositivi degli utenti indicati."""
    for uid in user_ids:
        try:
            n = NotificaInApp(user_id=uid, titolo=titolo, corpo=corpo, url=url, tipo=tipo, cantiere_id=cantiere_id)
            db.add(n)
        except Exception:
            pass
    try:
        db.commit()
    except Exception:
        db.rollback()

    if not settings.VAPID_PRIVATE_KEY or not settings.VAPID_PUBLIC_KEY:
        logger.warning("[PUSH] VAPID non configurato — push non inviata")
        return

    subs = db.query(PushSubscription).filter(
        PushSubscription.user_id.in_(user_ids)
    ).all()
    if not subs:
        return

    from app.webpush_sender import send_push, WebPushError

    vapid_sub = settings.VAPID_EMAIL or ""
    if not vapid_sub.startswith("mailto:"):
        vapid_sub = f"mailto:{vapid_sub}"

    payload = json.dumps({
        "title": titolo,
        "body": corpo,
        "url": url,
        "icon": "/icons/icon-192.png",
    })

    logger.info(f"[PUSH] Invio a user_ids={user_ids} → {len(subs)} subscription(s)")

    for sub in subs:
        try:
            sc = send_push(
                endpoint=sub.endpoint,
                p256dh=sub.p256dh,
                auth=sub.auth,
                payload=payload,
                vapid_private_key_raw=settings.VAPID_PRIVATE_KEY,
                vapid_sub=vapid_sub,
            )
            logger.info(f"[PUSH] ✅ status={sc} endpoint={sub.endpoint[:60]}")
        except WebPushError as e:
            logger.error(f"[PUSH] ❌ status={e.status_code} endpoint={sub.endpoint[:60]}: {e.response_text[:100]}")
            if e.status_code in (404, 410):
                try: db.delete(sub); db.commit()
                except Exception: pass
        except Exception as e:
            logger.error(f"[PUSH] ❌ {type(e).__name__}: {e}")
