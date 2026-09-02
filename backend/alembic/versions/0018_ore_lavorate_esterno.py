"""Aggiunge ore_lavorate.operatore_nome — nome dell'operatore esterno occasionale
("socio") citato in un rapportino ma senza account: le sue ore devono comunque
comparire nel registro Ore lavorate (utente_id resta NULL).

revision = "0018_ore_lavorate_esterno"
down_revision = "0017_chiusura_cantiere"
"""
import sqlalchemy as sa
from alembic import op

revision = "0018_ore_lavorate_esterno"
down_revision = "0017_chiusura_cantiere"
branch_labels = None
depends_on = None


def _needs_col(bind, table, col):
    insp = sa.inspect(bind)
    if not insp.has_table(table):
        return False   # tabella assente → la crea create_all col modello aggiornato
    return col not in {c["name"] for c in insp.get_columns(table)}


def _utente_id_nullable(bind):
    insp = sa.inspect(bind)
    if not insp.has_table("ore_lavorate"):
        return False
    for c in insp.get_columns("ore_lavorate"):
        if c["name"] == "utente_id":
            return not c["nullable"]
    return False


def upgrade():
    bind = op.get_bind()
    if _needs_col(bind, "ore_lavorate", "operatore_nome"):
        op.add_column("ore_lavorate", sa.Column("operatore_nome", sa.Text(), nullable=True))
    # utente_id diventa opzionale (operatore esterno senza account)
    if _utente_id_nullable(bind):
        op.alter_column("ore_lavorate", "utente_id", existing_type=sa.Integer(), nullable=True)


def downgrade():
    op.drop_column("ore_lavorate", "operatore_nome")
