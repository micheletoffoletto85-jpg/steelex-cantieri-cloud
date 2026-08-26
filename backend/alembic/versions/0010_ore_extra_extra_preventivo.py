"""Aggiunge extra_preventivo (+ nota) alla singola riga ore_extra — un rapportino può
avere colleghi con ore normali e uno/alcuni con ore extra rispetto al preventivo: non è
un flag unico per tutta la nota diario, va marcato per singola persona/riga.

revision = "0010_ore_extra_extra_preventivo"
down_revision = "0009_rapportini_allineamento_fr"
"""
import sqlalchemy as sa
from alembic import op

revision = "0010_ore_extra_extra_preventivo"
down_revision = "0009_rapportini_allineamento_fr"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("ore_extra",
        sa.Column("extra_preventivo", sa.Boolean(), nullable=True, server_default=sa.false()))
    op.add_column("ore_extra",
        sa.Column("extra_preventivo_nota", sa.Text(), nullable=True))


def downgrade():
    op.drop_column("ore_extra", "extra_preventivo_nota")
    op.drop_column("ore_extra", "extra_preventivo")
