"""Libretto delle misure di contabilità cantiere — tabella misure_contabilita.
Ogni riga è una misura presa in cantiere, agganciata a una voce del computo.

revision = "0020_misure_contabilita"
down_revision = "0019_rapp_operatore_esterno"
"""
import sqlalchemy as sa
from alembic import op

revision = "0020_misure_contabilita"
down_revision = "0019_rapp_operatore_esterno"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    if sa.inspect(bind).has_table("misure_contabilita"):
        return
    op.create_table(
        "misure_contabilita",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("cantiere_id", sa.Integer(),
                  sa.ForeignKey("cantieri.id", ondelete="CASCADE"), nullable=False),
        sa.Column("voce_id", sa.String()),
        sa.Column("voce_descrizione", sa.String()),
        sa.Column("voce_um", sa.String()),
        sa.Column("voce_qt_computo", sa.Float()),
        sa.Column("descrizione", sa.String(), nullable=False),
        sa.Column("parti", sa.Float(), server_default="1"),
        sa.Column("lunghezza", sa.Float()),
        sa.Column("larghezza", sa.Float()),
        sa.Column("altezza", sa.Float()),
        sa.Column("quantita", sa.Float(), nullable=False, server_default="0"),
        sa.Column("quantita_manuale", sa.Boolean(), server_default=sa.false()),
        sa.Column("data_misura", sa.Date()),
        sa.Column("foto_urls", sa.JSON()),
        sa.Column("note", sa.Text()),
        sa.Column("misurato_da", sa.Integer(), sa.ForeignKey("utenti.id")),
        sa.Column("misurato_da_nome", sa.String()),
        sa.Column("creato_il", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("aggiornato_il", sa.DateTime(timezone=True)),
    )
    op.create_index("ix_misure_contabilita_cantiere_id", "misure_contabilita", ["cantiere_id"])


def downgrade():
    op.drop_table("misure_contabilita")
