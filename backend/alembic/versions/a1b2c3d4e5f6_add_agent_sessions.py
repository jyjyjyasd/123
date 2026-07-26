"""agent: 新增 agent_sessions 表

Revision ID: a1b2c3d4e5f6
Revises: c2d3e4f56789
Create Date: 2026-06-05

新增 agent_sessions 表，存储 AI 海报 Agent 的对话会话。
generation_id 外键关联 generations 表，确保 Agent 最终生成的图片
自动出现在历史记录和 Admin 管理页面中，无需额外适配。
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, Sequence[str], None] = "c2d3e4f56789"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "agent_sessions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        # 状态机：init | clarifying | prompting | generating | review | done | failed
        sa.Column("status", sa.String(16), nullable=False, server_default="init"),
        # 基础参数
        sa.Column("aspect_ratio", sa.String(16), nullable=False, server_default="1:1"),
        sa.Column("resolution", sa.String(4), nullable=False, server_default="1k"),
        # 对话历史与双流（JSON blob）
        sa.Column("clarify_messages", sa.Text(), nullable=True),
        sa.Column("stream_a", sa.Text(), nullable=True),
        sa.Column("stream_b", sa.Text(), nullable=True),
        # 编译后的提示词
        sa.Column("final_prompt", sa.Text(), nullable=True),
        sa.Column("negative_prompt", sa.Text(), nullable=True),
        # 关联生成记录（外键）
        sa.Column(
            "generation_id",
            sa.String(36),
            sa.ForeignKey("generations.id"),
            nullable=True,
        ),
        sa.Column("primary_ratio", sa.String(16), nullable=True),
        sa.Column("primary_resolution", sa.String(4), nullable=True),
        # 多尺寸延伸结果（JSON blob）
        sa.Column("extended_images", sa.Text(), nullable=True),
        # 错误信息
        sa.Column("error_message", sa.Text(), nullable=True),
        # 时间戳
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("idx_agent_user_created", "agent_sessions", ["user_id", "created_at"])


def downgrade() -> None:
    op.drop_index("idx_agent_user_created", table_name="agent_sessions")
    op.drop_table("agent_sessions")
