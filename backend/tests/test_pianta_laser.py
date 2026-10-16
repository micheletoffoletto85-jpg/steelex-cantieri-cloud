"""Test della ricostruzione geometrica delle piante del metro laser."""
import pytest
from app.pianta_laser import ricostruisci

# Schizzo reale esportato dall'app HOTO (vertici in pixel, quote in metri)
VERTICI = [[117, 117], [740, 117], [740, 236], [1106, 236], [1106, 613], [667, 1444], [117, 1194]]
QUOTE = [2.220, 0.423, 1.302, 1.341, 3.500, 2.151, 3.828]


def test_pianta_hoto_reale():
    r = ricostruisci(VERTICI, QUOTE, True)
    assert r["metodo"] == "chiusura esatta"
    assert r["perimetro"] == pytest.approx(14.765, abs=1e-3)
    assert r["errore_chiusura"] < 1e-6
    # area coerente con il disegno in scala
    assert r["area"] == pytest.approx(r["area_disegno"], rel=0.03)
    assert sum(l["ortogonale"] for l in r["lati"]) == 5


def test_rettangolo_storto_raddrizzato():
    # rettangolo 4×3 disegnato un po' storto: deve venire esattamente 12 m²
    r = ricostruisci([[0, 0], [402, 5], [400, 300], [-3, 298]], [4, 3, 4, 3], True)
    assert r["area"] == pytest.approx(12.0, abs=1e-6)
    assert r["perimetro"] == pytest.approx(14.0)


def test_quota_mancante_stimata():
    r = ricostruisci([[0, 0], [400, 0], [400, 300], [0, 300]], [4, None, 4, 3], True)
    assert r["lati"][1]["quota_letta"] is False
    assert r["area"] == pytest.approx(12.0, abs=0.05)
    assert r["avvisi"]


def test_misure_che_non_chiudono():
    r = ricostruisci([[0, 0], [400, 0], [400, 300], [0, 300]], [4, 3, 4.2, 3], True)
    assert r["metodo"] == "compensazione"
    assert any("non chiudono" in a for a in r["avvisi"])


def test_polilinea_aperta():
    r = ricostruisci([[0, 0], [100, 0], [100, 100]], [2.5, 1.5], False)
    assert r["area"] is None
    assert r["lunghezza_totale"] == pytest.approx(4.0)
