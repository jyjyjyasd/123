"""generations.params.size: enum → W×H pixel string

Revision ID: c2d3e4f56789
Revises: b1c2d3e4f567
Create Date: 2026-04-28

v0.7 改 7 档场景化尺寸（PRD 之外的产品迭代，见 CLAUDE.md §8）。
原本 size 是 'square'/'landscape'/'portrait'/'auto'，现在改存真实
'WIDTHxHEIGHT'（小写 x，与代理 wire 格式一致）。同一枚举在 generate
与 edit 端映射的真实像素不同，所以迁移要 join action 列。

新建任务从 7 档场景预设里选；老数据迁过来的像素值（1792x1024 / 1024x1792
/ 1536x1024 / 1024x1536）不在新预设里，但前端按 W/H 算 aspect-ratio
能正确渲染历史卡片。
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c2d3e4f56789"
down_revision: Union[str, Sequence[str], None] = "b1c2d3e4f567"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# 旧枚举 → 真实像素的查表（按 action 区分 landscape / portrait）
_UPGRADE_SQL = """
UPDATE generations
SET params = json_replace(
    params,
    '$.size',
    CASE
        WHEN json_extract(params, '$.size') = 'square'    THEN '1024x1024'
        WHEN json_extract(params, '$.size') = 'auto'      THEN 'auto'
        WHEN json_extract(params, '$.size') = 'landscape' AND action = 'generate' THEN '1792x1024'
        WHEN json_extract(params, '$.size') = 'landscape' AND action = 'edit'     THEN '1536x1024'
        WHEN json_extract(params, '$.size') = 'portrait'  AND action = 'generate' THEN '1024x1792'
        WHEN json_extract(params, '$.size') = 'portrait'  AND action = 'edit'     THEN '1024x1536'
        ELSE json_extract(params, '$.size')
    END
)
WHERE json_valid(params) = 1
"""

# Best-effort 反向：把已知像素值映射回旧枚举。新增的 7 档（2048x2048 等）
# 在旧枚举里没有对应项，统一回退到 'square' 兜底（仅开发期 downgrade 用）。
_DOWNGRADE_SQL = """
UPDATE generations
SET params = json_replace(
    params,
    '$.size',
    CASE
        WHEN json_extract(params, '$.size') = '1024x1024' THEN 'square'
        WHEN json_extract(params, '$.size') = 'auto'      THEN 'auto'
        WHEN json_extract(params, '$.size') = '1792x1024' AND action = 'generate' THEN 'landscape'
        WHEN json_extract(params, '$.size') = '1024x1792' AND action = 'generate' THEN 'portrait'
        WHEN json_extract(params, '$.size') = '1536x1024' AND action = 'edit'     THEN 'landscape'
        WHEN json_extract(params, '$.size') = '1024x1536' AND action = 'edit'     THEN 'portrait'
        ELSE 'square'
    END
)
WHERE json_valid(params) = 1
"""


def upgrade() -> None:
    op.execute(sa.text(_UPGRADE_SQL))


def downgrade() -> None:
    op.execute(sa.text(_DOWNGRADE_SQL))
