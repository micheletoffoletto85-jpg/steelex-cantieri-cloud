"""Anteprime compresse delle foto (miniature).

Le liste (rapportini, tab Foto, diario) mostravano le foto originali da
1–4 MB l'una: con decine di foto la pagina diventava lentissima sul telefono.
Ora le liste caricano una miniatura JPEG da ~30 KB; l'originale si scarica
solo quando si apre la foto.

La miniatura sta su R2 accanto alle altre, sotto "anteprime/<chiave originale>.jpg":
  - le foto nuove la ricevono subito al caricamento (salva_file)
  - quelle vecchie la ricevono la prima volta che qualcuno la chiede
    (GET /api/v1/files/anteprima?u=<url>), poi resta in cache.
"""
import io
import logging

logger = logging.getLogger(__name__)

LATO_MAX = 480          # px, lato lungo — basta per le griglie anche su schermi retina
QUALITA = 70
ESTENSIONI_IMMAGINE = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".heic", ".heif"}


def chiave_anteprima(chiave: str) -> str:
    base = chiave.rsplit(".", 1)[0] if "." in chiave.rsplit("/", 1)[-1] else chiave
    return f"anteprime/{base}.jpg"


def crea_anteprima(contenuto: bytes) -> bytes:
    from PIL import Image, ImageOps
    try:
        import pillow_heif
        pillow_heif.register_heif_opener()
    except Exception:
        pass
    img = Image.open(io.BytesIO(contenuto))
    img.draft("RGB", (LATO_MAX * 2, LATO_MAX * 2))   # JPEG: decodifica già ridotta, molto più veloce
    img = ImageOps.exif_transpose(img)
    if img.mode not in ("RGB", "L"):
        img = img.convert("RGB")
    img.thumbnail((LATO_MAX, LATO_MAX))
    out = io.BytesIO()
    img.save(out, "JPEG", quality=QUALITA, optimize=True, progressive=True)
    return out.getvalue()


def chiave_da_url(url: str) -> str | None:
    """Chiave R2 dall'URL pubblico. None se l'URL non è del nostro bucket
    (così l'endpoint non fa da proxy verso siti esterni)."""
    from app.config import settings
    base = (settings.R2_PUBLIC_URL or "").rstrip("/")
    if not base or not url or not url.startswith(base + "/"):
        return None
    chiave = url[len(base) + 1:].split("?", 1)[0]
    if not chiave or ".." in chiave or chiave.startswith("anteprime/"):
        return None
    return chiave


def salva_anteprima(client, bucket: str, chiave: str, contenuto: bytes) -> bool:
    """Crea e carica la miniatura di un'immagine appena salvata. Mai bloccante."""
    try:
        client.put_object(Bucket=bucket, Key=chiave_anteprima(chiave), Body=crea_anteprima(contenuto),
                          ContentType="image/jpeg", CacheControl="public, max-age=31536000, immutable")
        return True
    except Exception as e:
        logger.warning(f"[anteprime] miniatura non creata per {chiave}: {e}")
        return False


def url_anteprima(url: str) -> str:
    """URL pubblico della miniatura (creandola se manca). Se qualcosa va storto
    restituisce l'originale: meglio lento che foto mancante."""
    from app.config import settings
    from app.storage import _r2_client
    chiave = chiave_da_url(url)
    client = _r2_client() if chiave else None
    if not client:
        return url
    base = settings.R2_PUBLIC_URL.rstrip("/")
    ck = chiave_anteprima(chiave)
    try:
        client.head_object(Bucket=settings.R2_BUCKET_NAME, Key=ck)
        return f"{base}/{ck}"
    except Exception:
        pass
    try:
        obj = client.get_object(Bucket=settings.R2_BUCKET_NAME, Key=chiave)
        if salva_anteprima(client, settings.R2_BUCKET_NAME, chiave, obj["Body"].read()):
            return f"{base}/{ck}"
    except Exception as e:
        logger.warning(f"[anteprime] originale non leggibile {chiave}: {e}")
    return url
