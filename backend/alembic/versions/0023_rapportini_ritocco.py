"""Rapportini: flag ritocco (lavori su cantiere già concluso).

revision = "0023_rapportini_ritocco"
down_revision = "0022_preferenze_notifiche"
"""
import sqlalchemy as sa
from alembic import op

revision = "0023_rapportini_ritocco"
down_revision = "0022_preferenze_notifiche"
branch_labels = None
depends_on = None


def upgrade():
    insp = sa.inspect(op.get_bind())
    colonne = {c["name"] for c in insp.get_columns("rapportini_operativi")}
    if "ritocco" not in colonne:
        op.add_column("rapportini_operativi",
                      sa.Column("ritocco", sa.Boolean, nullable=True, server_default=sa.false()))


def downgrade():
    op.drop_column("rapportini_operativi", "ritocco")
