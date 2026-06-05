import json
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.notifica import PushSubscription
from app.models.utente import Utente, RuoloUtente
from app.auth import get_current_user
from app.config import settings
from pydantic import BaseModel
from typing import Optional

router = APIRouter(prefix="/notifiche", tags=["Notifiche"])


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


# ─── HELPER: invia notifica a uno o più utenti ────────────────────────────────

def invia_notifica(
    db: Session,
    user_ids: list[int],
    titolo: str,
    corpo: str,
    url: str = "/",
):
    """Invia push notification a tutti i dispositivi degli utenti indicati."""
    if not settings.VAPID_PRIVATE_KEY or not settings.VAPID_PUBLIC_KEY:
        return  # non configurato, silenzioso

    subs = db.query(PushSubscription).filter(
        PushSubscription.user_id.in_(user_ids)
    ).all()

    if not subs:
        return

    try:
        from pywebpush import webpush, WebPushException
    except ImportError:
        return

    payload = json.dumps({
        "title": titolo,
        "body": corpo,
        "url": url,
        "icon": "/icons/icon-192.png",
    })

    # Ricostruisce PEM multilinea se salvato con \n letterali
    private_key = settings.VAPID_PRIVATE_KEY.replace('\\n', '\n') if settings.VAPID_PRIVATE_KEY else ''

    for sub in subs:
        try:
            webpush(
                subscription_info={
                    "endpoint": sub.endpoint,
                    "keys": {"p256dh": sub.p256dh, "auth": sub.auth},
                },
                data=payload,
                vapid_private_key=private_key,
                vapid_claims={"sub": settings.VAPID_EMAIL},
            )
        except Exception:
            # Subscription scaduta o non valida — rimuovi silenziosamente
            try:
                db.delete(sub)
                db.commit()
            except Exception:
                pass
