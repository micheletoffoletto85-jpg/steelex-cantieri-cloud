"""Backfill primo_soccorso_scadenza dal vecchio campo attestato_primo_soccorso_scadenza,
per unificare la data di scadenza usata sia dal form (link Drive, come FR) sia
dalla card espansa (upload file). Nessuna colonna nuova.

revision = "0005_backfill_primo_soccorso"
down_revision = "0004_telefono_visura"
"""
import sqlalchemy as sa
from alembic import op

revision = "0005_backfill_primo_soccorso"
down_revision = "0004_telefono_visura"
branch_labels = None
depends_on = None


def upgrade():
    op.execute(sa.text(
        "UPDATE artigiani SET primo_soccorso_scadenza = attestato_primo_soccorso_scadenza "
        "WHERE primo_soccorso_scadenza IS NULL AND attestato_primo_soccorso_scadenza IS NOT NULL"
    ))


def downgrade():
    pass
