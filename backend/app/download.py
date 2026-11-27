"""Header Content-Disposition per i file scaricati.

Le intestazioni HTTP accettano solo caratteri latin-1: un nome file con "—", "–",
emoji o simili (es. il nome del cantiere "Rossi — Via Roma") faceva fallire il
download con errore 500. Qui il nome diventa una versione ASCII sicura
(filename=) più quella completa in UTF-8 (filename*=, RFC 6266) che i browser
usano quando c'è.
"""
import re
import unicodedata
from urllib.parse import quote


def nome_sicuro(nome: str) -> str:
    """Versione ASCII del nome file, senza caratteri che rompono l'header o il percorso."""
    s = unicodedata.normalize("NFKD", str(nome or "file"))
    s = s.replace("\u2014", "-").replace("\u2013", "-")
    s = s.encode("ascii", "ignore").decode("ascii")
    s = re.sub(r'[\\/:*?"<>|;\r\n]+', "_", s)
    s = re.sub(r"_+", "_", s).strip(" ._") or "file"
    return s[:150]


def disposizione(nome: str, tipo: str = "attachment") -> str:
    """Valore dell'header Content-Disposition per `nome`."""
    nome = re.sub(r"[\\/]+", "-", str(nome or "file"))
    return f"{tipo}; filename=\"{nome_sicuro(nome)}\"; filename*=UTF-8''{quote(nome, safe='')}"
