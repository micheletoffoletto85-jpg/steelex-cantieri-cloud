# L'IA dei rapportini NON deve più estrarre colleghi né assegnare ore ad altri operatori:
# ogni operatore fa il proprio rapportino (i colleghi citati generavano ore doppie).
import json
from types import SimpleNamespace

import pytest

from app.routers import rapportini as rp


class _FakeClaude:
    """Finto client Anthropic: risponde in base al prompt e registra i prompt ricevuti."""

    def __init__(self):
        self.prompts = []
        self.messages = self

    def create(self, model, max_tokens, messages):
        prompt = messages[0]["content"]
        self.prompts.append(prompt)
        if "blocchi" in prompt and "Blocco:" not in prompt and "Valori estratti" not in prompt:
            out = {"data_lavoro": None, "blocchi": [{"luogo": "Cantiere Rossi", "testo": TESTO, "ore": 8}]}
        elif "Valori estratti" in prompt:
            # anche se il modello rispondesse con dei colleghi, vanno ignorati
            out = {"ore": 8, "colleghi": [{"nome": "Mesedin", "ore": 8}], "altri_cantieri": []}
        else:
            # il modello "disobbedisce" e restituisce comunque dei colleghi
            out = {"ore": 8, "descrizione_lavori": "Montaggio pareti", "lavorazioni": ["montaggio pareti"],
                   "colleghi": [{"nome": "Mesedin", "ore": 8}], "riassunto": "Montaggio pareti"}
        return SimpleNamespace(content=[SimpleNamespace(text=json.dumps(out))])


TESTO = "Oggi io e Mesedin abbiamo montato le pareti al cantiere Rossi, dalle 8 alle 17 con un'ora di pausa."


@pytest.fixture
def fake_claude(monkeypatch):
    fake = _FakeClaude()
    monkeypatch.setattr(rp.settings, "ANTHROPIC_API_KEY", "test-key")
    monkeypatch.setattr(rp, "_claude", lambda: fake)
    import anthropic
    monkeypatch.setattr(anthropic, "Anthropic", lambda api_key=None: fake)
    return fake


def test_prompt_campi_non_chiede_colleghi():
    assert "collegh" not in rp.PROMPT_CAMPI.lower()
    assert "collega" not in rp.PROMPT_CAMPI.lower()


def test_prompt_verifica_ore_non_chiede_colleghi():
    assert "collegh" not in rp.PROMPT_VERIFICA_ORE.lower()


def test_campi_vuoti_senza_colleghi():
    assert "colleghi" not in rp._campi_vuoti("x")


def test_estrai_dati_ignora_colleghi_restituiti_dal_modello(fake_claude):
    dati = rp._estrai_dati(TESTO, ["Cantiere Rossi"])
    assert dati["ore"] == 8
    assert not dati.get("colleghi")
    # nessun prompt inviato all'IA chiede di estrarre colleghi
    for p in fake_claude.prompts:
        assert '"colleghi"' not in p


def test_ha_ore_ignora_colleghi():
    assert rp._ha_ore({"ore": None, "colleghi": [{"nome": "Mesedin", "ore": 8}], "altri_cantieri": []}) is False


def test_estrai_dati_senza_api_key_senza_colleghi(monkeypatch):
    monkeypatch.setattr(rp.settings, "ANTHROPIC_API_KEY", "")
    assert "colleghi" not in rp._estrai_dati(TESTO, [])
