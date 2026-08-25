"""Traccia le lavorazioni extra rispetto al preventivo originale, sia sui
rapportini vocali (rilevate dall'IA o impostate a mano dall'admin) sia sulle
note diario (il campo era già nello schema Pydantic ma senza colonna DB
corrispondente, quindi non veniva mai salvato).

revision = "0008_extra_preventivo"
down_revision = "0007_ore_lavorate_da_rapportino"
"""
import sqlalchemy as sa
from alembic import op

revision = "0008_extra_preventivo"
down_revision = "0007_ore_lavorate_da_rapportino"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("rapportini_operativi",
        sa.Column("extra_preventivo", sa.Boolean(), nullable=True, server_default=sa.false()))
    op.add_column("rapportini_operativi",
        sa.Column("extra_preventivo_nota", sa.Text(), nullable=True))
    op.add_column("diari_giornalieri",
        sa.Column("extra_preventivo", sa.Boolean(), nullable=True, server_default=sa.false()))
    op.add_column("diari_giornalieri",
        sa.Column("extra_preventivo_nota", sa.Text(), nullable=True))


def downgrade():
    op.drop_column("diari_giornalieri", "extra_preventivo_nota")
    op.drop_column("diari_giornalieri", "extra_preventivo")
    op.drop_column("rapportini_operativi", "extra_preventivo_nota")
    op.drop_column("rapportini_operativi", "extra_preventivo")
