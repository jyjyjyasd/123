"""agent/info_grouper.py

移植自 prd aihaibaoagent - nano/poster-info-grouper/SKILL.md。

职责：把用户输入整理为固定四段（主视觉风格 / 文案排版 / 尺寸 / 清晰度）+ 参考系数。
这是一个纯文本处理辅助模块，在 skill_runner 的 clarifying 阶段调用。
实际分类工作由 LLM 完成（通过 system prompt），本模块主要提供数据结构和验证。
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional


@dataclass
class PosterInfoGroup:
    """海报第一次信息分类结果，对应 poster-info-grouper Skill 的 Output contract。"""

    # 1. 海报主视觉风格
    visual_style: str = ""           # 风格参考图 + 主体元素 + 点缀元素 + 风格关键词
    style_reference_image: Optional[str] = None   # file_id

    # 2. 文案信息及文案排版
    copy_and_layout: str = ""        # 排版参考图 + 排版提示词 + 主标题 + 副标题 ...
    layout_reference_image: Optional[str] = None  # file_id

    # 3. 尺寸
    size: str = ""                   # 用户指定的尺寸（aspect_ratio 格式）

    # 4. 清晰度
    resolution: str = ""             # "" | "2k" | "4k"

    # 5. 参考系数（50% | 100%）
    reference_strength: str = "50%"  # 未指定时默认 50%

    # 主体物素材（可多张）
    subject_materials: list[dict] = field(default_factory=list)

    def reference_strength_label(self) -> str:
        if not self.reference_strength:
            return "50%（未指定，按默认值处理）"
        return self.reference_strength


def validate_aspect_ratio(ratio: str) -> str:
    """将用户输入的比例字符串规范化为 PosterForge 支持的格式。"""
    _MAP = {
        "1:1": "1:1", "16:9": "16:9", "9:16": "9:16",
        "a4": "A4", "a4_horizontal": "A4_Horizontal",
        "banner": "Banner", "3:1": "Banner",
    }
    return _MAP.get(ratio.lower().replace(" ", ""), ratio)
