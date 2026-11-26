"""Rimette un backup completo (zip scaricato da Sicurezza e backup) in un database.

Uso:
    python scripts/ripristina_backup.py backup-steelex-database-AAAA-MM-GG.zip postgresql://...

Il database di destinazione deve avere già lo schema (avvia una volta il backend
su quel database: le migrazioni creano le tabelle) e deve essere VUOTO: le righe
già presenti con lo stesso id vengono lasciate stare.
"""
import json
import os
import sys
import zipfile

import sqlalchemy as sa

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from app.cestino import struttura, ripristina  # noqa: E402


def main(zip_path: str, url: str):
    eng = sa.create_engine(url)
    with zipfile.ZipFile(zip_path) as z, eng.begin() as conn:
        manifest = json.loads(z.read("manifest.json"))
        print(f"Backup di {manifest['app']} del {manifest['creato_il']} — {manifest['righe_totali']} righe")
        meta = struttura(conn)
        foto = {"righe": {}, "stacchi": []}
        for nome in manifest["tabelle"]:
            if nome == "alembic_version" or nome not in meta.tables:
                continue
            foto["righe"][nome] = json.loads(z.read(f"tabelle/{nome}.json"))
        esito = ripristina(conn, foto)
        # i contatori degli id ripartono dopo l'ultimo id ripristinato
        if conn.dialect.name == "postgresql":
            for nome in foto["righe"]:
                t = meta.tables[nome]
                if "id" in t.c and isinstance(t.c.id.type, sa.Integer):
                    conn.execute(sa.text(
                        f"SELECT setval(pg_get_serial_sequence('{nome}', 'id'), COALESCE(MAX(id), 1)) FROM {nome}"))
        print(f"Fatto: {esito['righe']} righe rimesse.")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print(__doc__)
        sys.exit(1)
    main(sys.argv[1], sys.argv[2])
