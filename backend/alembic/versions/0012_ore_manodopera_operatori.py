"""Collega le righe ore manodopera agli operatori e ne valorizza il costo:
- utenti.costo_orario (€/h della manodopera di quell'operatore)
- ore_extra.utente_id (operatore collegato → aggiorna il suo registro ore personale)

revision = "0012_ore_manodopera_operatori"
down_revision = "0011_preventivi_artigiani"
"""
import sqlalchemy as sa
from alembic import op

revision = "0012_ore_manodopera_operatori"
down_revision = "0011_preventivi_artigiani"
branch_labels = None
depends_on = None


def _has_col(bind, table, col):
    return col in {c["name"] for c in sa.inspect(bind).get_columns(table)}


def upgrade():
    bind = op.get_bind()
    if not _has_col(bind, "utenti", "costo_orario"):
        op.add_column("utenti", sa.Column("costo_orario", sa.Float(), nullable=True))
    if not _has_col(bind, "ore_extra", "utente_id"):
        op.add_column("ore_extra", sa.Column("utente_id", sa.Integer(), nullable=True))
        op.create_foreign_key(
            "fk_ore_extra_utente_id", "ore_extra", "utenti",
            ["utente_id"], ["id"], ondelete="SET NULL",
        )


def downgrade():
    op.drop_constraint("fk_ore_extra_utente_id", "ore_extra", type_="foreignkey")
    op.drop_column("ore_extra", "utente_id")
    op.drop_column("utenti", "costo_orario")
