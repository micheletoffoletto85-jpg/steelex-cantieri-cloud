"""Cestino per tutte le eliminazioni: voce collegata alla richiesta e file R2
tenuti finché si svuota il cestino.

revision = "0024_cestino_completo"
down_revision = "0023_cantiere_archiviato"
"""
import sqlalchemy as sa
from alembic import op

revision = "0024_cestino_completo"
down_revision = "0023_cantiere_archiviato"
branch_labels = None
depends_on = None


def upgrade():
    insp = sa.inspect(op.get_bind())
    if "richiesta" not in {c["name"] for c in insp.get_columns("cestino")}:
        op.add_column("cestino", sa.Column("richiesta", sa.String(40), nullable=True))
        op.create_index("ix_cestino_richiesta", "cestino", ["richiesta"])
    if not insp.has_table("file_in_cestino"):
        op.create_table(
            "file_in_cestino",
            sa.Column("id", sa.Integer, primary_key=True, index=True),
            sa.Column("chiave", sa.String(500), nullable=False),
            sa.Column("richiesta", sa.String(40), index=True),
            sa.Column("creato_il", sa.DateTime(timezone=True), server_default=sa.func.now(), index=True),
        )


def downgrade():
    op.drop_table("file_in_cestino")
    op.drop_index("ix_cestino_richiesta", "cestino")
    op.drop_column("cestino", "richiesta")
