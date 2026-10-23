"""Ore dette nel racconto del rapportino, lette dal codice quando l'IA non le riporta.
Casi presi dai rapportini reali rimasti senza ore in validazione (ottobre 2026)."""
import os

import pytest

os.environ.setdefault("DATABASE_URL", "postgresql://u:p@localhost:1/test")
os.environ.setdefault("SECRET_KEY", "x" * 40)

from app.routers.rapportini import _durata_ore_detta  # noqa: E402


@pytest.mark.parametrize("testo,ore", [
    ("Show room cattane;9 ore  tinteggiatura smalto nero. ,pulizia", 9),
    ("Oggi nove ore brendola, noleggio piattaforma, acquisto materiali.", 9),
    ("Cantiere Giacomo Baron; nove ore di lavoro +30 minuti ritornomascheratura", 9),
    ("Cantiere uffici, finitura con tinteggiatura. Totale ore quattro.", 4),
    ("Stuccatura e pulizia. Totale ore 8. Carico scarico furgoni in magazzino un'ora.", 8),
    ("Otto ore trenta di protezione superfici. Pulizia del cantiere.", 8.5),
    ("Oggi ufficio due ore, impostazioni controsoffitto, magazzino sei ore, divisione materiali.", 8),
    ("Mattina 4 ore al cantiere Rossi, pomeriggio 3 ore in magazzino.", 7),
    ("Tinteggiatura prima mano. Totale 7 ore. Ho fatto una riunione di un'ora con Michele. Totale 8 ore.", 8),
    ("Cantiere Alex Pigato. Ho lavorato sette ore con l'aiuto di Enrico che ha fatto cinque ore.", 7),
    ("Cantiere Alex Pigato. 9 ore. Stuccatura. Un'ora con Fabio di lato: apertura fori.", 9),
    ("**Ore lavorate:** 8 ore e 30\n**Tempo viaggio:** 1 ora e 30 (andata e ritorno)", 8.5),
])
def test_durata_riconosciuta(testo, ore):
    assert _durata_ore_detta(testo) == ore


@pytest.mark.parametrize("testo", [
    "Oggi al cantiere Galegaro ho montato la struttura Steel Frame a partire dalle 10:30.",
    "Direzione magazzino e scarico materiale.",
    "**Tempo impiegato:**\n- Viaggio andata e ritorno: 1 ora",
    "Andata e ritorno (1 ora e 45 minuti).",
    "Arrivato alle 8 ore circa, montaggio pareti.",
])
def test_nessuna_durata_di_lavoro(testo):
    assert _durata_ore_detta(testo) is None
