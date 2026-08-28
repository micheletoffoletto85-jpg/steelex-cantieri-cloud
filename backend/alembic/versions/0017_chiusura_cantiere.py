"""Verbale di chiusura cantiere — tabella chiusure_cantiere (relazione lavori,
selezione foto, dati di consegna e firme). Documento relazionale, non contabile.

revision = "0017_chiusura_cantiere"
down_revision = "0016_rapportino_materiali_spese"
"""
import sqlalchemy as sa
from alembic import op

revision = "0017_chiusura_cantiere"
down_revision = "0016_rapportino_materiali_spese"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    if sa.inspect(bind).has_table("chiusure_cantiere"):
        return
    op.create_table(
        "chiusure_cantiere",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("cantiere_id", sa.Integer(),
                  sa.ForeignKey("cantieri.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("relazione", sa.Text()),
        sa.Column("consegne", sa.Text()),
        sa.Column("foto_ids", sa.JSON()),
        sa.Column("foto_copertina_id", sa.Integer()),
        sa.Column("committente_nome", sa.String()),
        sa.Column("direzione_lavori", sa.String()),
        sa.Column("responsabile_nome", sa.String()),
        sa.Column("data_ultimazione", sa.Date()),
        sa.Column("stato", sa.String(length=20), server_default="bozza"),
        sa.Column("numero", sa.String(length=40)),
        sa.Column("creato_da", sa.Integer(), sa.ForeignKey("utenti.id")),
        sa.Column("creato_il", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("aggiornato_il", sa.DateTime(timezone=True)),
    )
    op.create_index("ix_chiusure_cantiere_cantiere_id", "chiusure_cantiere", ["cantiere_id"])


def downgrade():
    op.drop_table("chiusure_cantiere")
