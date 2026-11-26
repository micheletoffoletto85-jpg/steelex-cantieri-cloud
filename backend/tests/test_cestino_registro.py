"""Cestino: un cantiere eliminato si ripristina com'era (figli, Gantt, preventivo).
Registro attività: descrizioni leggibili. Backup: esporta tutte le tabelle."""
import os

os.environ.setdefault("DATABASE_URL", "postgresql://u:p@localhost:1/test")
os.environ.setdefault("SECRET_KEY", "x" * 40)

import sqlalchemy as sa  # noqa: E402
from sqlalchemy import event  # noqa: E402

from app import cestino, registro  # noqa: E402

DDL = [
    "CREATE TABLE cantieri (id INTEGER PRIMARY KEY, nome TEXT, creato_il DATETIME)",
    "CREATE TABLE diari (id INTEGER PRIMARY KEY, cantiere_id INTEGER NOT NULL REFERENCES cantieri(id), data DATE, testo TEXT)",
    # rapportino punta sia al cantiere sia al diario (riferimento incrociato tra figli)
    "CREATE TABLE rapportini (id INTEGER PRIMARY KEY, cantiere_id INTEGER NOT NULL REFERENCES cantieri(id),"
    " diario_id INTEGER REFERENCES diari(id) ON DELETE SET NULL, ore REAL)",
    "CREATE TABLE foto (id INTEGER PRIMARY KEY, diario_id INTEGER NOT NULL REFERENCES diari(id) ON DELETE CASCADE, url TEXT)",
    "CREATE TABLE assegnazioni (id INTEGER PRIMARY KEY, cantiere_id INTEGER REFERENCES cantieri(id) ON DELETE SET NULL, data DATE)",
    "CREATE TABLE comm_preventivi (id INTEGER PRIMARY KEY, cantiere_id INTEGER REFERENCES cantieri(id) ON DELETE SET NULL,"
    " stato TEXT, esito_il DATETIME)",
]


def _conn():
    eng = sa.create_engine("sqlite://")

    @event.listens_for(eng, "connect")
    def _fk(c, _):
        c.execute("PRAGMA foreign_keys=ON")
    conn = eng.connect()
    for d in DDL:
        conn.execute(sa.text(d))
    conn.execute(sa.text("INSERT INTO cantieri VALUES (36, 'Nicola Moro — Thiene', '2026-11-25 10:00:00')"))
    conn.execute(sa.text("INSERT INTO cantieri VALUES (37, 'Altro', NULL)"))
    conn.execute(sa.text("INSERT INTO diari VALUES (1, 36, '2026-11-26', 'getto')"))
    conn.execute(sa.text("INSERT INTO rapportini VALUES (5, 36, 1, 8)"))
    conn.execute(sa.text("INSERT INTO foto VALUES (9, 1, 'foto/a.jpg')"))
    conn.execute(sa.text("INSERT INTO assegnazioni VALUES (100, 36, '2026-11-26'), (101, 37, '2026-11-26')"))
    conn.execute(sa.text("INSERT INTO comm_preventivi VALUES (28, 36, 'accettato', '2026-11-25 11:00:00')"))
    return conn


def _elimina(conn, cid):
    # come elimina_cantiere_completo: figli senza cascade a mano, poi il cantiere
    conn.execute(sa.text("UPDATE comm_preventivi SET stato='inviato', esito_il=NULL WHERE cantiere_id=:c"), {"c": cid})
    conn.execute(sa.text("DELETE FROM rapportini WHERE cantiere_id=:c"), {"c": cid})
    conn.execute(sa.text("DELETE FROM diari WHERE cantiere_id=:c"), {"c": cid})
    conn.execute(sa.text("DELETE FROM cantieri WHERE id=:c"), {"c": cid})


def _riattacca(conn, s):
    if s["tabella"] == "comm_preventivi":
        r = s["riga"]
        conn.execute(sa.text("UPDATE comm_preventivi SET stato=:s, esito_il=:e WHERE id=:i"),
                     {"s": r["stato"], "e": r["esito_il"], "i": s["pk_val"][0]})


