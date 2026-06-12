"""
Modulo storage: usa Cloudflare R2 se configurato, altrimenti filesystem locale.
"""
import os
import uuid
from app.config import settings


def _r2_client():
    if not all([settings.R2_ACCOUNT_ID, settings.R2_ACCESS_KEY_ID, settings.R2_SECRET_ACCESS_KEY]):
        return None
    import boto3
    return boto3.client(
        "s3",
        endpoint_url=f"https://{settings.R2_ACCOUNT_ID}.r2.cloudflarestorage.com",
        aws_access_key_id=settings.R2_ACCESS_KEY_ID,
        aws_secret_access_key=settings.R2_SECRET_ACCESS_KEY,
        region_name="auto",
    )


def configura_cors_r2():
    """Imposta CORS sul bucket R2 per permettere fetch() dal browser."""
    client = _r2_client()
    if not client:
        return
    try:
        client.put_bucket_cors(
            Bucket=settings.R2_BUCKET_NAME,
            CORSConfiguration={
                "CORSRules": [{
                    "AllowedHeaders": ["*"],
                    "AllowedMethods": ["GET", "HEAD"],
                    "AllowedOrigins": ["*"],
                    "MaxAgeSeconds": 86400,
                }]
            },
        )
    except Exception:
        pass


def salva_file(contenuto: bytes, cartella: str, estensione: str) -> tuple[str, str]:
    """
    Salva il file e restituisce (url_pubblica, percorso_locale_o_chiave).
    url_pubblica: URL usata per visualizzare il file nel frontend.
    """
    nome_file = f"{uuid.uuid4()}{estensione}"
    chiave = f"{cartella}/{nome_file}"

    client = _r2_client()
    if client:
        # Carica su R2
        content_type = _content_type(estensione)
        client.put_object(
            Bucket=settings.R2_BUCKET_NAME,
            Key=chiave,
            Body=contenuto,
            ContentType=content_type,
        )
        base = (settings.R2_PUBLIC_URL or "").rstrip("/")
        url = f"{base}/{chiave}"
        return url, chiave
    else:
        # Fallback filesystem locale
        cartella_locale = os.path.join(settings.UPLOAD_DIR, cartella)
        os.makedirs(cartella_locale, exist_ok=True)
        percorso = os.path.join(cartella_locale, nome_file)
        with open(percorso, "wb") as f:
            f.write(contenuto)
        return f"/uploads/{chiave}", percorso


def leggi_file(chiave_o_percorso: str) -> tuple[bytes, str]:
    """
    Legge un file da R2 o dal filesystem. Restituisce (contenuto, content_type).
    chiave_o_percorso: può essere una chiave R2 (es. 'foto/abc.jpg') o un percorso locale.
    """
    client = _r2_client()
    if client and not os.path.isabs(chiave_o_percorso) and not chiave_o_percorso.startswith("/"):
        obj = client.get_object(Bucket=settings.R2_BUCKET_NAME, Key=chiave_o_percorso)
        return obj["Body"].read(), obj.get("ContentType", "application/octet-stream")
    else:
        with open(chiave_o_percorso, "rb") as f:
            return f.read(), _content_type(os.path.splitext(chiave_o_percorso)[1])


def elimina_file(chiave_o_percorso: str):
    """Elimina un file da R2 o dal filesystem."""
    client = _r2_client()
    if client and not os.path.isabs(chiave_o_percorso) and not chiave_o_percorso.startswith("/"):
        client.delete_object(Bucket=settings.R2_BUCKET_NAME, Key=chiave_o_percorso)
    elif os.path.exists(chiave_o_percorso):
        os.remove(chiave_o_percorso)


def _content_type(estensione: str) -> str:
    mappa = {
        ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
        ".gif": "image/gif", ".webp": "image/webp", ".pdf": "application/pdf",
        ".dxf": "application/dxf",
    }
    return mappa.get(estensione.lower(), "application/octet-stream")
