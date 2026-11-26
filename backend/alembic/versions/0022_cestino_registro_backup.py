"""Rete di sicurezza: cestino (cantieri eliminati ripristinabili), registro
attività (chi ha fatto cosa) e chiavi per il backup automatico.

revision = "0022_cestino_registro_backup"
down_revision = "0021_foto_cantiere_eliminate"
"""
import sqlalchemy as sa
from alembic import op

revision = "0022_cestino_registro_backup"
down_revision = "0021_foto_cantiere_eliminate"
branch_labels = None
depends_on = None


def upgrade():
    insp = sa.inspect(op.get_bind())
    tabelle = set(insp.get_table_names())
    if "cestino" not in tabelle:
        op.create_table(
            "cestino",
            sa.Column("id", sa.Integer, primary_key=True, index=True),
            sa.Column("tipo", sa.String(40), nullable=False),
            sa.Column("oggetto_id", sa.Integer, nullable=False, index=True),
            sa.Column("nome", sa.String(300)),
            sa.Column("dati", sa.JSON, nullable=False),
            sa.Column("righe", sa.Integer, server_default="0"),
            sa.Column("eliminato_il", sa.DateTime(timezone=True), server_default=sa.func.now(), index=True),
            sa.Column("eliminato_da", sa.Integer, nullable=True),
            sa.Column("eliminato_da_nome", sa.String(200)),
            sa.Column("ripristinato_il", sa.DateTime(timezone=True), nullable=True),
            sa.Column("ripristinato_da_nome", sa.String(200)),
        )
    if "registro_attivita" not in tabelle:
        op.create_table(
            "registro_attivita",
            sa.Column("id", sa.Integer, primary_key=True, index=True),
            sa.Column("quando", sa.DateTime(timezone=True), server_default=sa.func.now(), index=True),
            sa.Column("utente_id", sa.Integer, nullable=True, index=True),
            sa.Column("utente_nome", sa.String(200)),
            sa.Column("metodo", sa.String(8), nullable=False),
            sa.Column("percorso", sa.String(400), nullable=False),
            sa.Column("esito", sa.Integer),
            sa.Column("descrizione", sa.String(400)),
            sa.Column("cantiere_id", sa.Integer, nullable=True, index=True),
            sa.Column("ip", sa.String(64)),
        )
    if "chiavi_backup" not in tabelle:
        op.create_table(
            "chiavi_backup",
            sa.Column("id", sa.Integer, primary_key=True, index=True),
            sa.Column("nome", sa.String(120), nullable=False),
            sa.Column("impronta", sa.String(64), nullable=False, unique=True),
            sa.Column("creata_il", sa.DateTime(timezone=True), server_default=sa.func.now()),
            sa.Column("creata_da_nome", sa.String(200)),
            sa.Column("ultimo_uso", sa.DateTime(timezone=True), nullable=True),
            sa.Column("attiva", sa.Boolean, nullable=False, server_default=sa.true()),
        )


def downgrade():
    op.drop_table("chiavi_backup")
    op.drop_table("registro_attivita")
    op.drop_table("cestino")
