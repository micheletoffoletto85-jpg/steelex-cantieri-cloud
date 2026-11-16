"""Foto eliminate dal Tab Foto — "lapidi" per non farle ricomparire.

Il GET della galleria riallinea in automatico le foto dei diari mancanti
nell'archivio: senza traccia delle eliminazioni, una foto del diario
cancellata dal Tab Foto veniva ricreata al ricaricamento della pagina.

revision = "0021_foto_cantiere_eliminate"
down_revision = "0020_misure_contabilita"
"""
import sqlalchemy as sa
from alembic import op

revision = "0021_foto_cantiere_eliminate"
down_revision = "0020_misure_contabilita"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    if sa.inspect(bind).has_table("foto_cantiere_eliminate"):
        return
    op.create_table(
        "foto_cantiere_eliminate",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("cantiere_id", sa.Integer(),
                  sa.ForeignKey("cantieri.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("url", sa.String(), nullable=False),
        sa.Column("eliminata_il", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.UniqueConstraint("cantiere_id", "url", name="uq_foto_eliminate_cantiere_url"),
    )


def downgrade():
    op.drop_table("foto_cantiere_eliminate")
