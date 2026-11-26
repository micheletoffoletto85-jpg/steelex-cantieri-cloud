"""Stato cantiere "archiviato" (vecchi cantieri di prova, fuori da tutte le liste).

La colonna cantieri.stato è VARCHAR (Enum non nativo): il valore nuovo ci sta
già (10 caratteri). Se un vecchio create_all avesse messo un CHECK sui valori
ammessi, lo togliamo: i valori li controlla l'app.

revision = "0023_cantiere_archiviato"
down_revision = "0022_cestino_registro_backup"
"""
import sqlalchemy as sa
from alembic import op

revision = "0023_cantiere_archiviato"
down_revision = "0022_cestino_registro_backup"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return
    vincoli = bind.execute(sa.text(
        "SELECT conname FROM pg_constraint WHERE conrelid = 'cantieri'::regclass "
        "AND contype = 'c' AND pg_get_constraintdef(oid) ILIKE '%stato%'")).fetchall()
    for (nome,) in vincoli:
        op.execute(f'ALTER TABLE cantieri DROP CONSTRAINT "{nome}"')
    # la colonna deve contenere "archiviato"
    lung = bind.execute(sa.text(
        "SELECT character_maximum_length FROM information_schema.columns "
        "WHERE table_name = 'cantieri' AND column_name = 'stato'")).scalar()
    if lung is not None and lung < 20:
        op.execute("ALTER TABLE cantieri ALTER COLUMN stato TYPE VARCHAR(20)")


def downgrade():
    pass
