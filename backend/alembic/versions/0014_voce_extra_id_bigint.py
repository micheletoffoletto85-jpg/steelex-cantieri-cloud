"""ore_extra.voce_extra_id INTEGER → BIGINT — gli id delle voci del computo sono
timestamp in millisecondi (~1.8e12), fuori dal range di INTEGER (NumericValueOutOfRange).

revision = "0014_voce_extra_id_bigint"
down_revision = "0013_ore_extra_voce_computo"
"""
import sqlalchemy as sa
from alembic import op

revision = "0014_voce_extra_id_bigint"
down_revision = "0013_ore_extra_voce_computo"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    cols = {c["name"] for c in sa.inspect(bind).get_columns("ore_extra")}
    if "voce_extra_id" in cols:
        op.alter_column("ore_extra", "voce_extra_id",
                        type_=sa.BigInteger(), existing_nullable=True)


def downgrade():
    op.alter_column("ore_extra", "voce_extra_id",
                    type_=sa.Integer(), existing_type=sa.BigInteger(), existing_nullable=True)
