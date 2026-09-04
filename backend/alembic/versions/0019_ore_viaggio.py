"""Ore di viaggio/trasferta: l'operatore le segna a parte, entrano nel totale ma
restano distinte dalle ore di lavoro effettive.

- rapportini_operativi.ore_viaggio  : ore di tragitto dichiarate nel rapportino
- ore_lavorate.ore_viaggio          : quota viaggio nella riga del registro personale
- ore_extra.viaggio                 : marca la riga costo-cantiere come "viaggio"

revision = "0019_ore_viaggio"
down_revision = "0018_ore_lavorate_esterno"
"""
import sqlalchemy as sa
from alembic import op

revision = "0019_ore_viaggio"
down_revision = "0018_ore_lavorate_esterno"
branch_labels = None
depends_on = None


def _needs_col(bind, table, col):
    insp = sa.inspect(bind)
    if not insp.has_table(table):
        return False
    return col not in {c["name"] for c in insp.get_columns(table)}


def upgrade():
    bind = op.get_bind()
    if _needs_col(bind, "rapportini_operativi", "ore_viaggio"):
        op.add_column("rapportini_operativi", sa.Column("ore_viaggio", sa.Float(), nullable=True))
    if _needs_col(bind, "ore_lavorate", "ore_viaggio"):
        op.add_column("ore_lavorate", sa.Column("ore_viaggio", sa.Numeric(5, 2), nullable=True))
    if _needs_col(bind, "ore_extra", "viaggio"):
        op.add_column("ore_extra", sa.Column("viaggio", sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade():
    op.drop_column("ore_extra", "viaggio")
    op.drop_column("ore_lavorate", "ore_viaggio")
    op.drop_column("rapportini_operativi", "ore_viaggio")
