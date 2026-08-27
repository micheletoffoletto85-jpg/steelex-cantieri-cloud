"""Nuova tabella preventivi_artigiani — preventivi ricevuti dagli artigiani/
subappaltatori per le lavorazioni del cantiere. Alimenta il previsionale del
riepilogo economico (costo manodopera esterna atteso vs computo cliente).

revision = "0011_preventivi_artigiani"
down_revision = "0010_ore_extra_extra_preventivo"
"""
import sqlalchemy as sa
from alembic import op

revision = "0011_preventivi_artigiani"
down_revision = "0010_ore_extra_extra_preventivo"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if "preventivi_artigiani" in insp.get_table_names():
        return  # già creata (es. da create_all in un ambiente non congelato)
    op.create_table(
        "preventivi_artigiani",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("cantiere_id", sa.Integer(), sa.ForeignKey("cantieri.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("artigiano_nome", sa.String(length=200), nullable=False),
        sa.Column("lavorazione", sa.String(length=300), nullable=True),
        sa.Column("descrizione", sa.Text(), nullable=True),
        sa.Column("importo", sa.Float(), nullable=False, server_default="0"),
        sa.Column("stato", sa.String(length=20), nullable=True, server_default="ricevuto"),
        sa.Column("data", sa.Date(), nullable=True),
        sa.Column("pdf_url", sa.String(), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("creato_da", sa.Integer(), sa.ForeignKey("utenti.id"), nullable=True),
        sa.Column("creato_il", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )


def downgrade():
    op.drop_table("preventivi_artigiani")
