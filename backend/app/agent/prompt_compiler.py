"""agent/prompt_compiler.py

移植自 prd generate/route.ts buildFinalPrompt（约 100 行纯函数）。

职责：将 stream_a（文案/排版）+ stream_b（主视觉）编译为最终的英文生图提示词。
无 IO，无副作用，可单独单元测试。
"""
from __future__ import annotations

from typing import Any


def build_final_prompt(
    *,
    stream_a: dict[str, Any] | None,
    stream_b: dict[str, Any] | None,
    aspect_ratio: str,
    resolution: str,
    is_extend: bool = False,
    primary_ratio: str | None = None,
) -> str:
    """
    移植自 prd buildFinalPrompt。
    is_extend=True 时注入多尺寸延伸一致性指令（对应 prd isExtend 分支）。
    """
    layout = stream_a or {}
    visual = stream_b or {}

    visual_desc = visual.get("visual_description")
    if visual_desc == "参考图片" or not visual_desc:
        visual_desc = visual.get("style_ref_description")
        if (visual_desc == "参考图片" or not visual_desc) and visual.get("style_reference_image"):
            visual_desc = "Use the visual style, colors, lighting, and mood from the provided style reference image."

    visual_desc = visual_desc or (
        "No specific visual direction was provided. "
        "Create a clean, restrained, premium poster visual with simple composition "
        "and avoid inventing unrelated subjects."
    )
    copy_text = layout.get("copy") or ""
    layout_notes = layout.get("layout_notes")
    if layout_notes == "参考图片" or not layout_notes:
        layout_notes = layout.get("layout_ref_notes")

    # Restore layout_prompt when layout_notes matches the cached reference notes or layout reference image is present
    layout_ref_image = visual.get("layout_reference_image")
    layout_prompt = layout.get("layout_prompt")

    is_using_ref_layout = (
        (layout_notes and layout_notes == layout.get("layout_ref_notes")) or
        (not layout_notes and layout_ref_image)
    )

    if is_using_ref_layout:
        if layout.get("layout_ref_prompt"):
            layout_prompt = layout.get("layout_ref_prompt")
        elif layout_ref_image:
            layout_prompt = "Use a balanced editorial poster layout with clear spacing and simple hierarchy matching the provided layout reference image."
            if not layout_notes:
                layout_notes = "Use a balanced editorial poster layout with clear spacing and simple hierarchy matching the provided layout reference image."

    layout_notes = layout_notes or ""
    layout_prompt = layout_prompt or (
        "No layout reference was provided. "
        "Use a balanced editorial poster layout with clear spacing and simple hierarchy."
    )

    # 用动态字段值替换 layout_notes 里的占位行（移植 prd 同名逻辑）
    if layout_notes and isinstance(layout, dict):
        lines = layout_notes.split("\n")
        rebuilt: list[str] = []
        for line in lines:
            has_pipe = "|" in line
            if line.strip().startswith("-") or has_pipe:
                copy_seg = line.split("|")[0] if has_pipe else line
                copy_segment = copy_seg.strip().lstrip("-").strip()
                live_val = layout.get(copy_segment)
                if live_val and isinstance(live_val, str):
                    rebuilt.append(live_val if live_val.strip().startswith("-") else f"- {live_val}")
                    continue
            rebuilt.append(line)
        layout_notes = "\n".join(rebuilt)

    # ── 文案指令 ──
    text_instruction = (
        "No main title text was provided. "
        "Keep the design clean and do not invent random text."
    )
    if copy_text:
        segments = [s.strip() for s in copy_text.split("|") if s.strip()]
        if len(segments) > 1:
            # 编号单次枚举：每段文案只出现一次，顺序默认自上而下（copy 本身按主标题|副标题|辅助排列）
            numbered_lines = "\n".join(f'  {i}. "{seg}"' for i, seg in enumerate(segments, 1))
            text_instruction = (
                f"Render the following {len(segments)} text phrases EXACTLY as written, in this order, "
                f"as separate typography layers on the poster, using a bold, clean, professional modern graphic design font style:\n"
                f"{numbered_lines}\n"
                f"Vertical order: follow the numbered list top to bottom.\n"
                f"Never translate, alter, merge, split, or invent any characters; "
                f"do not print the '|' separators, the numbering, or any instruction text."
            )
        else:
            text_instruction = (
                f'Render the exact text "{copy_text}" verbatim as the poster\'s typography, '
                f"using a bold, clean, professional modern graphic design font style, positioned according to the layout. "
                f"Never translate, alter, or invent any characters; ensure no typos or garbled letters."
            )

    # ── 参考图标注 ──
    # 风格/排版参考图只走 LLM 分析通道，不进入生图请求（见 skill_runner.collect_generation_reference_file_ids），
    # 因此不生成对应职责说明；仅主体图、其他素材图作为真实附件提交。
    ref_lines = []
    materials = visual.get("subject_materials") or []

    subject_mat = next((m for m in materials if isinstance(m, dict) and m.get("type") == "subject"), None)
    subject_desc = subject_mat.get("description") if subject_mat else ""
    if visual.get("subject_reference_image"):
        ref_lines.append(
            f"- Subject reference image is the PRIMARY identity anchor for img2img. The main subject reference is: {subject_desc if subject_desc else 'the provided image'}. Preserve the same main object/person/pet/product identity, key silhouette, visible markings, and overall look; do not replace it with a generic substitute."
        )
        
    other_mats = [m for m in materials if isinstance(m, dict) and m.get("type") == "other"]
    if other_mats:
        other_descs = [m.get("description", "") for m in other_mats if m.get("description")]
        desc_str = (" The specific supporting elements to include are: " + " / ".join(other_descs) + ".") if other_descs else ""
        ref_lines.append(
            f"- Additional supporting material images were attached and should be used only for user-requested supporting elements without replacing the main subject.{desc_str}"
        )
        
    reference_instruction = "\n".join(ref_lines)

    # ── 多尺寸延伸指令 ──
    extend_instruction = ""
    if is_extend:
        extend_instruction = (
            f"\nCRITICAL SIZE EXTENSION GUIDELINE:\n"
            f"- This is a multi-size layout extension of our original master poster visual.\n"
            f"- Treat the first attached reference image as the exact previous approved poster to extend from.\n"
            f"- You MUST maintain absolute visual and styling consistency with the original master poster "
            f"(same main subject, same color scheme, same mood, and same artistic design).\n"
            f"- Relayout and rearrange the typography elements and separate copy segments to fit the new "
            f"aspect ratio ({aspect_ratio}) cleanly. DO NOT invent new slogans or details."
        )

    return (
        f"The poster design content is as follows:\n"
        f"Visual Scene Design:\n"
        f"{visual_desc}"
        f"{extend_instruction}\n\n"
        f"Reference Interpretation:\n"
        f"{reference_instruction or '- No reference images were attached.'}\n\n"
        f"Typography & Text Layout:\n"
        f"- Main Title text layer: {text_instruction}\n"
        f"- Structure rules: {layout_prompt}\n"
        f"- Layout and Hierarchy Guidelines: {layout_notes}. "
        f"Print only the Main Title copy. Never render the layout notes or instruction text.\n\n"
        f"Format & Composition:\n"
        f"- Aspect Ratio: {aspect_ratio}\n"
        f"- Resolution target: {resolution}\n"
        f"- Missing info stays blank; never invent. Balanced composition, clean typography, no overlap.\n"
    ).strip()


NEGATIVE_PROMPT = (
    "random text, invented slogans, invented brand, invented date, "
    "background only, no typography when text is provided, blurry, "
    "low quality, bad spelling, garbled letters, overlapping texts, "
    "messy layout, deformed body, ugly background, noisy textured canvas"
)