def test_fotografia_prende_figli_nipoti_e_collegamenti():
    conn = _conn()
    foto = cestino.fotografa(conn, "cantieri", [36])
    assert [r["id"] for r in foto["righe"]["cantieri"]] == [36]
    assert len(foto["righe"]["diari"]) == 1
    assert len(foto["righe"]["rapportini"]) == 1
    assert len(foto["righe"]["foto"]) == 1               # nipote (via diario)
    staccati = {(s["tabella"], s["pk_val"][0]) for s in foto["stacchi"]}
    assert ("assegnazioni", 100) in staccati and ("comm_preventivi", 28) in staccati
    assert ("assegnazioni", 101) not in staccati         # Gantt di un altro cantiere: non c'entra
    assert cestino.conta_righe(foto) == 4


def test_elimina_e_ripristina_com_era():
    conn = _conn()
    foto = cestino.fotografa(conn, "cantieri", [36])
    import json
    foto = json.loads(json.dumps(foto))                  # come salvato nel database (JSON)
    _elimina(conn, 36)
    assert conn.execute(sa.text("SELECT count(*) FROM foto")).scalar() == 0
    assert conn.execute(sa.text("SELECT cantiere_id FROM assegnazioni WHERE id=100")).scalar() is None

    esito = cestino.ripristina(conn, foto, extra_stacco=_riattacca)
    assert esito == {"righe": 4, "collegamenti": 2}
    assert conn.execute(sa.text("SELECT nome FROM cantieri WHERE id=36")).scalar() == "Nicola Moro — Thiene"
    assert conn.execute(sa.text("SELECT diario_id FROM rapportini WHERE id=5")).scalar() == 1
    assert conn.execute(sa.text("SELECT url FROM foto WHERE id=9")).scalar() == "foto/a.jpg"
    assert conn.execute(sa.text("SELECT cantiere_id FROM assegnazioni WHERE id=100")).scalar() == 36
    assert conn.execute(sa.text("SELECT stato FROM comm_preventivi WHERE id=28")).scalar() == "accettato"


def test_ripristino_non_ruba_un_collegamento_gia_rifatto():
    conn = _conn()
    foto = cestino.fotografa(conn, "cantieri", [36])
    _elimina(conn, 36)
    # nel frattempo il preventivo è stato riaccettato su un cantiere nuovo
    conn.execute(sa.text("UPDATE comm_preventivi SET cantiere_id=37, stato='accettato' WHERE id=28"))
    esito = cestino.ripristina(conn, foto, extra_stacco=_riattacca)
    assert esito["collegamenti"] == 1                    # solo il Gantt
    assert conn.execute(sa.text("SELECT cantiere_id FROM comm_preventivi WHERE id=28")).scalar() == 37


def test_backup_esporta_tutte_le_tabelle():
    conn = _conn()
    tab = dict(cestino.esporta_tutto(conn))
    assert set(tab) == {"cantieri", "diari", "rapportini", "foto", "assegnazioni", "comm_preventivi"}
    assert tab["cantieri"][0]["nome"].startswith("Nicola Moro")


def test_registro_descrizioni():
    assert registro.descrivi("DELETE", "/api/v1/cantieri/36").startswith("ELIMINATO IL CANTIERE")
    assert registro.descrivi("POST", "/api/v1/commerciale/preventivi/28/stato") == "Cambiato lo stato del preventivo"
    assert registro.descrivi("PUT", "/api/v1/assegnazioni/bulk") == "Modificato · Gantt Operatori"
    assert registro.descrivi("POST", "/api/v1/cantieri/36/diari") == "Aggiunto · Diario di cantiere"
    assert registro.da_registrare("DELETE", "/api/v1/cantieri/36")
    assert not registro.da_registrare("GET", "/api/v1/cantieri")
    assert not registro.da_registrare("POST", "/api/v1/auth/refresh")
    assert registro._cantiere("/api/v1/cantieri/36/foto") == 36
