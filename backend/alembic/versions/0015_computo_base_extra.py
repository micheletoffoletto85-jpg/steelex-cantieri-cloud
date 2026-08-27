"""Separa i computi base dai preventivi extra:
- preventivi.tipo ("base" | "extra"), parent_id, auto
- cantieri.margine_obiettivo (% margine sul fatturato concordato)

La migrazione delle voci "EXTRA (manodopera)" già finite in un computo base verso
il preventivo extra automatico avviene a runtime (sync_voce_extra_ore si auto-corregge).

revision = "0015_computo_base_extra"
down_revision = "0014_voce_extra_id_bigint"
"""
import sqlalchemy as sa
from alembic import op

revision = "0015_computo_base_extra"
down_revision = "0014_voce_extra_id_bigint"
branch_labels = None
depends_on = None


def _cols(bind, table):
    return {c["name"] for c in sa.inspect(bind).get_columns(table)}


def upgrade():
    bind = op.get_bind()
    pcols = _cols(bind, "preventivi")
    if "tipo" not in pcols:
        op.add_column("preventivi", sa.Column("tipo", sa.String(length=10), nullable=True, server_default="base"))
    if "parent_id" not in pcols:
        op.add_column("preventivi", sa.Column("parent_id", sa.Integer(), nullable=True))
    if "auto" not in pcols:
        op.add_column("preventivi", sa.Column("auto", sa.Boolean(), nullable=True, server_default=sa.false()))
    if "margine_obiettivo" not in _cols(bind, "cantieri"):
        op.add_column("cantieri", sa.Column("margine_obiettivo", sa.Float(), nullable=True))
    op.execute("UPDATE preventivi SET tipo = 'base' WHERE tipo IS NULL")


def downgrade():
    op.drop_column("cantieri", "margine_obiettivo")
    op.drop_column("preventivi", "auto")
    op.drop_column("preventivi", "parent_id")
    op.drop_column("preventivi", "tipo")
