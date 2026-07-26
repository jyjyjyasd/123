"""agent/layout_processor.py

移植自 prd aihaibaoagent - nano/wen-an-yu-pai-ban-de-pan-duan-chu-li/SKILL.md。

职责：文案与排版判断处理。
  - Branch A（无排版参考图）：按文案权重整理排版层级。
  - Branch B（有排版参考图）：解析参考图版式结构，把用户文案套入该结构。

实际排版分析由 LLM 在 clarifying/prompting 阶段完成，
本模块提供排版结果的数据结构和格式化辅助。
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional


@dataclass
class LayoutDirection:
    """
    排版方向描述，对应 wen-an-yu-pai-ban-de-pan-duan-chu-li SKILL.md Output schema。
    用于第二次确认时展示。
    """
    # 排版图片归类结果
    layout_image_file_id: Optional[str] = None
    layout_prompt_info: str = ""   # 排版提示词信息

    # 文案信息整理
    main_title: str = ""           # 主标题位置与层级
    slogan: str = ""               # slogan 位置与层级
    activity_benefits: str = ""    # 活动福利位置与层级
    launch_time: str = ""          # 上市时间位置与层级
    others: str = ""               # 其他补充文案位置

    # 完整排版描述（供 prompt_compiler 使用）
    layout_notes: str = ""
    layout_prompt: str = ""        # 英文排版提示词


def format_layout_for_confirmation(layout: LayoutDirection) -> str:
    """
    将排版方向格式化为第二次确认时展示的文本。
    对应 SKILL.md Second confirmation requirements。
    """
    lines = ["2文案信息及文案排版（处理后）："]
    lines.append(f"- 排版（图片+提示词信息）：")
    lines.append(f"  - 图片：{layout.layout_image_file_id or '无'}")
    lines.append(f"  - 提示词信息：{layout.layout_prompt_info or '无'}")
    lines.append(f"- 文案信息：")
    if layout.main_title:
        lines.append(f"  - 主标题：{layout.main_title}")
    if layout.slogan:
        lines.append(f"  - 副标题/口号：{layout.slogan}")
    if layout.activity_benefits:
        lines.append(f"  - 活动福利：{layout.activity_benefits}")
    if layout.launch_time:
        lines.append(f"  - 上市时间：{layout.launch_time}")
    if layout.others:
        lines.append(f"  - 其他：{layout.others}")
    return "\n".join(lines)
