"""Collega il registro ore personale (ore_lavorate) ai rapportini: quando un
rapportino con ore dichiarate viene validato, si crea/aggiorna in automatico
la riga nel registro ore dell'operativo, invece di doverla inserire a mano.

revision = "0007_ore_lavorate_da_rapportino"
down_revision = "0006_rapportini_multi_cantiere"
"""
import sqlalchemy as sa
from alembic import op

revision = "0007_ore_lavorate_da_rapportino"
down_revision = "0006_rapportini_multi_cantiere"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("ore_lavorate",
        sa.Column("rapportino_id", sa.Integer(),
                  sa.ForeignKey("rapportini_operativi.id", ondelete="SET NULL"), nullable=True))
    op.add_column("rapportini_operativi",
        sa.Column("ore_lavorate_id", sa.Integer(),
                  sa.ForeignKey("ore_lavorate.id", ondelete="SET NULL"), nullable=True))


def downgrade():
    op.drop_column("rapportini_operativi", "ore_lavorate_id")
    op.drop_column("ore_lavorate", "rapportino_id")
