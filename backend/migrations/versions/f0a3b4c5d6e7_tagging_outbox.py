"""Persist image-tagging publication intent atomically with clothing items."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "f0a3b4c5d6e7"
down_revision = "e9f2a3b4c5d6"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "tagging_outbox",
        sa.Column("job_id", sa.String(255), primary_key=True),
        sa.Column(
            "item_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("clothing_items.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("image_reference", sa.String(1024), nullable=False),
        sa.Column("request_id", sa.String(128)),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column(
            "available_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("published_at", sa.DateTime(timezone=True)),
        sa.Column("completed_at", sa.DateTime(timezone=True)),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    op.create_index("ix_tagging_outbox_item_id", "tagging_outbox", ["item_id"])
    op.create_index(
        "ix_tagging_outbox_pending",
        "tagging_outbox",
        ["completed_at", "published_at", "available_at"],
    )


def downgrade():
    op.drop_table("tagging_outbox")
