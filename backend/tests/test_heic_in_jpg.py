# Le foto HEIC (iPhone) caricate da PC vanno salvate come JPG, visibili in ogni browser
import io

import pytest
from PIL import Image

from app.storage import heic_in_jpg

pillow_heif = pytest.importorskip("pillow_heif")


def _heic_di_prova() -> bytes:
    out = io.BytesIO()
    pillow_heif.from_pillow(Image.new("RGB", (64, 48), (255, 107, 0))).save(out, quality=80)
    return out.getvalue()


def test_heic_convertita_in_jpg():
    dati, ext = heic_in_jpg(_heic_di_prova(), ".HEIC")
    assert ext == ".jpg"
    img = Image.open(io.BytesIO(dati))
    assert img.format == "JPEG" and img.size == (64, 48)


def test_altri_formati_invariati():
    assert heic_in_jpg(b"abc", ".png") == (b"abc", ".png")


def test_heic_corrotta_tiene_originale():
    assert heic_in_jpg(b"non-una-foto", ".heic") == (b"non-una-foto", ".heic")
