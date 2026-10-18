"""Persist owner-private, explicitly submitted image edits without queue replay."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "a1b2c3d4e5f7"
down_revision = "f0a3b4c5d6e7"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "try_on_tasks",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False,
        ),
        sa.Column(
            "item_id", postgresql.UUID(as_uuid=True),
            sa.ForeignKey("clothing_items.id", ondelete="CASCADE"), nullable=False,
        ),
        sa.Column("idempotency_key", sa.String(100), nullable=False),
        sa.Column("request_hash", sa.String(64), nullable=False),
        sa.Column("provider", sa.String(30), nullable=False),
        sa.Column("model", sa.String(140), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("result_path", sa.String(500)),
        sa.Column("error_code", sa.String(50)),
        sa.Column(
            "created_at", sa.DateTime(timezone=True),
            server_default=sa.func.now(), nullable=False,
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True),
            server_default=sa.func.now(), nullable=False,
        ),
        sa.UniqueConstraint("user_id", "idempotency_key", name="uq_try_on_tasks_owner_key"),
    )
    op.create_index("ix_try_on_tasks_owner_created", "try_on_tasks", ["user_id", "created_at"])


def downgrade():
    op.drop_table("try_on_tasks")
