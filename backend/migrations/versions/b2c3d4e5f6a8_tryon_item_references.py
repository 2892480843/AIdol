"""Retain all owner-owned garment references for explicit outfit try-on."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "b2c3d4e5f6a8"
down_revision = "a1b2c3d4e5f7"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("try_on_tasks", sa.Column("item_ids", postgresql.JSONB(), nullable=True))


def downgrade():
    op.drop_column("try_on_tasks", "item_ids")
