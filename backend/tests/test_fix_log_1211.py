"""Fix dal log errori del 12/11: audio rifiutato da gpt-4o-transcribe (port FR)."""
import os
from types import SimpleNamespace

os.environ.setdefault("DATABASE_URL", "postgresql://u:p@localhost:1/test")
os.environ.setdefault("SECRET_KEY", "x" * 40)

from app.routers import rapportini  # noqa: E402

ERR = "Error code: 400 - Audio file might be corrupted or unsupported (invalid_value)"


def _client(ok_model, modelli):
    def crea(**kw):
        modelli.append((kw["model"], getattr(kw["file"], "name", "")))
        if kw["model"] != ok_model or not str(getattr(kw["file"], "name", "")).endswith(".mp3"):
            raise Exception(ERR)
        return SimpleNamespace(text="ciao", language="it")
    return SimpleNamespace(audio=SimpleNamespace(transcriptions=SimpleNamespace(create=crea)))


def test_riconversione_mp3_dopo_doppio_rifiuto(monkeypatch, tmp_path):
    f = tmp_path / "a.mp4"
    f.write_bytes(b"x" * 4096)
    monkeypatch.setattr(rapportini, "_audio_in_pezzi", lambda path: [b"y" * 2048])
    modelli = []
    r = rapportini._trascrivi_con_fallback(_client("gpt-4o-transcribe", modelli), str(f), {"model": "gpt-4o-transcribe"})
    assert r.text == "ciao"
    assert [m for m, _ in modelli] == ["gpt-4o-transcribe", "whisper-1", "gpt-4o-transcribe"]


def test_errore_non_recuperabile_non_riprova(tmp_path):
    f = tmp_path / "a.webm"
    f.write_bytes(b"x" * 4096)

    def crea(**kw):
        raise Exception("Error code: 401 - Incorrect API key")
    client = SimpleNamespace(audio=SimpleNamespace(transcriptions=SimpleNamespace(create=crea)))
    try:
        rapportini._trascrivi_con_fallback(client, str(f), {"model": "gpt-4o-transcribe"})
        assert False
    except Exception as e:
        assert "401" in str(e)
