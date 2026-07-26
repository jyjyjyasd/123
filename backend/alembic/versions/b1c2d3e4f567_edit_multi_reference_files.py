"""edit: support multiple reference images (1–5)

Revision ID: b1c2d3e4f567
Revises: 90864daa6335
Create Date: 2026-04-27

迁移 generations.reference_file_id (单 FK) → generations.reference_file_ids (JSON 数组)。
代理实测确认 multipart 重复 `image` 字段可传多张参考图，本次解除 §11 单图限制（上限 5 张）。
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b1c2d3e4f567"
down_revision: Union[str, Sequence[str], None] = "90864daa6335"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. 加新列（TEXT，存 JSON 数组；与 output_file_ids 保持一致风格）
    with op.batch_alter_table("generations") as batch_op:
        batch_op.add_column(sa.Column("reference_file_ids", sa.Text(), nullable=True))

    # 2. 回填：原本指向单 FK 的行 → 写成 JSON 单元素数组
    op.execute(
        sa.text(
            "UPDATE generations "
            "SET reference_file_ids = '[\"' || reference_file_id || '\"]' "
            "WHERE reference_file_id IS NOT NULL"
        )
    )

    # 3. 删旧 FK 列。SQLite 不支持原生 DROP COLUMN with FK，用 batch 模式重建表。
    with op.batch_alter_table("generations") as batch_op:
        batch_op.drop_column("reference_file_id")


def downgrade() -> None:
    # 还原回单 FK 形态。多图行只保留首张（best-effort）。
    with op.batch_alter_table("generations") as batch_op:
        batch_op.add_column(
            sa.Column("reference_file_id", sa.String(length=36), nullable=True)
        )
        batch_op.create_foreign_key(
            "fk_generations_reference_file_id",
            "files",
            ["reference_file_id"],
            ["id"],
        )

    op.execute(
        sa.text(
            "UPDATE generations "
            "SET reference_file_id = json_extract(reference_file_ids, '$[0]') "
            "WHERE reference_file_ids IS NOT NULL"
        )
    )

    with op.batch_alter_table("generations") as batch_op:
        batch_op.drop_column("reference_file_ids")
