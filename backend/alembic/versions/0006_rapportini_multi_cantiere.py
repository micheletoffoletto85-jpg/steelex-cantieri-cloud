"""Rapportini: rilevamento multi-cantiere (split) e collegamento diretto
alla riga ore_extra creata automaticamente in fase di validazione.

revision = "0006_rapportini_multi_cantiere"
down_revision = "0005_backfill_primo_soccorso"
"""
import sqlalchemy as sa
from alembic import op

revision = "0006_rapportini_multi_cantiere"
down_revision = "0005_backfill_primo_soccorso"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("rapportini_operativi",
        sa.Column("multi_cantiere", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("rapportini_operativi",
        sa.Column("segmenti_cantieri", sa.JSON(), nullable=True))
    op.add_column("rapportini_operativi",
        sa.Column("ore_extra_id", sa.Integer(), sa.ForeignKey("ore_extra.id"), nullable=True))


def downgrade():
    op.drop_column("rapportini_operativi", "ore_extra_id")
    op.drop_column("rapportini_operativi", "segmenti_cantieri")
    op.drop_column("rapportini_operativi", "multi_cantiere")
