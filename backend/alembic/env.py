# Ambiente Alembic — usa l'engine e i modelli dell'app.
# Le nuove modifiche allo schema si fanno SOLO con revisioni in versions/,
# la vecchia lista _migra() in main.py è congelata.
import os
import sys

# Rende importabile il pacchetto app sia da CLI che da runtime
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from alembic import context
from app.database import engine, Base
from app.models import (  # noqa: F401 — registra tutti i modelli sul metadata
    utente, cantiere, diario, documento, checklist, economico, notifica,
    raccolta_docs, nota_campo, fornitore_rating, artigiano, non_conformita,
    notifica_inapp, rapportino, programmazione, assegnazione,
)

target_metadata = Base.metadata


def run_migrations_online():
    with engine.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


run_migrations_online()
