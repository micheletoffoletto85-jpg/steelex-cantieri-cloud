"""Aggiunge rapportini_operativi.operatore_nome — nome libero dell'operatore quando
il rapportino è registrato da un admin PER CONTO di un esterno occasionale ("socio")
senza account. operativo_id resta valorizzato (creatore = admin, vincolo NOT NULL),
ma le righe ore/diario a valle usano questo nome. Speculare a ore_lavorate.operatore_nome.

revision = "0019_rapp_operatore_esterno"
down_revision = "0018_ore_lavorate_esterno"
"""
import sqlalchemy as sa
from alembic import op

revision = "0019_rapp_operatore_esterno"
down_revision = "0018_ore_lavorate_esterno"
branch_labels = None
depends_on = None


def _needs_col(bind, table, col):
    insp = sa.inspect(bind)
    if not insp.has_table(table):
        return False   # tabella assente → la crea create_all col modello aggiornato
    return col not in {c["name"] for c in insp.get_columns(table)}


def upgrade():
    bind = op.get_bind()
    if _needs_col(bind, "rapportini_operativi", "operatore_nome"):
        op.add_column("rapportini_operativi", sa.Column("operatore_nome", sa.Text(), nullable=True))


def downgrade():
    op.drop_column("rapportini_operativi", "operatore_nome")
