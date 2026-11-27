"""Dividere un rapportino su più cantieri: ogni foto va a un solo cantiere."""
from types import SimpleNamespace as NS
from app.routers.rapportini import SegmentoDividi, _foto_per_segmento

R = NS(foto_avanzamento_urls=["a1", "a2", "a3"], foto_extra_urls=["e1"])


def test_senza_scelta_tutte_alla_prima_parte():
    out = _foto_per_segmento(R, [SegmentoDividi(cantiere_id=1), SegmentoDividi(cantiere_id=2)])
    assert out == [(["a1", "a2", "a3"], ["e1"]), ([], [])]


def test_scelta_admin():
    segs = [SegmentoDividi(cantiere_id=1, foto_urls=["a1"], foto_extra_urls=[]),
            SegmentoDividi(cantiere_id=2, foto_urls=["a2", "a3"], foto_extra_urls=["e1"])]
    assert _foto_per_segmento(R, segs) == [(["a1"], []), (["a2", "a3"], ["e1"])]


def test_niente_doppioni_ne_foto_estranee():
    segs = [SegmentoDividi(cantiere_id=1, foto_urls=["a1", "x"]),
            SegmentoDividi(cantiere_id=2, foto_urls=["a1", "a2"])]
    assert _foto_per_segmento(R, segs) == [(["a1"], []), (["a2"], [])]
