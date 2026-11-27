"""Preferenze notifiche per utente + copia cifrata della password per l'admin.

revision = "0022_preferenze_notifiche"
down_revision = "0021_foto_cantiere_eliminate"
"""
import sqlalchemy as sa
from alembic import op

revision = "0022_preferenze_notifiche"
down_revision = "0021_foto_cantiere_eliminate"
branch_labels = None
depends_on = None


def upgrade():
    insp = sa.inspect(op.get_bind())
    colonne = {c["name"] for c in insp.get_columns("utenti")}
    # Categorie di notifiche spente dall'utente — lista vuota = tutte attive
    if "notifiche_disattivate" not in colonne:
        op.add_column("utenti", sa.Column("notifiche_disattivate", sa.JSON, nullable=True))
    # Password cifrata (reversibile, solo per l'admin) — vedi app/password_visibile.py
    if "password_cifrata" not in colonne:
        op.add_column("utenti", sa.Column("password_cifrata", sa.Text, nullable=True))


def downgrade():
    op.drop_column("utenti", "password_cifrata")
    op.drop_column("utenti", "notifiche_disattivate")
