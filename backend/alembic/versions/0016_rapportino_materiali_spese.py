"""Aggiunge rapportini_operativi.materiali_spese — traccia i materiali del rapportino
già riversati nelle Spese del cantiere ([{materiale, spesa_id, importo}]), così l'admin
sa quali sono già contabilizzati e non li ri-registra.

revision = "0016_rapportino_materiali_spese"
down_revision = "0015_computo_base_extra"
"""
import sqlalchemy as sa
from alembic import op

revision = "0016_rapportino_materiali_spese"
down_revision = "0015_computo_base_extra"
branch_labels = None
depends_on = None


def _needs_col(bind, table, col):
    insp = sa.inspect(bind)
    if not insp.has_table(table):
        return False   # tabella assente → la crea create_all col modello aggiornato
    return col not in {c["name"] for c in insp.get_columns(table)}


def upgrade():
    bind = op.get_bind()
    if _needs_col(bind, "rapportini_operativi", "materiali_spese"):
        op.add_column("rapportini_operativi",
            sa.Column("materiali_spese", sa.JSON(), nullable=True))


def downgrade():
    op.drop_column("rapportini_operativi", "materiali_spese")
