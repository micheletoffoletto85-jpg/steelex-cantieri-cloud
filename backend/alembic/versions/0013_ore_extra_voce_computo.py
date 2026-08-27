"""ore_extra.voce_extra_id — quando una riga ore manodopera è segnata extra
preventivo, l'app crea una voce nel computo e ne memorizza qui l'id per poterla
aggiornare/rimuovere.

revision = "0013_ore_extra_voce_computo"
down_revision = "0012_ore_manodopera_operatori"
"""
import sqlalchemy as sa
from alembic import op

revision = "0013_ore_extra_voce_computo"
down_revision = "0012_ore_manodopera_operatori"
branch_labels = None
depends_on = None


def _has_col(bind, table, col):
    return col in {c["name"] for c in sa.inspect(bind).get_columns(table)}


def upgrade():
    bind = op.get_bind()
    if not _has_col(bind, "ore_extra", "voce_extra_id"):
        op.add_column("ore_extra", sa.Column("voce_extra_id", sa.Integer(), nullable=True))


def downgrade():
    op.drop_column("ore_extra", "voce_extra_id")
