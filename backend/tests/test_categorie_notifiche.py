"""Ogni notifica che l'app invia deve finire nella categoria giusta,
altrimenti spegnerla dalle preferenze non avrebbe effetto."""
from app.categorie_notifiche import categoria_da, CHIAVI

CASI = [
    ("📋 Nuovo rapportino", "/rapportini", "rapportini"),
    ("✅ Rapportino validato", "/", "rapportini"),
    ("⚠️ Extra preventivo nel diario", "/cantieri/3", "extra"),
    ("⚠️ Extra preventivo segnalato", "/cantieri/3", "extra"),
    ("⚠️ Extra preventivo aggiunto al computo", "/cantieri/3", "extra"),
    ("📋 Nuova nota diario", "/cantieri/3", "diario"),
    ("📋 Nuovo aggiornamento dal cantiere", "/cantieri/3", "diario"),
    ("📷 Nuova foto nel diario", "/cantieri/3", "diario"),
    ("🎙️ Nuova nota vocale nel diario", "/cantieri/3", "diario"),
    ("🏁 Cantiere chiuso", "/cantieri/3", "cantieri"),
    ("🗺️ Nuovo documento caricato", "/cantieri/3", "documenti"),
    ("📄 Nuovo documento disponibile", "/cantieri/3", "documenti"),
    ("📎 Nuovo documento richiesto", "/cantieri/3", "documenti"),
    ("📤 Documento caricato dal fornitore", "/cantieri/3", "documenti"),
    ("📍 Nuovo pin aggiunto alla mappa", "/cantieri/3", "mappa"),
    ("✅ Lavorazione completata", "/cantieri/3", "mappa"),
    ("💬 Aggiornamento da Mario Rossi", "/cantieri/3", "mappa"),
    ("💰 Nuovo preventivo creato", "/cantieri/3", "economia"),
    ("🧾 Nuova spesa registrata", "/cantieri/3", "economia"),
    ("📊 Nuovo SAL emesso", "/cantieri/3", "economia"),
    ("🧾 Spesa da rapportino", "/cantieri/3", "economia"),
    ("📊 Cronoprogramma aggiornato", "/cantieri/3", "programma"),
    ("📅 Programma settimana", "/", "programma"),
]


def test_categorie():
    for titolo, url, attesa in CASI:
        assert categoria_da(titolo, url) == attesa, titolo
        assert attesa in CHIAVI


def test_non_classificata_passa_sempre():
    assert categoria_da("Test push", "/") is None
