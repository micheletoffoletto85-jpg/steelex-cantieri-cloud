"""Allinea il modello rapportino a FR: form strutturato oltre alla dettatura
(descrizione_lavori/descrizione_extra/materiale_extra/ore_extra), foto separate per
avanzamento/extra, e colleghi_ore (colleghi presenti al lavoro senza un proprio
rapportino, le cui ore vanno comunque registrate nel cantiere).

foto_urls (colonna storica) viene copiata in foto_avanzamento_urls per non perdere le
foto dei rapportini già esistenti — la colonna resta in tabella ma il codice nuovo non
la scrive più, usa solo foto_avanzamento_urls/foto_extra_urls.

revision = "0009_rapportini_allineamento_fr"
down_revision = "0008_extra_preventivo"
"""
import sqlalchemy as sa
from alembic import op

revision = "0009_rapportini_allineamento_fr"
down_revision = "0008_extra_preventivo"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("rapportini_operativi",
        sa.Column("descrizione_lavori", sa.Text(), nullable=True))
    op.add_column("rapportini_operativi",
        sa.Column("foto_avanzamento_urls", sa.JSON(), nullable=True, server_default=sa.text("'[]'")))
    op.add_column("rapportini_operativi",
        sa.Column("descrizione_extra", sa.Text(), nullable=True))
    op.add_column("rapportini_operativi",
        sa.Column("foto_extra_urls", sa.JSON(), nullable=True, server_default=sa.text("'[]'")))
    op.add_column("rapportini_operativi",
        sa.Column("ore_extra", sa.Float(), nullable=True))
    op.add_column("rapportini_operativi",
        sa.Column("materiale_extra", sa.Text(), nullable=True))
    op.add_column("rapportini_operativi",
        sa.Column("colleghi_ore", sa.JSON(), nullable=True, server_default=sa.text("'[]'")))

    # Backfill: le foto già caricate vanno nella nuova colonna "avanzamento"
    op.execute("UPDATE rapportini_operativi SET foto_avanzamento_urls = foto_urls WHERE foto_urls IS NOT NULL")


def downgrade():
    op.drop_column("rapportini_operativi", "colleghi_ore")
    op.drop_column("rapportini_operativi", "materiale_extra")
    op.drop_column("rapportini_operativi", "ore_extra")
    op.drop_column("rapportini_operativi", "foto_extra_urls")
    op.drop_column("rapportini_operativi", "descrizione_extra")
    op.drop_column("rapportini_operativi", "foto_avanzamento_urls")
    op.drop_column("rapportini_operativi", "descrizione_lavori")
