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

    visual_desc = visual.get("visual_description") or (
        "No specific visual direction was provided. "
        "Create a clean, restrained, premium poster visual with simple composition "
        "and avoid inventing unrelated subjects."
    )
    layout_prompt = layout.get("layout_prompt") or (
        "No layout reference was provided. "
        "Use a balanced editorial poster layout with clear spacing and simple hierarchy."
    )
    copy_text = layout.get("copy") or ""
    layout_notes = layout.get("layout_notes") or ""

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
    spatial_ordering = ""

    if copy_text:
        segments = [s.strip() for s in copy_text.split("|") if s.strip()]
        if len(segments) > 1:
            seg_str = ", ".join(f'"{s}"' for s in segments)
            text_instruction = (
                f"The poster MUST prominently and clearly display each of the following separate text phrases "
                f"verbatim in their original language: {seg_str}. "
                f"Render each phrase as a beautiful artistic typography layer, using a bold, clean, highly "
                f"professional modern graphic design font style, positioned perfectly as separate layout elements. "
                f"CRITICAL WARNING: DO NOT print the delimiter symbol '|' or any vertical bars on the poster! "
                f"Only print the exact character segments: {seg_str}. "
                f"DO NOT translate, change spelling, or modify the characters under any circumstances. "
                f"Ensure there are no typos or bad spelling."
            )
            # 提取中文空间方位词，生成英文空间叠加指令
            relations: list[str] = []
            for seg in segments:
                line_match = next(
                    (l for l in layout_notes.split("\n") if seg in l), None
                )
                if line_match:
                    if any(w in line_match for w in ["上方", "顶部", "之上", "above", "top of"]):
                        relations.append(
                            f'  * The text phrase "{seg}" MUST be positioned vertically ABOVE '
                            f"and directly on top of the other main text elements (in the upper region of the poster layout)."
                        )
                    elif any(w in line_match for w in ["下方", "底部", "之下", "below", "bottom of", "under"]):
                        relations.append(
                            f'  * The text phrase "{seg}" MUST be positioned vertically BELOW '
                            f"and directly under the other main text elements (in the lower region of the poster layout)."
                        )
            if relations:
                spatial_ordering = (
                    "\nCRITICAL SPATIAL LAYOUT RELATIONSHIPS (MUST FOLLOW VERTICALLY):\n"
                    + "\n".join(relations)
                    + "\n- Strictly follow this vertical stacking hierarchy."
                )
        else:
            text_instruction = (
                f'The poster MUST prominently and clearly display the exact text characters "{copy_text}" '
                f"verbatim in its original language as a beautiful artistic typography layer, using a bold, clean, "
                f"highly professional modern graphic design font style, positioned perfectly according to the layout. "
                f'DO NOT translate, change spelling, or modify the characters of "{copy_text}" under any circumstances. '
                f"Ensure there are no typos, bad spelling, or garbled letters."
            )

    subtext_instruction = (
        "No separate secondary text is provided. "
        "The complete copy to be rendered is described in the Main Title text layer. "
        "Please arrange and segment the text according to the Layout and Hierarchy Guidelines below."
    )

    # ── 参考图标注 ──
    ref_lines = []
    materials = visual.get("subject_materials") or []
    if visual.get("style_reference_image"):
        ref_lines.append(
            "- Style reference image was analyzed only for visual mood, palette, lighting, background texture, and art direction."
        )
    if visual.get("layout_reference_image"):
        ref_lines.append(
            "- Layout reference image was analyzed only for composition, typography hierarchy, spacing, alignment, and visual weight distribution."
        )
    if visual.get("subject_reference_image"):
        ref_lines.append(
            "- Subject reference image is the PRIMARY identity anchor for img2img. Preserve the same main object/person/pet/product identity, key silhouette, visible markings, and overall look; do not replace it with a generic substitute."
        )
    if any(isinstance(material, dict) and material.get("type") == "other" for material in materials):
        ref_lines.append(
            "- Additional supporting material images were attached and should be used only for user-requested supporting elements without replacing the main subject."
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
        f"A premium, high-end editorial graphic design poster.\n"
        f"Visual Scene Design:\n"
        f"{visual_desc}"
        f"{extend_instruction}\n\n"
        f"Reference Interpretation:\n"
        f"{reference_instruction or '- No reference images were attached.'}\n\n"
        f"Typography & Text Layout:\n"
        f"- Main Title text layer: {text_instruction}"
        f"{chr(10) + spatial_ordering if spatial_ordering else ''}\n"
        f"- Subtext/Slogan details: {subtext_instruction}\n"
        f"- Structure rules: {layout_prompt}\n"
        f"- Layout and Hierarchy Guidelines: {layout_notes}. "
        f"NOTE: The guidelines described here are design and layout instructions only. "
        f"DO NOT print this instruction/description text itself on the poster under any circumstances! "
        f"Only print the actual copy characters from the Main Title text layer.\n\n"
        f"Format & Composition:\n"
        f"- Aspect Ratio: {aspect_ratio}\n"
        f"- Resolution target: {resolution}\n"
        f"- Generate a complete finished poster, not only a background image. "
        f"The final image must combine the available visual scene, subject, typography, and layout into one coherent poster.\n"
        f"- If information is missing, keep that area minimal; do not invent unrelated products, slogans, dates, brands, or event details.\n"
        f"- Highly aesthetic composition, professional graphic design editorial layout, balanced negative space, "
        f"clean typography when text exists, no overlapping elements, masterpiece."
    ).strip()


NEGATIVE_PROMPT = (
    "random text, invented slogans, invented brand, invented date, "
    "background only, no typography when text is provided, blurry, "
    "low quality, bad spelling, garbled letters, overlapping texts, "
    "messy layout, deformed body, ugly background, noisy textured canvas"
)
