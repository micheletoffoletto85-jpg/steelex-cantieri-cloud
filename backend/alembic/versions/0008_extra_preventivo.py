"""Traccia le lavorazioni extra rispetto al preventivo originale sui
rapportini vocali (rilevate dall'IA o impostate a mano dall'admin).

NOTA: diari_giornalieri.extra_preventivo/extra_preventivo_nota NON sono
in questa migrazione — esistono già in produzione via lo statement
IF NOT EXISTS nella lista _migra() di main.py (commit 7e14640). Mancava
solo la dichiarazione Column() sul modello ORM DiarioGiornaliero (fix
separato), non la colonna DB: aggiungerla di nuovo qui andava in
DuplicateColumn e mandava in crash l'avvio dell'app.

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


def downgrade():
    op.drop_column("rapportini_operativi", "extra_preventivo_nota")
    op.drop_column("rapportini_operativi", "extra_preventivo")
