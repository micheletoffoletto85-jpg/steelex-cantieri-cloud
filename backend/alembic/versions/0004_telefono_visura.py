"""Telefono utenti (rubrica cantiere) e documento visura camerale artigiani (upload).

revision = "0004_telefono_visura"
down_revision = "0003_foto_cantiere"
"""
import sqlalchemy as sa
from alembic import op

revision = "0004_telefono_visura"
down_revision = "0003_foto_cantiere"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("utenti", sa.Column("telefono", sa.String(30), nullable=True))
    op.add_column("artigiani", sa.Column("visura_camerale_url", sa.String(500), nullable=True))


def downgrade():
    op.drop_column("artigiani", "visura_camerale_url")
    op.drop_column("utenti", "telefono")
