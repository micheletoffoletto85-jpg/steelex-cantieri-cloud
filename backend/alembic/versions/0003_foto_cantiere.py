"""Galleria foto cantiere indipendente (ordine, visibilita cliente, cancellazione)
— backfill dalle foto gia' presenti in diario e pin mappa (copia, non sposta:
diario/pin restano invariati per non toccare le altre funzioni che li usano).

revision = "0003_foto_cantiere"
down_revision = "0002_unifica_rubrica_artigiani"
"""
import sqlalchemy as sa
from alembic import op

revision = "0003_foto_cantiere"
down_revision = "0002_unifica_rubrica_artigiani"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "foto_cantiere",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("cantiere_id", sa.Integer(), sa.ForeignKey("cantieri.id"), nullable=False, index=True),
        sa.Column("url", sa.String(), nullable=False),
        sa.Column("ordine", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("visibile_cliente", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("nota", sa.Text(), nullable=True),
        sa.Column("autore_id", sa.Integer(), sa.ForeignKey("utenti.id"), nullable=True),
        sa.Column("creato_il", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )

    bind = op.get_bind()

    # Backfill dai diari (attivita' foto_urls + condividi_cliente)
    diari = bind.execute(sa.text(
        "SELECT id, cantiere_id, foto_urls, condividi_cliente, autore_id, creato_il "
        "FROM diari_giornalieri WHERE foto_urls IS NOT NULL"
    )).fetchall()

    ordine_counter = {}
    righe = []
    for d in diari:
        urls = d.foto_urls or []
        if not isinstance(urls, list):
            continue
        for url in urls:
            if not url:
                continue
            n = ordine_counter.get(d.cantiere_id, 0)
            ordine_counter[d.cantiere_id] = n + 1
            righe.append({
                "cantiere_id": d.cantiere_id,
                "url": url,
                "ordine": n,
                "visibile_cliente": bool(d.condividi_cliente),
                "autore_id": d.autore_id,
                "creato_il": d.creato_il,
            })

    # Backfill dai pin sui documenti (foto_urls dentro pin_dati JSON + visibilita)
    docs = bind.execute(sa.text(
        "SELECT id, cantiere_id, pin_dati FROM documenti WHERE pin_dati IS NOT NULL"
    )).fetchall()

    for doc in docs:
        pins = doc.pin_dati or []
        if not isinstance(pins, list):
            continue
        for pin in pins:
            if not isinstance(pin, dict):
                continue
            urls = pin.get("foto_urls") or []
            visibile = "cliente" in (pin.get("visibilita") or [])
            for url in urls:
                if not url:
                    continue
                n = ordine_counter.get(doc.cantiere_id, 0)
                ordine_counter[doc.cantiere_id] = n + 1
                righe.append({
                    "cantiere_id": doc.cantiere_id,
                    "url": url,
                    "ordine": n,
                    "visibile_cliente": visibile,
                    "autore_id": None,
                    "creato_il": None,
                })

    if righe:
        tabella = sa.table(
            "foto_cantiere",
            sa.column("cantiere_id", sa.Integer),
            sa.column("url", sa.String),
            sa.column("ordine", sa.Integer),
            sa.column("visibile_cliente", sa.Boolean),
            sa.column("autore_id", sa.Integer),
            sa.column("creato_il", sa.DateTime),
        )
        op.bulk_insert(tabella, righe)


def downgrade():
    op.drop_table("foto_cantiere")
