"""Allinea artigiani allo schema condiviso con FR Cantieri (rubrica unificata).

revision = "0002_unifica_rubrica_artigiani"
down_revision = "0001_baseline"
"""
import sqlalchemy as sa
from alembic import op

revision = "0002_unifica_rubrica_artigiani"
down_revision = "0001_baseline"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("artigiani", sa.Column("tags", sa.Text(), nullable=True))
    op.add_column("artigiani", sa.Column("durc_drive_url", sa.String(500), nullable=True))
    op.add_column("artigiani", sa.Column("primo_soccorso_scadenza", sa.Date(), nullable=True))
    op.add_column("artigiani", sa.Column("primo_soccorso_drive_url", sa.String(500), nullable=True))
    op.add_column("artigiani", sa.Column("visura_camerale_scadenza", sa.Date(), nullable=True))
    op.add_column("artigiani", sa.Column("visura_camerale_drive_url", sa.String(500), nullable=True))
    op.add_column("artigiani", sa.Column("drive_folder_url", sa.String(500), nullable=True))


def downgrade():
    op.drop_column("artigiani", "drive_folder_url")
    op.drop_column("artigiani", "visura_camerale_drive_url")
    op.drop_column("artigiani", "visura_camerale_scadenza")
    op.drop_column("artigiani", "primo_soccorso_drive_url")
    op.drop_column("artigiani", "primo_soccorso_scadenza")
    op.drop_column("artigiani", "durc_drive_url")
    op.drop_column("artigiani", "tags")
