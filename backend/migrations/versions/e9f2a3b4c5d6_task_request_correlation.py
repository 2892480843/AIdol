"""Persist originating request correlation separately from task inputs."""

import sqlalchemy as sa
from alembic import op

revision = "e9f2a3b4c5d6"
down_revision = "d8e1f2a3b4c5"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("durable_tasks", sa.Column("request_id", sa.String(128), nullable=True))


def downgrade():
    op.drop_column("durable_tasks", "request_id")
