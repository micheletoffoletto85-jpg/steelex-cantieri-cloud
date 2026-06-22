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


def _get_vapid_key() -> str:
    """Restituisce la chiave privata VAPID normalizzata per pywebpush 1.x."""
    raw = (settings.VAPID_PRIVATE_KEY or '').replace('\\n', '\n').strip()
    return raw


class SubscribeRequest(BaseModel):
    endpoint: str
    p256dh: str
    auth: str


@router.get("/vapid-public-key")
def get_vapid_public_key():
    """Restituisce la chiave pubblica VAPID per il frontend."""
    if not settings.VAPID_PUBLIC_KEY:
        raise HTTPException(status_code=503, detail="Push notifications non configurate")
    return {"public_key": settings.VAPID_PUBLIC_KEY}


@router.post("/subscribe")
def subscribe(
    data: SubscribeRequest,
    db: Session = Depends(get_db),
    user: Utente = Depends(get_current_user),
):
    """Registra o aggiorna la subscription push per l'utente corrente."""
    # Aggiorna se già esiste per questo endpoint
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
    """Diagnostica push: quante subscription, VAPID ok, pywebpush installato."""
    subs = db.query(PushSubscription).filter(PushSubscription.user_id == user.id).all()
    try:
        from pywebpush import webpush
        pw_ok = True
    except ImportError:
        pw_ok = False
    return {
        "user_id": user.id,
        "subscriptions": len(subs),
        "endpoints": [s.endpoint[:80] for s in subs],
        "vapid_public": bool(settings.VAPID_PUBLIC_KEY),
        "vapid_private": bool(settings.VAPID_PRIVATE_KEY),
        "vapid_email": settings.VAPID_EMAIL,
        "pywebpush_ok": pw_ok,
    }


@router.post("/test-push")
def test_push(
    db: Session = Depends(get_db),
    user: Utente = Depends(get_current_user),
):
    """Manda push di test e ritorna risultato per-endpoint."""
    from pywebpush import webpush as _wp, WebPushException as _WPE
    subs = db.query(PushSubscription).filter(PushSubscription.user_id == user.id).all()
    vapid_ok = bool(settings.VAPID_PRIVATE_KEY and settings.VAPID_PUBLIC_KEY)
    logger.info(f"[TEST-PUSH] user={user.id} subscriptions={len(subs)} vapid={vapid_ok}")

    if not vapid_ok:
        return {"ok": False, "dettaglio": "VAPID non configurato", "subscriptions": len(subs)}

    private_key = _get_vapid_key(settings.VAPID_PRIVATE_KEY or '')
    vapid_sub = settings.VAPID_EMAIL
    if vapid_sub and not vapid_sub.startswith("mailto:"):
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
        aud = sub.endpoint.split("/")[0] + "//" + sub.endpoint.split("/")[2]
        try:
            resp = _wp(
                subscription_info={"endpoint": sub.endpoint, "keys": {"p256dh": sub.p256dh, "auth": sub.auth}},
                data=payload,
                vapid_private_key=private_key,
                vapid_claims={"sub": vapid_sub, "aud": aud},
                ttl=86400,
            )
            sc = getattr(resp, 'status_code', '?')
            risultati.append({"tipo": tipo, "ok": True, "status": sc, "endpoint": sub.endpoint[:50] + "..."})
        except _WPE as e:
            sc = None
            body = ""
            if hasattr(e, 'response') and e.response is not None:
                sc = getattr(e.response, 'status_code', None)
                try: body = e.response.text[:300]
                except Exception: pass
            risultati.append({"tipo": tipo, "ok": False, "status": sc, "errore": str(e)[:200], "risposta": body, "endpoint": sub.endpoint[:50] + "..."})
        except Exception as e:
            risultati.append({"tipo": tipo, "ok": False, "errore": f"{type(e).__name__}: {e}"[:200], "endpoint": sub.endpoint[:50] + "..."})

    # Salva anche la in-app notification
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
):
    """
    Invia notifica in-app + push agli utenti con i ruoli indicati.
    Admin, capo_cantiere, amministrazione ricevono SEMPRE tutte le notifiche.
    """
    from app.models.utente import Utente as UtenteModel
    # Ruoli richiesti + sempre: admin, capo_cantiere, amministrazione
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
        invia_notifica(db, list(ids), titolo, corpo, f"/cantieri/{cantiere_id}", tipo=tipo, cantiere_id=cantiere_id)


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
    """Invia notifica in-app (DB) + push notification a tutti i dispositivi degli utenti indicati."""
    # Sempre salva in DB (in-app)
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

    logger.info(f"[PUSH] Invio a user_ids={user_ids} → {len(subs)} subscription(s)")
    if not subs:
        logger.warning(f"[PUSH] Nessuna subscription trovata per user_ids={user_ids}")
        return

    try:
        from pywebpush import webpush, WebPushException
    except ImportError:
        logger.error("[PUSH] pywebpush non installato!")
        return

    payload = json.dumps({
        "title": titolo,
        "body": corpo,
        "url": url,
        "icon": "/icons/icon-192.png",
    })

    private_key = _get_vapid_key(settings.VAPID_PRIVATE_KEY or '')

    # Apple e altri richiedono mailto: nel sub claim
    vapid_sub = settings.VAPID_EMAIL
    if vapid_sub and not vapid_sub.startswith("mailto:"):
        vapid_sub = f"mailto:{vapid_sub}"

    for sub in subs:
        try:
            aud = sub.endpoint.split("/")[0] + "//" + sub.endpoint.split("/")[2]
            resp = webpush(
                subscription_info={
                    "endpoint": sub.endpoint,
                    "keys": {"p256dh": sub.p256dh, "auth": sub.auth},
                },
                data=payload,
                vapid_private_key=private_key,
                vapid_claims={"sub": vapid_sub, "aud": aud},
                ttl=86400,
            )
            status_code = getattr(resp, 'status_code', '?')
            logger.info(f"[PUSH] ✅ Inviata a endpoint={sub.endpoint[:60]} status={status_code}")
        except WebPushException as e:
            status = None
            if hasattr(e, 'response') and e.response is not None:
                status = getattr(e.response, 'status_code', None)
                body = ''
                try: body = e.response.text[:200]
                except Exception: pass
                logger.error(f"[PUSH] ❌ WebPushException status={status} body={body!r} endpoint={sub.endpoint[:60]}")
            else:
                logger.error(f"[PUSH] ❌ WebPushException (no response): {e}")
            if status in (404, 410):
                logger.warning(f"[PUSH] Subscription scaduta ({status}), rimuovo")
                try: db.delete(sub); db.commit()
                except Exception: pass
        except Exception as e:
            logger.error(f"[PUSH] ❌ Errore generico: {type(e).__name__}: {e}")
