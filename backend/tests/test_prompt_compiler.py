"""Unit tests for agent prompt compiler text-dedup logic."""
from __future__ import annotations

from app.agent.prompt_compiler import build_final_prompt


def _build(copy: str, layout_notes: str = "") -> str:
    return build_final_prompt(
        stream_a={
            "copy": copy,
            "layout_notes": layout_notes,
            "layout_prompt": "Balanced editorial layout with clear hierarchy.",
        },
        stream_b={"visual_description": "A clean, premium poster visual."},
        aspect_ratio="9:16",
        resolution="1k",
    )


def test_multi_segment_each_appears_exactly_once():
    copy = "仲夏端阳 | 粽香满堂，祈福安康 | 岁岁皆如意"
    prompt = _build(copy)
    segments = [s.strip() for s in copy.split("|") if s.strip()]
    assert len(segments) == 3
    for i, seg in enumerate(segments, 1):
        assert prompt.count(f'{i}. "{seg}"') == 1


def test_old_duplicated_blocks_removed():
    prompt = _build("主标题 | 副标题 | 辅助说明")
    assert "Only print the exact character segments" not in prompt
    assert "The text phrase" not in prompt
    assert "MUST be positioned" not in prompt
    assert "CRITICAL SPATIAL LAYOUT" not in prompt


def test_single_segment_still_renders_verbatim():
    prompt = _build("粽香满堂")
    assert 'Render the exact text "粽香满堂" verbatim' in prompt
    assert prompt.count("粽香满堂") == 1


def test_guards_against_separator_numbering_instruction_text():
    prompt = _build("A | B")
    assert "do not print the '|' separators" in prompt
    assert "do not print the '|' separators, the numbering, or any instruction text" in prompt


def test_layout_notes_guard_uses_refined_sentence():
    prompt = _build("主标题 | 副标题", layout_notes="- 主标题 | 位于顶部核心区")
    assert "Print only the Main Title copy. Never render the layout notes or instruction text." in prompt
    assert "guidelines described here" not in prompt
    assert "print this instruction/description text" not in prompt


def test_style_layout_reference_flags_do_not_emit_role_lines():
    """风格/排版参考图只进 LLM 分析通道，不进入生图请求，不应生成职责说明。"""
    prompt = build_final_prompt(
        stream_a={"copy": "主标题 | 副标题", "layout_notes": "", "layout_prompt": "not provided"},
        stream_b={
            "visual_description": "A clean, premium poster visual.",
            "style_reference_image": "/api/files/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
            "layout_reference_image": "/api/files/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
        },
        aspect_ratio="9:16",
        resolution="1k",
    )
    assert "Style reference image was analyzed" not in prompt
    assert "Layout reference image was analyzed" not in prompt


def test_subject_and_other_reference_lines_still_emitted():
    """主体图与其他素材图是真实附件，身份锚定与辅助元素说明必须保留。"""
    prompt = build_final_prompt(
        stream_a={"copy": "主标题 | 副标题", "layout_notes": "", "layout_prompt": "not provided"},
        stream_b={
            "visual_description": "A clean, premium poster visual.",
            "subject_reference_image": "/api/files/cccccccc-cccc-cccc-cccc-cccccccccccc",
            "subject_materials": [
                {"type": "subject", "description": "一只白色猫咪"},
                {"type": "other", "description": "猫粮包装"},
            ],
        },
        aspect_ratio="9:16",
        resolution="1k",
    )
    assert "Subject reference image is the PRIMARY identity anchor" in prompt
    assert "一只白色猫咪" in prompt
    assert "Additional supporting material images were attached" in prompt
    assert "猫粮包装" in prompt
