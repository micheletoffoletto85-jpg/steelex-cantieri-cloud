"""
Invio Web Push senza dipendenza da pywebpush.
Usa: cryptography, httpx, python-jose (già in requirements).
Implementa RFC 8291 (encryption) + RFC 8292 (VAPID).
"""
import base64, json, os, time, hmac, hashlib, logging
from typing import Optional

import httpx
from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives.asymmetric.ec import (
    SECP256R1, ECDH,
    derive_private_key, generate_private_key,
    EllipticCurvePublicNumbers,
)
from cryptography.hazmat.primitives.serialization import (
    Encoding, PublicFormat,
    load_pem_private_key, load_der_private_key,
)
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

logger = logging.getLogger(__name__)

_backend = default_backend()


def _b64d(s: str) -> bytes:
    s = s.replace('-', '+').replace('_', '/')
    return base64.b64decode(s + '=' * (-len(s) % 4))


def _b64e(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b'=').decode()


def carica_chiave_ec(raw: str):
    """Carica chiave EC privata da qualsiasi formato comune."""
    raw = raw.replace('\\n', '\n').strip()

    # PEM
    if '-----' in raw:
        try:
            return load_pem_private_key(raw.encode(), None, _backend)
        except Exception:
            pass
        # PEM su una riga senza newline — ricostruisci
        import re
        m = re.match(r'(-----BEGIN [^-]+-----)(.*?)(-----END [^-]+-----)', raw.replace('\n', ''))
        if m:
            hdr, body, ftr = m.groups()
            body = '\n'.join(body[i:i+64] for i in range(0, len(body), 64))
            pem2 = f"{hdr}\n{body}\n{ftr}\n"
            try:
                return load_pem_private_key(pem2.encode(), None, _backend)
            except Exception:
                pass

    # Base64url → 32 byte raw EC
    try:
        kb = _b64d(raw)
        if len(kb) == 32:
            return derive_private_key(int.from_bytes(kb, 'big'), SECP256R1(), _backend)
    except Exception:
        pass

    # Base64url → DER
    try:
        kb = _b64d(raw)
        return load_der_private_key(kb, None, _backend)
    except Exception:
        pass

    # Standard base64 → DER
    try:
        kb = base64.b64decode(raw + '=' * (-len(raw) % 4))
        return load_der_private_key(kb, None, _backend)
    except Exception:
        pass

    raise ValueError(f"Impossibile caricare chiave VAPID (len={len(raw)}, primi 20: {raw[:20]!r})")


def _vapid_jwt(private_key, endpoint: str, vapid_sub: str) -> tuple[str, str]:
    """Restituisce (jwt_token, public_key_b64url)."""
    from jose import jwt as jose_jwt
    aud = endpoint.split("/")[0] + "//" + endpoint.split("/")[2]
    exp = int(time.time()) + 86400
    claims = {"sub": vapid_sub, "aud": aud, "exp": exp}
    # python-jose accetta oggetti cryptography direttamente per ES256
    token = jose_jwt.encode(claims, private_key, algorithm="ES256")
    pub_bytes = private_key.public_key().public_bytes(Encoding.X962, PublicFormat.UncompressedPoint)
    return token, _b64e(pub_bytes)


def _hkdf_expand(prk: bytes, info: bytes, length: int) -> bytes:
    result = b""
    t = b""
    for i in range(1, (length // 32) + 2):
        t = hmac.new(prk, t + info + bytes([i]), hashlib.sha256).digest()
        result += t
    return result[:length]


def _encrypt_payload(plaintext: str, p256dh: str, auth: str) -> tuple[bytes, bytes]:
    """
    Cifra payload per Web Push (RFC 8291 / aes128gcm).
    Restituisce (body_bytes, salt).
    """
    recv_pub_bytes = _b64d(p256dh)
    auth_bytes = _b64d(auth)

    # Carica chiave pubblica del receiver
    assert recv_pub_bytes[0] == 0x04 and len(recv_pub_bytes) == 65
    x = int.from_bytes(recv_pub_bytes[1:33], 'big')
    y = int.from_bytes(recv_pub_bytes[33:65], 'big')
    recv_pub = EllipticCurvePublicNumbers(x, y, SECP256R1()).public_key(_backend)

    # Coppia efimera
    eph_priv = generate_private_key(SECP256R1(), _backend)
    eph_pub_bytes = eph_priv.public_key().public_bytes(Encoding.X962, PublicFormat.UncompressedPoint)

    # ECDH
    shared = eph_priv.exchange(ECDH(), recv_pub)

    salt = os.urandom(16)

    # PRK tramite HKDF-Extract (RFC 8291 §3.3)
    ikm_info = b"WebPush: info\x00" + recv_pub_bytes + eph_pub_bytes
    prk_combine = hmac.new(auth_bytes, shared, hashlib.sha256).digest()
    ikm = _hkdf_expand(prk_combine, ikm_info, 32)

    prk = hmac.new(salt, ikm, hashlib.sha256).digest()
    cek = _hkdf_expand(prk, b"Content-Encoding: aes128gcm\x00", 16)
    nonce = _hkdf_expand(prk, b"Content-Encoding: nonce\x00", 12)

    # Cifra (aggiunge 2-byte padding delimiter come da spec)
    data_bytes = plaintext.encode() + b"\x02"
    ciphertext = AESGCM(cek).encrypt(nonce, data_bytes, None)

    # Header RFC 8188: salt(16) + rs(4) + idlen(1) + keyid
    rs = (4096).to_bytes(4, 'big')
    body = salt + rs + len(eph_pub_bytes).to_bytes(1, 'big') + eph_pub_bytes + ciphertext

    return body, salt


class WebPushError(Exception):
    def __init__(self, msg, status_code=None, response_text=""):
        super().__init__(msg)
        self.status_code = status_code
        self.response_text = response_text


def send_push(
    endpoint: str,
    p256dh: str,
    auth: str,
    payload: str,
    vapid_private_key_raw: str,
    vapid_sub: str,
    ttl: int = 86400,
) -> int:
    """
    Invia una Web Push notification.
    Ritorna lo status code HTTP della risposta.
    Lancia WebPushError se fallisce.
    """
    if not vapid_sub.startswith("mailto:"):
        vapid_sub = f"mailto:{vapid_sub}"

    private_key = carica_chiave_ec(vapid_private_key_raw)
    token, pub_key_b64 = _vapid_jwt(private_key, endpoint, vapid_sub)
    body, _ = _encrypt_payload(payload, p256dh, auth)

    headers = {
        "Authorization": f"vapid t={token},k={pub_key_b64}",
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        "TTL": str(ttl),
    }

    with httpx.Client(timeout=30) as client:
        resp = client.post(endpoint, content=body, headers=headers)

    if resp.status_code not in (200, 201, 202):
        raise WebPushError(
            f"Push fallita: status={resp.status_code}",
            status_code=resp.status_code,
            response_text=resp.text[:300],
        )

    return resp.status_code
