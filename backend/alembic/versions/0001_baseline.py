"""Baseline — fotografa lo schema esistente in produzione.

Lo schema attuale è stato creato nel tempo da Base.metadata.create_all()
più la lista _migra() in main.py (ora congelata). Questa revisione non
modifica nulla: serve solo come punto di partenza. Da qui in poi ogni
modifica allo schema è una nuova revisione in questa cartella:

    alembic revision -m "descrizione"     # crea il file
    # compilare upgrade()/downgrade(), il deploy la applica da solo
"""

revision = "0001_baseline"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    pass


def downgrade():
    pass
