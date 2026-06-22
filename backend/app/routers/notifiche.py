import json
from fastapi import APIRouter, Depends, HTTPException
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


@router.get("/diagnostica")
def diagnostica_push(
    db: Session = Depends(get_db),
    user: Utente = Depends(get_current_user),
):
    """Diagnostica push notification per l'utente corrente."""
    subs = db.query(PushSubscription).filter(PushSubscription.user_id == user.id).all()
    try:
        from pywebpush import webpush
        pywebpush_ok = True
    except ImportError:
        pywebpush_ok = False
    return {
        "subscriptions_trovate": len(subs),
        "endpoints": [s.endpoint[:80] + "..." for s in subs],
        "vapid_public_key_ok": bool(settings.VAPID_PUBLIC_KEY),
        "vapid_private_key_ok": bool(settings.VAPID_PRIVATE_KEY),
        "vapid_email": settings.VAPID_EMAIL,
        "pywebpush_ok": pywebpush_ok,
    }


@router.post("/test-push")
def test_push(
    db: Session = Depends(get_db),
    user: Utente = Depends(get_current_user),
):
    """Invia una push di test a se stesso."""
    subs = db.query(PushSubscription).filter(PushSubscription.user_id == user.id).all()
    if not subs:
        return {"ok": False, "dettaglio": "Nessuna subscription trovata. Attiva le notifiche dal campanello."}
    invia_notifica(db, [user.id], "🔔 Test notifica", "Se vedi questo, le push funzionano!", "/")
    return {"ok": True, "subscriptions_trovate": len(subs)}


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
        return  # push non configurato, silenzioso

    subs = db.query(PushSubscription).filter(
        PushSubscription.user_id.in_(user_ids)
    ).all()

    if not subs:
        return

    try:
        from pywebpush import webpush, WebPushException
    except ImportError:
        print("[PUSH] ❌ pywebpush non installato")
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
                vapid_claims={
                    "sub": settings.VAPID_EMAIL,
                    "aud": sub.endpoint.split("/")[0] + "//" + sub.endpoint.split("/")[2],
                },
                ttl=86400,
            )
            print(f"[PUSH] ✅ Inviata a user_id={sub.user_id} endpoint={sub.endpoint[:60]}...")
        except WebPushException as ex:
            status = ex.response.status_code if ex.response is not None else "N/A"
            print(f"[PUSH] ❌ WebPushException status={status} user_id={sub.user_id}: {ex}")
            # Rimuovi solo se la subscription non è più valida (Gone / Not Found)
            if ex.response is not None and ex.response.status_code in (404, 410):
                try:
                    db.delete(sub)
                    db.commit()
                    print(f"[PUSH] 🗑️ Subscription rimossa (HTTP {ex.response.status_code})")
                except Exception:
                    pass
        except Exception as ex:
            print(f"[PUSH] ❌ Errore generico user_id={sub.user_id}: {type(ex).__name__}: {ex}")
