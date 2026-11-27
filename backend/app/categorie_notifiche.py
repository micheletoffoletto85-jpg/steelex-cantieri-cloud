"""Categorie delle notifiche e preferenze per utente.

Ogni notifica (in-app + push) appartiene a una categoria. Ogni utente può
spegnere le categorie che non gli interessano dalla pagina "Il mio account"
(colonna utenti.notifiche_disattivate). Default: tutte attive.

La categoria si può passare esplicitamente a invia_notifica(categoria=...);
se manca la si ricava da titolo + url, che nel codice sono testi fissi.
"""

# (chiave, etichetta, descrizione) — l'ordine è quello mostrato nella pagina
CATEGORIE = [
    ("rapportini", "Rapportini", "Nuovi rapportini degli operai, rapportini validati o rifiutati"),
    ("diario", "Diario e foto di cantiere", "Note nel diario, foto, note vocali, aggiornamenti per il cliente"),
    ("extra", "Extra preventivo", "Lavorazioni extra segnalate in cantiere o aggiunte al computo"),
    ("mappa", "Pin sulla pianta", "Nuovi pin, lavorazioni completate, commenti sui pin"),
    ("documenti", "Documenti", "Documenti caricati, richiesti o messi a disposizione"),
    ("economia", "Economia cantiere", "Spese, SAL, preventivi di cantiere, spese da rapportino"),
    ("programma", "Programma lavori", "Programma della settimana, cronoprogramma aggiornato"),
    ("cantieri", "Cantieri chiusi", "Verbale di chiusura confermato"),
]
CHIAVI = {c[0] for c in CATEGORIE}


def categoria_da(titolo: str | None, url: str | None) -> str | None:
    """Ricava la categoria da titolo e url della notifica. None = non classificata
    (viene sempre consegnata: meglio una notifica in più che una persa)."""
    t = (titolo or "").lower()
    u = url or ""
    if "extra preventivo" in t:
        return "extra"
    if "spesa" in t or "nuovo sal" in t or "preventivo creato" in t:
        return "economia"
    if "rapportino" in t:
        return "rapportini"
    if "programma" in t or "cronoprogramma" in t:
        return "programma"
    if "nuovo cantiere attivo" in t or "cantiere chiuso" in t:
        return "cantieri"
    if u.startswith("/analisi-listino") or u.startswith("/artigiani") or t.startswith("listino") or t.startswith("rubrica"):
        return "listino"
    if u.startswith("/commerciale"):
        return "commerciale"
    if "pin" in t or "lavorazione completata" in t or t.startswith("💬 aggiornamento da"):
        return "mappa"
    if "documento" in t:
        return "documenti"
    if "diario" in t or "aggiornamento dal cantiere" in t or "foto" in t:
        return "diario"
    if "ricontatta" in t or t.startswith("senti ") or "studio cantiere" in t or "margine basso" in t:
        return "commerciale"
    return None


def filtra_destinatari(db, user_ids, categoria: str | None) -> list[int]:
    """Toglie dai destinatari chi ha spento questa categoria."""
    ids = [i for i in dict.fromkeys(user_ids or []) if i]
    if not categoria or not ids:
        return ids
    from app.models.utente import Utente
    spenti = {
        u.id for u in db.query(Utente.id, Utente.notifiche_disattivate).filter(Utente.id.in_(ids)).all()
        if categoria in (u.notifiche_disattivate or [])
    }
    return [i for i in ids if i not in spenti]
