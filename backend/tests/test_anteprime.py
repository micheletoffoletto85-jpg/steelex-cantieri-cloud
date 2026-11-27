"""Miniature foto: piccole, orientate giusto, chiavi stabili, niente proxy esterni."""
import io
from PIL import Image
from app import anteprime


def _jpg(w, h):
    b = io.BytesIO(); Image.new("RGB", (w, h), (200, 100, 50)).save(b, "JPEG", quality=95); return b.getvalue()


def test_miniatura_piccola():
    orig = _jpg(4000, 3000)
    mini = anteprime.crea_anteprima(orig)
    img = Image.open(io.BytesIO(mini))
    assert max(img.size) <= anteprime.LATO_MAX
    assert len(mini) < len(orig) / 5


def test_png_trasparente():
    b = io.BytesIO(); Image.new("RGBA", (1000, 800), (0, 0, 0, 0)).save(b, "PNG")
    assert Image.open(io.BytesIO(anteprime.crea_anteprima(b.getvalue()))).format == "JPEG"


def test_chiave():
    assert anteprime.chiave_anteprima("rapportini/abc.jpg") == "anteprime/rapportini/abc.jpg"
    assert anteprime.chiave_anteprima("foto/x.y/abc.png") == "anteprime/foto/x.y/abc.jpg"


def test_solo_nostro_bucket(monkeypatch):
    from app.config import settings
    monkeypatch.setattr(settings, "R2_PUBLIC_URL", "https://pub-x.r2.dev")
    assert anteprime.chiave_da_url("https://pub-x.r2.dev/diari/a.jpg") == "diari/a.jpg"
    assert anteprime.chiave_da_url("https://evil.com/a.jpg") is None
    assert anteprime.chiave_da_url("https://pub-x.r2.dev/../a.jpg") is None
    assert anteprime.chiave_da_url("https://pub-x.r2.dev/anteprime/a.jpg") is None
    # senza R2 configurato restituisce l'originale
    assert anteprime.url_anteprima("https://evil.com/a.jpg") == "https://evil.com/a.jpg"
