"""Copia cifrata delle password, leggibile solo dall'admin.

Richiesta di Michele: nella scheda Utenti deve poter vedere la password
impostata, per aiutare chi non riesce ad accedere senza cambiargliela.
La password vera resta salvata come hash bcrypt (è quella che serve al login);
accanto teniamo una copia cifrata con Fernet (AES), chiave derivata da
PASSWORD_VIEW_KEY o, se manca, da SECRET_KEY. Non è mai in chiaro nel DB.

Le password già esistenti non si possono recuperare dall'hash: la copia si
riempie la prima volta che l'admin la imposta o che l'utente fa login.
Se la chiave cambia, le copie vecchie diventano illeggibili (si riempiono
di nuovo al login successivo).
"""
import base64
import hashlib
import logging
import os

from cryptography.fernet import Fernet, InvalidToken

logger = logging.getLogger(__name__)


def _fernet() -> Fernet:
    from app.config import settings
    segreto = os.getenv("PASSWORD_VIEW_KEY") or settings.SECRET_KEY
    chiave = base64.urlsafe_b64encode(hashlib.sha256(("pw-view:" + segreto).encode()).digest())
    return Fernet(chiave)


def cifra(password: str) -> str | None:
    try:
        return _fernet().encrypt(password.encode()).decode()
    except Exception:
        logger.exception("[PASSWORD] cifratura non riuscita")
        return None


def decifra(cifrata: str | None) -> str | None:
    if not cifrata:
        return None
    try:
        return _fernet().decrypt(cifrata.encode()).decode()
    except (InvalidToken, Exception):
        return None


def aggiorna_copia(utente, password: str) -> bool:
    """Allinea la copia cifrata alla password in chiaro appena verificata/impostata.
    True se è cambiata (va fatto commit)."""
    if decifra(utente.password_cifrata) == password:
        return False
    utente.password_cifrata = cifra(password)
    return True
