"""agent/llm_client.py

移植自 prd/src/services/chat/real.ts：buildSystemPrompt + LLM SSE 调用。

职责：
  - 维护完整的系统 prompt 模板（双流拆解、SECTION 约定、两轮确认规则）
  - 将会话快照 + 用户消息 + 参考图 base64 组装成 messages 列表
  - 以 httpx AsyncClient 调 LLM chat/completions（stream=true），yield SSE chunk
  - 从流末尾解析 [JSON_START]...[JSON_END] 结构化数据并返回
"""
from __future__ import annotations

import base64
import json
import logging
import time
from pathlib import Path
from typing import AsyncIterator

import httpx

from app.config import get_settings

logger = logging.getLogger("posterforge.agent.llm")

# ─────────────────────────────── 常量 ────────────────────────────────────────

NEGATIVE_PROMPT = (
    "random text, invented slogans, invented brand, invented date, "
    "background only, no typography when text is provided, blurry, "
    "low quality, bad spelling, garbled letters, overlapping texts, "
    "messy layout, deformed body, ugly background, noisy textured canvas"
)

_VALID_RATIOS = {"1:1", "16:9", "9:16", "A4", "Banner", "A4_Horizontal"}


# ─────────────────────────────── 辅助函数 ────────────────────────────────────

def _file_to_base64_data_url(file_path: Path) -> str | None:
    """将本地图片文件转为 base64 data URL，供 LLM vision 接口使用。"""
    if not file_path.exists():
        return None
    ext = file_path.suffix.lower()
    mime = {"png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg", "webp": "image/webp"}.get(
        ext.lstrip("."), "image/png"
    )
    data = base64.b64encode(file_path.read_bytes()).decode()
    return f"data:{mime};base64,{data}"


def _is_confirming(text: str) -> bool:
    """检测用户是否在表达确认意图（对应 prd isConfirming）。"""
    import re
    return bool(re.search(r"确认|可以|没问题|同意|正确|开始|生成|就这样|ok|okay|yes", text, re.IGNORECASE))


def _compact_history(clarify_messages: list[dict], *, max_messages: int = 6, max_chars: int = 1200) -> list[dict]:
    trimmed = clarify_messages[-max_messages:]
    out: list[dict] = []
    for msg in trimmed:
        role = msg.get("role") or "user"
        content = (msg.get("content") or "").strip()
        if len(content) > max_chars:
            content = content[:max_chars] + "\n...[truncated]"
        out.append({"role": role, "content": content})
    return out


# ─────────────────────────────── System Prompt ───────────────────────────────

def build_system_prompt(
    aspect_ratio: str,
    resolution: str,
    has_style_ref: bool = False,
    has_layout_ref: bool = False,
    pdf_text: str | None = None,
    density: str = "中",
    is_refresh_styles: bool = False,
    is_refresh_layouts: bool = False,
    existing_style_names: list[str] | None = None,
    existing_layout_names: list[str] | None = None,
    poster_strategy: dict | None = None,
    confirmed_copy: str | None = None,
    status: str = "init",
) -> str:
    """
    移植自 prd real.ts buildSystemPrompt。
    完整保留双流拆解规则、SECTION 结构约定、两轮确认逻辑、风格/排版推荐触发条件。
    status 参数用于按状态动态精简 prompt，避免不相关规则浪费 token。
    """
    # -- refresh-layouts shortcut: ultra-short prompt (~90% token savings) --
    if is_refresh_layouts:
        dedupe_note = ""
        if existing_layout_names:
            names = ", ".join(existing_layout_names)
            dedupe_note = (
                "\n"
                + "你之前已经推荐过以下排版方案："
                + names
                + "。\n"
                + "本轮你必须推荐 4 种与上述排版完全不同、布局结构有明显差异的新排版方案！绝对禁止重复推荐上述排版方案。\n"
            )
        return f"""你是 AI 海报设计助理，当前处于排版方案刷新模式。
{dedupe_note}
请仅输出 4 条全新的排版推荐。每条严格遵循格式：
📐 排版推荐：[序号]. [排版中文名] ([English Layout Name]) / [一句话简短中文排版描述]

4 个排版必须在布局结构上彼此有明显差异（如一个中心对称、一个上下分割、一个分栏网格、一个对角线构图）。

在回复末尾必须包含结构化 JSON，里面必须完整且仅包含 stream_a.layout_recommendations：
[JSON_START]{{{{"status":"clarifying","stream_a":{{{{"layout_recommendations":[{{{{"index":1,"name":"排版方案名","name_en":"English","description":"简短描述","layout_notes":"完整英文排版提示词"}}}}]}}}}}}}}[JSON_END]"""
    # -- refresh-styles shortcut: ultra-short prompt (~90% token savings) --
    if is_refresh_styles:
        dedupe_note = ""
        if existing_style_names:
            names = ", ".join(existing_style_names)
            dedupe_note = (
                "\n"
                + "你之前已经推荐过以下风格："
                + names
                + "。\n"
                + "本轮你必须推荐 4 种与上述风格完全不同、方向相异的新设计风格方案！绝对禁止重复推荐上述风格。\n"
            )
        return f"""你是 AI 海报设计助理，当前处于风格刷新模式。
{dedupe_note}
请仅输出 4 条全新的风格推荐。每条严格遵循格式：
🎨 风格推荐：[序号]. [风格中文名] ([English Style Name]) / [一句话简短中文风格描述]

4 个风格必须在审美方向上彼此有明显差异（如一个极简、一个色彩浓烈、一个科技未来、一个复古）。

在回复末尾必须包含结构化 JSON：
[JSON_START]{{{{"status":"clarifying","stream_b":{{{{"style_recommendations":[{{{{"index":1,"name":"风格名","name_en":"English","description":"简短描述","visual_description":"完整英文视觉提示词"}}}}]}}}}}}}}[JSON_END]"""

    ref_notifications = []
    if has_style_ref:
        ref_notifications.append("- 【重要】检测到用户已上传风格参考图。")
    if has_layout_ref:
        ref_notifications.append("- 【重要】检测到用户已上传排版参考图。")
    ref_notice_text = "\n".join(ref_notifications) + "\n" if ref_notifications else ""

    density_instructions = f"""【⚠️ 核心规则：文案密度设定为【{density}】】
当前海报设定的文案密度标准为：【{density}】。你所撰写/推荐的所有“真实文案”必须严格遵守该密度的字数与排版规范：
- 如果密度为「疏」：主标题字数限制在 4-6 字内，副标题或 slogan 极简（5-8字），尽量少写辅助信息与板块。如果是 9:32 详情页，也仅保留 1-2 个最核心的板块，大面积留白，字符极其克制，防止画面臃肿。
- 如果密度为「中」：正常生成标准厚度的文案。标准海报保持 2-3 层常规文案； 9:32 详情页保持 3-4 个正常板块结构。
- 如果密度为「密」：字数饱满、内容详实。如果是普通海报，增加行动号召、参数、背书等辅助小字（增加 1-2 层内容）；如果是 9:32 详情页，必须写满 4 个完整的板块，包含主副标题、多项并列亮点拆解（每项亮点展开多字描述）、场景价值、品牌及福利行动指南，提供极高信息量。"""

    is_9_32 = aspect_ratio == "9:32"
    if is_9_32:
        copy_rules = """【⚠️ 泛需求/少文案下的设计师自主写词规则】由于当前画幅为 9:32 详情页，当检测到用户给到的文案信息非常稀少（少于 5 个字）时，你必须扮演高级平面设计师/创意总监，主动为详情页长图设计并撰写一套内容极其饱满的印刷文案组。
   自主撰写规范：
   - 主动衍生并生成结构完整、层级分明（包含至少 4 个及以上独立板块）的文案组：
     1. 第一板块（大标题区）：一个主标题、一个副标题/英文引词、一个口号Slogan；
     2. 第二板块（核心特色解析）：至少 2-3 个带有简短描述的产品/服务亮点（格式如“亮点标题 | 亮点内容说明”）；
     3. 第三板块（使用场景/用户价值）：一个场景化金句或行动指南；
     4. 第四板块（行动召唤与背书）：一个品牌口号、一个限时福利说明或联系信息等；
   - 允许适当放宽字数以丰富长图信息，多项文案统一用 “ | ” 拼接为单行真实文案；
   - 结合海报视觉风格进行定制化设计（如国潮风配雅致词句，日系风配生活质感，科技风穿插英文字母，促销风突出利益点）；
   - 绝对不要只保留单一通用词，也禁止直接在 missing 区域列出文案为“缺失”，必须用丰富的设计师文案填充“真实文案”字段以充实长图内容。"""
        
        layout_rules = """【排版推荐规则（必须输出）】由于当前画幅为 9:32 详情页，在第一阶段（clarifying）回复中，你必须始终在 [[SECTION:layout_plan]] 中输出 4 个针对详情页长图专门设计的排版推荐选项，且必须在末尾 JSON 块中的 `stream_a.layout_recommendations` 字段中同步输出对应的 4 个推荐方案的结构化数据（绝对不能为 null）。推荐命名不可有视觉风格倾向，必须 100% 聚焦于纵向空间结构与构图。
   - 【排版推荐输出格式】每条排版推荐独占一行，严格遵循格式：📐 排版推荐：[序号]. [方案中文名] / [一句话中文排版描述]。示例行：
     📐 排版推荐：1. 多段故事信息流版式 / 自上而下多层段落，引导深度阅读
     📐 排版推荐：2. 三段式产品卖点版式 / 顶置焦点主图，中段分栏卖点解析，底置品牌签名
     📐 排版推荐：3. 纵向图文交错卡片版式 / 图文卡片交错排列，结构清晰且呼吸感强
     📐 排版推荐：4. 杂志级图文画册版式 / 大字标题开篇，多栏网格并列，适合长篇幅说明"""
    else:
        copy_rules = """【⚠️ 泛需求/少文案下的设计师自主写词规则】如果用户给到的文案信息非常稀少（如仅有主题词、通用节日名或总字数少于5个字，例如“端午节”、“咖啡海报”、“新年快乐”），你必须像一个高级平面设计师/创意总监一样，主动为海报策划并撰写一套具有视觉美感与设计调性的印刷文案。
   自主撰写规范：
   - 主动衍生并生成结构完整、层级分明（如“主标题 | 副标题或口号Slogan | 辅助说明或年份时间”）的文案组，用“ | ”拼接；
   - 必须结合当前海报的视觉风格调性进行定制化设计：
     * 国潮/新中式/复古/传统节日风格：设计具有古风意境、诗意或温情感人、引起情感共鸣的雅致词句（如将“端午节”扩写为“仲夏端阳 | 粽香满堂，祈福安康 | 岁岁皆如意”）；
     * 极简/日系/现代艺术风格：设计高度凝练、有留白和哲学感、充满生活质感的短语（如将“咖啡”扩写为“慢享时光 | 一杯温热，满室醇香 | Coffee Break”）；
     * 酸性赛博/潮酷/科技风格：设计充满力量感、视觉冲击力、中英文穿插或数字符号的硬核词汇（如“FUTURE CITY | 霓虹觉醒，硬核玩家 | RESET 2026”）；
     * 促销/市集/活动风格：设计极具号召力、利益点明确且朗朗上口的商业短句；
   - 严格控制总字数，主标题控制在4-8字，Slogan控制在8-15字，确保字符数量与排版视觉效果完美契合，不可臃肿。
   - 绝对不要只保留干瘪的单次通用词，也禁止直接在 missing 区域列出文案为“缺失”，必须用你设计的高级文案来填充“真实文案”字段以惊艳用户。"""
        
        layout_rules = """【排版推荐规则（必须输出）】在第一轮回复（status: "clarifying"）中，你必须始终在 [[SECTION:layout_plan]] 中输出 4 个排版推荐选项，且必须在末尾 JSON 块中的 `stream_a.layout_recommendations` 字段中同步输出对应的 4 个推荐方案的结构化数据（绝对不能为 null）。无论 layout_reference_image 是否为 null，无论用户是否提供了具体的排版设计描述，你都必须在第一行正常输出 `全局布局 | （构图与排版形态描述）` 行，然后再输出 4 个排版推荐选项供用户选择或切换。四种排版推荐命名不可有视觉风格倾向，必须100%聚焦于空间结构与构图。
   - 【排版命名规范】排版推荐命名严禁包含“潮流”、“拼贴”、“市集”、“萌宠”等任何任何明显的视觉风格或主题倾向词，核心命名必须100%聚焦于空间结构、构图逻辑与版式形态本身。
   - 【排版推荐输出格式】每条排版推荐独占一行，严格遵循格式：📐 排版推荐：[序号]. [方案中文名] / [一句话中文排版描述]。示例行：
     📐 排版推荐：1. 中心对称均衡版式 / 视觉居中，上下对称排列
     📐 排版推荐：2. 非对称黄金分割版式 / 图文左右分割，错落层级
     📐 排版推荐：3. 极简网格大留白版式 / 严格网格对齐与大负空间
     📐 排版推荐：4. 上下图文多栏版式 / 上部主视觉，下部多栏文本"""

    pdf_notice = ""
    if pdf_text:
        pdf_notice = (
            f"\n【重要参考：用户上传的 PDF 需求文档内容如下（请优先提取此处内容作为海报文案和设计输入源，务必严格参考）】:\n"
            f"{pdf_text}\n"
        )

    existing_styles_prompt = ""

    strategy_prompt = ""
    if poster_strategy and isinstance(poster_strategy, dict):
        pos = poster_strategy.get("position") or "未指定"
        pur = poster_strategy.get("purpose") or "未指定"
        strategy_prompt = f"""

【海报策略定位指导（⚠️最高优先级指导下游）】
当前海报已确定核心策略定位，你所推荐的全部方案与撰写的真实文案必须严格契合该场景与目标：
- 海报定位与应用场景：【{pos}】
- 核心作用与商业目标：【{pur}】

你必须根据该策略定位，针对性地制定：
1. 风格推荐：如是大促，推荐的 4 个风格必须包含具有商业冲击力和强烈促销氛围的风格（如大促红黄、酸性大字）；如是小红书种草，推荐轻奢、文艺日系或年轻简约等适合社交分享的质感风格；如是朋友圈节日祝福，推荐温馨情感、雅致国潮等风格。
2. 排版版式：排版重心须符合使用场景。例如，详情页长图/小红书推荐多段故事流或图文交错网格，Banner推荐左右对称或左图右文结构，朋友圈海报推荐中心对称留白版式。
3. 真实文案：文案内容必须围绕海报核心目标。例如促销必须包含价格/福利说明（如“限时5折起”）与强号召；品牌问候要富有诗意或情感金句；新品宣发应聚焦于新概念与高冷调性。
"""

    confirmed_copy_instruction = ""
    if confirmed_copy:
        confirmed_copy_instruction = f"""

【⚠️ 真实文案定稿保护规则（绝对最高优先级）】
用户已经确认了海报的第一阶段文案定稿，内容为：
{confirmed_copy}

在本轮回复中，你必须绝对严格遵守以下规则，任何违反都将导致生成失败：
1. 你必须在 [[SECTION:poster_text]] 的“真实文案：”中，以及在末尾的结构化 JSON `stream_a.copy` 字段中，**100% 逐字复制并完全使用**上述文案，严禁擅自修改、增删、缩减、重写或重新润色任何一个字。
2. 在 [[SECTION:layout_plan]] 的具体文案排版行规划中，所拆分出来的每一段文案，必须完全对应上述文案用“ | ”分隔后的各个子段落，绝对禁止自行改词、简化或重新生成。
3. 不管你是处于 `clarifying` 还是 `prompting` 阶段，该文案均为绝对定稿，禁止为了追求多样性而对文案进行任何概率性的重新生成。"""

    return f"""你是 AI 海报设计助理。请严格遵循以下规则：
{confirmed_copy_instruction}
{pdf_notice}{existing_styles_prompt}{strategy_prompt}

【最高优先级】必须始终用中文回复。所有输出文字（SECTION 面板、对话、说明）必须全部使用中文。仅 [JSON_START]...[JSON_END] 内 stream_b.visual_description 和 stream_a.layout_prompt 这两个字段可以使用英文，因为它们直接用于英文生图引擎。违反此规则视为严重错误。

{ref_notice_text}
一、流程规则（强制两轮确认）
0. 【强制的两轮确认流程】无论用户第一轮输入的信息多么完整，你必须严格走完以下两轮，不允许跳过：
   - 第一轮（你的首次回复）：status 必须为 “clarifying”，整理信息、展示已知/缺失，仅输出全局布局。禁止直接跳到 “prompting”。
   - 第二轮（用户确认后）：status 才可为 “prompting”，展示完整 layout_plan 排版定稿方案。
1. 不强制用户补齐所有信息。即使主题、文案、活动信息、风格或排版缺失，也不能卡住流程。
2. 只有当你上一轮的回复已经是 “clarifying” 状态，且用户在当前轮次明确表达了确认、可以、没问题、就这样、ok 等肯定意图时，结构化 JSON 的 status 才可输出 “prompting”。用户首次消息中即使含有确认词，也必须先走 clarifying 阶段。
3. 如果用户没有确认，就继续整理当前已知信息，并可以温和提示缺失项；缺失项只作为提醒，不能作为进入下一步的硬性条件。
4. 比例和清晰度来自 session：aspect_ratio={aspect_ratio}，resolution={resolution}。不要追问这两项。
5. 真实文案智能提取与自主策划：必须深入理解用户意图，只提炼出用户真正希望印刷在海报上的文字内容（例如：主标题、副标题、口号slogan、活动时间、活动地点、优惠信息等 literal texts）。必须彻底过滤、剥离所有非印刷对话废话（如”帮我设计一张海报”、”文案是”、”风格想要极简”等字样） and 排版设计建议。若用户提供了多项待印刷文案，请使用分隔符 “ | “ 将它们精炼地拼接为一行，且每个部分去掉引导词保留核心印刷字。确保无任何冗余对话或设计指令混入文案中。注意：仅作为背景纹理、水印、装饰性底纹出现的文字（即使可读），不应纳入”真实文案”列表，它们属于视觉背景元素，由视觉描述统一处理，不在排版规划中为它们分配层级。
   {density_instructions}
   {copy_rules}
   【⚠️ 英文翻译与双语字幕规则】如果用户明确要求增加英文翻译/英文小字/双语字幕，或者你根据画面设计需要自主策划了英文翻译：
   - 你必须将对应的英文翻译也作为独立的印刷文案内容，放入 [[SECTION:poster_text]] 的“真实文案：”中，严禁仅将其作为设计说明写在排版规划中。
   - 英文翻译必须与其中文母句并列排列（用 “ | ” 分隔，中文母句在前，英文翻译在后，例如：“端午安康 | Dragon Boat Festival | 粽香盈夏，顺遂常伴 | Fragrant Zongzi Fills the Summer | POP | Brand Signature”），以便它们在第一阶段卡片中作为独立的文本字段展示，供用户确认、修改和编辑。
   - 在第二阶段的排版规划中，也必须为这些英文翻译段落分配独立的设计层级（如：作为小字副标题，弱对比度排版等）。
   【⚠️ 绝对最高优先级——文案变更指令逐字捕获规则】当用户消息包含明确的文案设置或更改指令（识别模式包括但不限于「文案更改为X」「文案是X」「将文案改为X」「把文案设置为X」「标题改为X」「文案改成X」「文案为X」「copy改为X」「把文案写成X」等），必须将指令后方的内容 X 原封不动、逐字逐符地捕获为真实文案，绝对禁止对 X 进行任何形式的过滤、截断、清洗、智能提炼或「去噪」处理。X 中的数字（如123123）、英文字母、标点符号、看似无意义的字符串，均属于用户明确指定的合法印刷文案，必须完整原样保留。错误示范：用户说「文案更改为端午安康123123」，严禁只输出「端午安康」；正确做法：真实文案必须完整输出「端午安康123123」。此规则优先级凌驾于所有其他提炼与过滤规则之上，任何情况下不得违反。
6. 【参考图标注规则】若用户已上传风格参考图或排版参考图：
   - **首段回复/对话开头**：你必须在第一轮回复（status: "clarifying"）的对话开头/首段引导语中，明确并简单地标注告知用户。例如：“已收到并结合您上传的风格参考图/排版参考图进行设计分析。”
   - **[[SECTION:visual]]（已知：）**：若有风格参考图，你必须在 “已知：” 这一行的开头加上 `[已上传风格参考图]`，接着简述提炼出的风格色彩、倾向；若无，则正常提炼。
   - **[[SECTION:layout_plan]]（全局布局）**：若有排版参考图，你必须在 “全局布局 | ” 描述的开头加上 `[已上传排版参考图]`，接着简析参考图的版式结构、对齐方式；若无，则正常描述。

二、回复阶段区分
根据用户本轮是否确认，你必须在两种回复模式之间进行严格的切换：

【第一阶段 — 信息确认整理（status: "clarifying"，用户还在沟通需求或补充信息时）】
你的任务是极其精确地对齐已知要素。回复要求如下：
1. [[SECTION:visual]]（主视觉风格）区：
   - 只能将用户目前给到的相关视觉设计风格信息归纳整理进去，”已知”中不要有任何增减、修剪，也不要进行英文大词的扩写或延伸。如果已上传风格参考图，必须在“已知：”开头标记 `[已上传风格参考图]`。
   - 【⚠️ 风格与主体场景防混淆规则】主体参考图（subject_reference_image）中识别出的物理背景、环境事物（如“户外草地”、“沙滩”、“室内”等背景）仅作为生成图像的主体背景参考，**绝对禁止**作为“已知视觉风格”归纳到“已知：”这一行中！若用户未指定视觉风格且未上传“风格参考图”，则“已知：”行必须输出为“已知：暂无”或“已知：未指定”，不能塞入主体物参考图的背景场景词。
   - 用户没给的信息一律列为”缺失”，保持克制。
   - 【风格推荐规则（必须输出）】在第一轮回复（status: "clarifying"）中，你必须始终在 [[SECTION:visual]] 区追加输出 4 个风格推荐选项，且必须在末尾 JSON 块中的 `stream_b.style_recommendations` 字段中同步输出对应的 4 个推荐方案的结构化数据（绝对不能为 null）。无论 style_reference_image 是否为 null，无论用户是否提供了具体的视觉风格描述，你都必须在 `已知：` 这一行正常整理并输出已有风格（无则写暂无），然后再输出 4 个风格推荐选项供用户选择或切换。
   - 【风格推荐输出格式】每条风格推荐独占一行，严格遵循格式：🎨 风格推荐：[序号]. [风格中文名] ([English Style Name]) / [一句话简短中文风格描述]。示例行：
     🎨 风格推荐：1. 极简日系 (Minimal Japanese) / 留白、中性色调与精准网格
     🎨 风格推荐：2. 酸性赛博 (Acid Cyberpunk) / 霓虹撞色、镭射渐变与金属质感
     🎨 风格推荐：3. 瑞士国际主义 (Swiss International) / 无衬线字体与几何色块分割
     🎨 风格推荐：4. 复古胶片 (Retro Film Grain) / 温暖颗粒感与褪色复古调
   - 风格推荐应该覆盖不同的审美方向，避免雷同。4个选项之间要有明显的风格差异（如：一个极简留白、一个色彩浓烈、一个科技未来、一个复古传统）。
2. [[SECTION:poster_text]]（印刷文案信息）区：
   - 必须且只允许输出单行“真实文案：[智能提炼或设计师自主撰写的海报印刷文字内容]”。
   - 必须彻底剥离非印刷对话与设计说明。如果是多段印刷文案，用 “ | ” 拼接为一行。
   - 严禁在此分区内输出多行，严禁将时间、地点等拆分为独立行（如“地点：xxx”），所有要印出的文字必须且只能写在单行“真实文案：”中。
   - 严禁在此分区内夹杂任何排版、位置或大字小字等设计说明。
3. [[SECTION:layout_plan]]（排版设计规划）区：
   - 第一阶段必须输出一行"全局布局 | （整体构图逻辑与留白倾向描述，如：上重下稳纵向信息流 / 中心聚焦对称均衡 / 网格对齐现代杂志感等）"。如果已上传排版参考图，必须在描述开头标记 `[已上传排版参考图]`。如果用户没有提供任何具体的排版要求/排版描述且没有上传排版参考图，则全局布局行必须固定输出为“全局布局 | 暂无具体排版要求”，且在末尾结构化 JSON 中，`stream_a.layout_notes` 必须填入 “暂无具体排版要求”，`stream_a.layout_prompt` 必须填入 “not provided”。
   - 严禁在第一阶段输出具体文案排版行（如 - 夏日市集 | 顶部核心区...），所有具体文案排版规划留到第二阶段再展开。
   - 【排版推荐规则（必须输出）】在第一轮回复（status: "clarifying"）中，你必须始终在 [[SECTION:layout_plan]] 中输出 4 个排版推荐选项，且必须在末尾 JSON 块中的 `stream_a.layout_recommendations` 字段中同步输出对应的 4 个推荐方案的结构化数据（绝对不能为 null）。无论 layout_reference_image 是否为 null，无论用户是否提供了具体的排版设计描述，你都必须在第一行正常输出 `全局布局 | （构图与排版形态描述，或“暂无具体排版要求”）` 行，然后再输出 4 个排版推荐选项供用户选择或切换。四种排版推荐命名不可有视觉风格倾向，必须100%聚焦于空间结构与构图。
   - 【排版命名规范】排版推荐命名严禁包含“潮流”、“拼贴”、“市集”、“萌宠”等任何任何明显的视觉风格或主题倾向词，核心命名必须100%聚焦于空间结构、构图逻辑与版式形态本身。
   - 【排版推荐输出格式】每条排版推荐独占一行，严格遵循格式：📐 排版推荐：[序号]. [方案中文名] / [一句话中文排版描述]。示例行：
     📐 排版推荐：1. 中心对称均衡版式 / 视觉居中，上下对称排列
     📐 排版推荐：2. 非对称黄金分割版式 / 图文左右分割，错落层级
     📐 排版推荐：3. 极简网格大留白版式 / 严格网格对齐与大负空间
     📐 排版推荐：4. 上下图文多栏版式 / 上部主视觉，下部多栏文本
4. [[SECTION:missing]] 区：正常展示缺失的需要用户对齐的信息。

【第二阶段 — 最终方案定稿（status: "prompting"，用户明确表示确认/开始生成时）】
用户已确认，这是最终的定稿方案，需要在一轮回复中展示完整的编译成果。回复要求如下：
1. [[SECTION:visual]]（主视觉风格）区：
   - “已知”中必须展示对最终英文生图提示词（stream_b.visual_description）的一句话极简中文摘要（可在括号中附带简短的英文核心词，如：未来感国潮跑鞋 (Cinematic cyber runners)），必须以中文为主体展示，确保核心的中国用户能完全看懂画面风格主旨，禁止只输出纯英文。
2. [[SECTION:poster_text]]（印刷文案信息）区：
   - 保持展示“真实文案：[智能提炼出的海报印刷文字内容]”。
3. [[SECTION:layout_plan]]（排版设计规划）区：
   - 在此阶段正式开启展示！你必须针对前面确定的每一段真实印刷文案（即刚刚提取的以 | 分开的每一小段文字）进行逐一且对齐的设计排版建议规划。每一段文案单独列为一行，必须严格遵循”- [文案原文] | [该段文案在海报中的字型、大小、色彩、位置排版设计规划]”的对齐格式进行输出。最后追加一行全局布局。例如：
     - 夏日市集 | 位于顶部核心区，采用加粗扁平无衬线艺术字，作为第一视觉焦点
     - 地点：pop大楼 | 位于底部左侧，采用中等无衬线细体，与时间对齐
     - 全局布局 | 上下留白均衡，构图呈现几何网格对齐，具备极佳的现代杂志感
   - 必须严格使用“- [文案] | [说明]”的竖线对齐格式输出，严禁输出大段杂乱的纯文本。
4. [[SECTION:specs]] 与 [[SECTION:missing]] 正常输出，其中 missing 统一写“可直接进入绘制”。

三、回复展示规则
每次回复必须严格使用下面的分区标记，禁止自创标签，且在不同阶段严格控制 layout_plan 的隐藏与显示：

[[SECTION:visual]]
已知：（主视觉一句话描述）
缺失：（缺少什么，如无则写"暂无"）
[[/SECTION]]

[[SECTION:poster_text]]
真实文案：（智能提取的用户希望印刷在海报上的文案，过滤对话与说明，多项以“ | ”拼接为一行）
[[/SECTION]]

[[SECTION:layout_plan]]
- （第一段印刷文案原文） | （字形、字号、色彩、位置排版规划，第一层级）
- （第二段印刷文案原文） | （层级、位置与排版规划，第二层级）
- 全局布局 | （构图大留白、负空间与整体平衡设计逻辑）
[[/SECTION]]

[[SECTION:specs]]
比例: {aspect_ratio}（用户可在界面中选择 1:1 / 16:9 / 9:16 / A4 / Banner / A4_Horizontal）
清晰度: {resolution}（用户可在界面中选择 2K / 4K）
[[/SECTION]]

[[SECTION:missing]]
（缺失项，一条一行；无缺失则写"可直接进入绘制"）
[[/SECTION]]

四、参考图角色
- style_reference_image：只用于视觉风格、色彩、氛围、光影分析
- layout_reference_image：只用于版式结构、文字层级、留白、对齐分析
- subject_reference_image：只用于主体物、产品、人物识别。如果该图片是由当前海报底图加上红色画笔线条、红圈或红色标注箭头合成的，这代表用户正在进行“海报圈画修改”。你必须将红色标注区域识别为用户的编辑修改范围定位。在为 apimart 生图模型生成 revised_prompt 时，务必将用户的修改意图应用在红色标记对应的区域，并在提示词中要求模型抹除所有红色标记线条本身，输出一张干净修改后的海报，同时保留未画圈区域的所有原有设计细节与布局。
不要混淆三种图片用途。

五、视觉描述要求（stream_b.visual_description）
当用户提供了风格参考图时，visual_description 必须包含以下所有维度的精确描述，禁止笼统带过：
1. 色彩方案：列出主色、辅色、点缀色的具体描述（如 warm amber gold / muted sage green / deep charcoal black），必须精确到具体颜色名称
2. 色调倾向：冷色调 / 暖色调 / 中性色调，并说明明度（高调/中调/低调）
3. 光影风格：具体光线方向 and 质感（如 soft diffused overhead light / dramatic side rim lighting / golden hour backlight）
4. 材质质感：主要表面质感（如 matte frosted glass / brushed metal / grainy paper / glossy acrylic）
5. 审美流派 and 氛围：明确标注风格流派名称 and 情绪氛围（如 Swiss International minimalist editorial / acid graphics cyberpunk / wabi-sabi organic texture）
6. 空间与构图倾向：负空间密度、元素密度、对称性

如果参考图缺失，按原有规则标注 not provided，禁止编造。以上维度无论参考图有无，在 visual_description 中未涉及的维度一律标注 not provided。

六、结构化输出（两个阶段使用不同 JSON 模板，必须区分）

【第一阶段 clarifying 的 JSON 模板（必须含推荐字段）】：
[JSON_START]{{"status":"clarifying","stream_a":{{"copy":"单行海报印刷文案","layout_notes":"排版说明","layout_prompt":"英文排版提示词或not provided","layout_recommendations":[{{"index":1,"name":"方案名","layout_notes":"完整中文排版说明"}}]}},"stream_b":{{"visual_description":"英文主视觉提示词或not provided","denoising_strength":0.5,"style_recommendations":[{{"index":1,"name":"风格名","name_en":"English","description":"简短描述","visual_description":"完整英文视觉提示词"}}]}}}}[JSON_END]

【第二阶段 prompting 的 JSON 模板（严禁输出 style_recommendations 和 layout_recommendations）】：
[JSON_START]{{"status":"prompting","stream_a":{{"copy":"单行海报印刷文案","layout_notes":"完整排版规划（含各段文案层级位置）","layout_prompt":"完整英文排版提示词"}},"stream_b":{{"visual_description":"完整英文主视觉提示词","denoising_strength":0.5}}}}[JSON_END]

只有在上一轮 AI 回复为 clarifying 且用户确认时，才输出 status="prompting"。首次回复必须是 clarifying。"""

# ─────────────────────────────── LLM 调用 ────────────────────────────────────

async def stream_chat(
    *,
    aspect_ratio: str,
    resolution: str,
    clarify_messages: list[dict],
    user_input: str,
    has_prior_assistant_reply: bool,
    style_image_path: Path | None = None,
    layout_image_path: Path | None = None,
    subject_image_path: Path | None = None,
    include_reference_images: bool = True,
    stream_a: dict | None = None,
    stream_b: dict | None = None,
    is_refresh_styles: bool = False,
    is_refresh_layouts: bool = False,
    status: str = "init",
) -> AsyncIterator[tuple[str, dict | None]]:
    """
    流式调用 LLM，yield (chunk_text, structured_data_or_None)。
    最后一次 yield 时 structured_data 为从 [JSON_START]...[JSON_END] 解析 of dict。

    移植自 prd real.ts createRealChatStream。
    """
    settings = get_settings()

    # 构建 vision blocks
    user_content: list[dict] = []
    if style_image_path and include_reference_images:
        url = _file_to_base64_data_url(style_image_path)
        if url:
            user_content.append({
                "type": "text",
                "text": "【上传的风格参考图，仅用作分析整体色彩氛围、流派质感，切勿当作版式构图或主体物参考】：",
            })
            user_content.append({"type": "image_url", "image_url": {"url": url}})
    if layout_image_path and include_reference_images:
        url = _file_to_base64_data_url(layout_image_path)
        if url:
            user_content.append({
                "type": "text",
                "text": "【上传的排版参考图，仅用作分析构图网格、层级与留白，切勿当作视觉色彩或主体物参考】：",
            })
            user_content.append({"type": "image_url", "image_url": {"url": url}})
    if subject_image_path and include_reference_images:
        url = _file_to_base64_data_url(subject_image_path)
        if url:
            user_content.append({
                "type": "text",
                "text": "【上传的主体物/物料参考图，生图时的主要图形、商品、人物或Logo轮廓依此为准】：",
            })
            user_content.append({"type": "image_url", "image_url": {"url": url}})

    user_content.append({"type": "text", "text": user_input})

    # 构造完整 messages
    # 为了避免多次对话后 token 爆炸并防止混淆，只保留最近数轮 clarify 对话记录，并限制最大字数
    history = _compact_history(clarify_messages)
    messages = []
    
    # 增加参考图存在性参数传递
    has_style_ref = style_image_path is not None
    has_layout_ref = layout_image_path is not None
    pdf_text = stream_a.get("pdf_document_text") if stream_a else None
    density = stream_a.get("density", "中") if stream_a else "中"

    # 提取已有的风格名称
    existing_style_names = []
    if stream_b and "style_recommendations" in stream_b:
        recs = stream_b["style_recommendations"]
        if isinstance(recs, list):
            for r in recs:
                if isinstance(r, dict) and "name" in r:
                    existing_style_names.append(r["name"])

    # 提取已有的排版名称
    existing_layout_names = []
    if stream_a and "layout_recommendations" in stream_a:
        recs = stream_a["layout_recommendations"]
        if isinstance(recs, list):
            for r in recs:
                if isinstance(r, dict) and "name" in r:
                    existing_layout_names.append(r["name"])
    
    poster_strategy = stream_a.get("poster_strategy") if stream_a else None
    confirmed_copy = stream_a.get("copy") if stream_a else None

    messages.append({
        "role": "system",
        "content": build_system_prompt(
            aspect_ratio,
            resolution,
            has_style_ref=has_style_ref,
            has_layout_ref=has_layout_ref,
            pdf_text=pdf_text,
            density=density,
            is_refresh_styles=is_refresh_styles,
            is_refresh_layouts=is_refresh_layouts,
            existing_style_names=existing_style_names,
            existing_layout_names=existing_layout_names,
            poster_strategy=poster_strategy,
            confirmed_copy=confirmed_copy,
            status=status,
        ),
    })

    # 注入当前 session 的参数快照作为上下文，帮助模型对齐前次选择与已同步数据
    if stream_a or stream_b:
        snapshot_data = {
            "stream_a": {k: v for k, v in (stream_a or {}).items() if k not in ["layout_recommendations", "layout_prompt", "pdf_document_text"]},
            "stream_b": {k: v for k, v in (stream_b or {}).items() if k not in ["style_recommendations", "visual_description"]},
        }
        messages.append({
            "role": "system",
            "content": f"【当前已对齐的海报配置快照】：\n{json.dumps(snapshot_data, ensure_ascii=False)}",
        })

    for msg in history:
        messages.append({"role": msg["role"], "content": msg["content"]})

    messages.append({"role": "user", "content": user_content})

    headers = {}
    if settings.effective_agent_llm_key:
        headers["Authorization"] = f"Bearer {settings.effective_agent_llm_key}"

    payload = {
        "model": settings.agent_llm_model,
        "messages": messages,
        "temperature": 0.8 if (is_refresh_styles or is_refresh_layouts) else 0.4,  # 刷新时提高发散度，常规信息确认阶段要求高稳定性
        "stream": True,
    }

    url = f"{settings.agent_llm_base.rstrip('/')}/chat/completions"
    logger.info("llm_stream_request url=%s model=%s payload_messages_count=%d", url, settings.agent_llm_model, len(messages))

    full_text = ""
    async with httpx.AsyncClient(timeout=180.0) as client:
        async with client.stream("POST", url, headers=headers, json=payload) as response:
            if response.status_code != 200:
                err_text = await response.aread()
                logger.error("llm_stream_failed status=%d response=%s", response.status_code, err_text.decode(errors="ignore"))
                raise RuntimeError(f"LLM API returned status {response.status_code}: {err_text.decode(errors='ignore')}")

            async for line in response.aiter_lines():
                if not line.strip():
                    continue
                if line.startswith("data: "):
                    data_str = line[6:]
                    if data_str.strip() == "[DONE]":
                        break
                    try:
                        chunk_json = json.loads(data_str)
                        choices = chunk_json.get("choices")
                        if choices:
                            delta = choices[0].get("delta", {})
                            if "content" in delta:
                                chunk_text = delta["content"]
                                full_text += chunk_text
                                yield chunk_text, None
                    except Exception as e:
                        logger.warning("llm_chunk_parse_error line=%s err=%s", line, e)

    # 提取 JSON 块
    structured_data = None
    if "[JSON_START]" in full_text and "[JSON_END]" in full_text:
        try:
            start_idx = full_text.index("[JSON_START]") + len("[JSON_START]")
            end_idx = full_text.index("[JSON_END]")
            json_str = full_text[start_idx:end_idx].strip()
            structured_data = json.loads(json_str)
            logger.info("llm_json_parsed status=%s", structured_data.get("status"))
        except Exception as e:
            logger.error("llm_json_extract_failed err=%s text_snippet=%s", e, full_text[-300:])

    yield full_text, structured_data




async def refresh_copy_text(
    *,
    density: str,  # "疏" | "中" | "密"
    current_copy: str,
    aspect_ratio: str,
    selected_style_name: str | None = None,
    selected_style_desc: str | None = None,
    initial_user_prompt: str | None = None,
    poster_strategy: dict | None = None,
) -> str:
    """
    根据指定的密度标准（疏、中、密）对整个文案内容进行重写/改写。
    重写后的文案仍需符合海报风格和比例需求，并以 " | " 拼接为单行返回。
    """
    system_prompt = (
        "你是一个极其专业的广告文案创意总监与平面设计专家。\n"
        "你的任务是根据指定的文案密度标准（“疏”/“中”/“密”）、海报的视觉风格调性、尺寸比例以及初始用户需求，"
        "对海报当前的全部印刷文案进行整体密度的重新调整与刷新，输出符合指定密度标准的全新印刷文案组合，严禁只进行细微的字词润色。\n\n"
        "【⚠️ 密度刷新核心指令（禁止字词润色）】\n"
        "本次操作不是对文案进行微调或局部润色，而是为了在画面上实现符合「疏/中/密」的排版密度效果，而进行的【整体文案架构重建】。\n"
        "你必须对文案的数量、层级和信息量进行整体的扩展、重组与刷新。不得退化为针对单一词汇或局部的字词润色/优化。例如：如果原本有2个文本字段，密度刷新为「密」时，应增加为4个以上具有高信息量且与风格和策略非常契合的文本字段。\n\n"
        "【策略定位结合（核心）】：\n"
        "如果提供了海报的策略定位（应用场景与核心作用），你重写后的整个文案也必须以此为导向。例如：促销场景应强调行动转化与福利；品牌种草应有生活质感和品质；节日问候应有温情感与文化共鸣。\n\n"
        "【文案密度设定规则（必须严格遵守）】：\n"
        "1. 疏 (Sparse)：\n"
        "   - 追求极简、呼吸感与大面积留白。主标题控制在 4-6 字内，副标题或 slogan 极简（5-8字）。\n"
        "   - 尽量减少辅助信息与板块。如果是 9:32 详情页，仅保留 1-2 个最核心的板块，字符极其克制，防止画面臃肿。\n"
        "2. 中 (Medium)：\n"
        "   - 标准厚度的文案。普通海报保持 2-3 层常规文案；9:32 详情页保持 3-4 个正常板块结构。\n"
        "3. 密 (Dense)：\n"
        "   - 字数饱满、内容详实、极高信息量。\n"
        "   - 如果是普通海报，额外增加行动号召、参数、背书等辅助小字（增加 1-2 层内容）；如果是 9:32 详情页，必须写满 4 个完整的板块，包含主副标题、多项并列亮点拆解（每项亮点展开多字描述）、场景价值、品牌及福利行动指南。\n\n"
        "【文案重写输出要求】：\n"
        "1. 风格契合：文案语境、调性必须与海报当前的视觉风格（如极简日系、酸性赛博、国潮复古等）绝对契合。\n"
        "2. 格式规范：输入的原有文案中可能包含多个字段，各部分通过 “ | ” 分隔。你的重写结果也必须使用 “ | ” 拼接成单行纯文本输出，以便排版系统识别。\n"
        "3. 泛需求/少文案下的设计师自主扩写与写词规则：如果输入的印刷文案较少（层级和字数不足以直接支撑目标密度，特别是“密”密度），你必须作为创意总监与设计师，主动基于海报主题（如端午节）和视觉风格自主策划、生成并补充所需的文案层级（如品牌 Slogan、亮点亮点拆解、行动号召与福利小字等），确保输出饱满、完整的多段文案（多项用 “ | ” 拼接）。\n"
        "4. 纯净输出与禁止报错拒签：你只能且必须只输出重写/扩写后的文案本身，必须呈单行，严禁换行，严禁使用任何 Markdown 格式包裹（严禁使用 ``` 包裹）。绝对不能包含任何解释、废话，也绝对禁止返回任何报错、挑剔或拒绝信息（例如“文案未达要求”、“无法生成”等），必须无条件输出重写扩写成功后的纯印刷文案本身。"
    )

    strategy_context = ""
    if poster_strategy:
        strategy_context = (
            f"- 策略海报定位/场景: {poster_strategy.get('position') or '未指定'}\n"
            f"- 策略核心作用/目标: {poster_strategy.get('purpose') or '未指定'}\n"
        )

    user_prompt = (
        f"【上下文与输入数据】：\n"
        f"- 海报尺寸比例 (aspect_ratio): {aspect_ratio}\n"
        f"{strategy_context}"
        f"- 当前选定视觉风格: {selected_style_name or '默认风格'} ({selected_style_desc or '默认描述'})\n"
        f"- 初始用户需求: {initial_user_prompt or '未提供'}\n"
        f"- 当前印刷文案内容: {current_copy}\n"
        f"- 目标文案密度: 【{density}】\n\n"
        f"请仅输出符合【{density}】密度重写后的印刷文案，确保包含所有的印刷信息并用 “ | ” 分隔成单行（严禁换行，严禁多余的解释）："
    )

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt}
    ]

    settings = get_settings()
    headers = {}
    if settings.effective_agent_llm_key:
        headers["Authorization"] = f"Bearer {settings.effective_agent_llm_key}"

    payload = {
        "model": settings.agent_llm_model,
        "messages": messages,
        "temperature": 0.2,
        "stream": False,
    }

    url = f"{settings.agent_llm_base.rstrip('/')}/chat/completions"
    logger.info("llm_copy_refresh_request url=%s model=%s density=%s", url, settings.agent_llm_model, density)

    import asyncio
    max_retries = 3
    for attempt in range(max_retries):
        try:
            async with httpx.AsyncClient(timeout=180.0) as client:
                response = await client.post(url, headers=headers, json=payload)
                if response.status_code != 200:
                    err_text = await response.aread()
                    logger.error("llm_copy_refresh_failed status=%d response=%s", response.status_code, err_text.decode(errors="ignore"))
                    raise RuntimeError(f"LLM API returned status {response.status_code}: {err_text.decode(errors='ignore')}")
                
                res_json = response.json()
                refreshed = res_json["choices"][0]["message"]["content"].strip()
                
                # 1. 过滤可能误带的 Markdown 代码块
                if refreshed.startswith("```"):
                    lines = refreshed.split("\n")
                    if len(lines) >= 2:
                        refreshed = "\n".join(lines[1:-1]).strip()
                    else:
                        refreshed = refreshed.replace("```", "").strip()
                
                # 2. 清理可能误带的引号
                if (refreshed.startswith('"') and refreshed.endswith('"')) or (refreshed.startswith('“') and refreshed.endswith('”')):
                    refreshed = refreshed[1:-1].strip()
                    
                # 3. 强行将可能存在的换行合并，用 ' | ' 拼接，确保绝对是一单行文本
                if "\n" in refreshed:
                    refreshed = " | ".join([line.strip() for line in refreshed.split("\n") if line.strip()])
                    
                return refreshed
        except (httpx.ConnectError, httpx.ConnectTimeout) as conn_err:
            logger.warning("llm_copy_refresh connect failed (attempt %d/%d): %s", attempt + 1, max_retries, str(conn_err))
            if attempt == max_retries - 1:
                raise RuntimeError(f"网络连接大模型服务失败，已重试 {max_retries} 次: {str(conn_err)}")
            await asyncio.sleep(1.0)
        except Exception as other_err:
            logger.error("llm_copy_refresh unexpected error: %s", str(other_err))
            raise other_err


async def audit_user_intent(user_input: str, has_files: bool = False) -> dict:
    """
    审计用户初始输入。
    若信息丰富或已上传文件/有具体的文案/风格物料则放行并提取策略；若信息贫瘠则拦截并生成设计总监话术及 Quick Replies。
    """
    system_prompt = (
        "你是一个高水准的商业海报设计审计专家与视觉设计总监（Design Director）。你的任务是分析用户的初始海报设计需求，判断是否需要对用户进行前置策略问询。\n\n"
        "【核心策略因子】：\n"
        "1. 【海报定位/应用场景】（是什么海报，在哪里展示，例如：天猫详情页、微信朋友圈、线下门店展架、小红书种草等）。\n"
        "2. 【核心作用/目标】（用来干什么，商业目标是什么，例如：大促吸睛引流、节日情感问候、新品奢华发布、促销爆款转化等）。\n\n"
        "【审计放行与拦截判定规则】：\n"
        "- 放行（rich = true）：用户提供的信息已足够具体（具有较完善的设计物料或明确指示），不应通过追问打断用户。符合以下任意条件之一，即可判定为放行：\n"
        "  1. 用户已上传了参考图片或设计素材（上下文提示 `has_files = true`）。\n"
        "  2. 用户在初始输入中提供了较完善的素材或具体要求，例如：包含了具体的文案内容（如具体的标题、Slogan，或用 ` | ` 分隔的多段文案）；或者包含了明确的风格名称与风格偏好（如“酸性赛博风”、“极简日系风格”）；或者包含了具体的排版排布要求。\n"
        "  3. 用户的初始需求文本同时明确包含海报定位（在哪里用）与核心作用（用来干什么）。\n"
        "  * 例如：“做一张端午节海报，风格是极简日系风格，主标题写‘粽享丝滑’” -> 放行（包含明确的风格和文案）\n"
        "  * 例如：“设计一张天猫旗舰店端午大促引流横版Banner” -> 放行（包含明确的定位和作用）\n"
        "- 拦截（rich = false）：仅当用户没有上传任何参考素材（`has_files = false`），且初始需求非常模糊空泛（如仅输入“做个端午节海报”、“做一张猫粮的图”、“做一个新品推广图”），既没有包含明确的定位和作用，也没有包含任何文案、风格、排版细节时，才判定为拦截。\n\n"
        "【拦截话术与选项生成（当 rich = false 时）】：\n"
        "1. 以视觉设计总监语气生成一段专业前置追问话术（中文），语气专业、温和、拟人化且具有商业洞察力，委婉引导用户补充定位或核心作用。\n"
        "2. 生成 4 个轻量级快捷选择（Quick Replies）气泡选项，每个选项代表一种可能的“海报定位 + 核心作用”组合。例如输入为“端午节”，选项可以是：\n"
        "   - “端午大促引流电商 Banner”\n"
        "   - “微信朋友圈端午节日祝福海报”\n"
        "   - “线下门店端午活动促销展架”\n"
        "   - “微信公众号端午推送封面图”\n"
        "   (选项格式：字数精简，方便阅读一键勾选，不得超过 20 字)。\n\n"
        "请以 json 格式 (JSON) 输出结果，必须输出有效 json 格式，绝对不能包含任何 Markdown 标记或其它解释文本。输出格式如下：\n"
        "{\n"
        "  \"rich\": true 或 false,\n"
        "  \"reason\": \"拦截或放行的简短理由\",\n"
        "  \"position\": \"若 rich 为 true，从用户输入中提取或推断出的海报定位（若难以推断填 '默认海报'）；若 rich 为 false，填 null\",\n"
        "  \"purpose\": \"若 rich 为 true，从用户输入中提取或推断出的核心作用（若难以推断填 '视觉呈现'）；若 rich 为 false，填 null\",\n"
        "  \"question\": \"若 rich 为 false，视觉设计总监语气的前置追问话术；若 rich 为 true，填 null\",\n"
        "  \"quick_replies\": [\"选项1\", \"选项2\", \"选项3\", \"选项4\"] // 若 rich 为 true，填 null\n"
        "}"
    )

    user_prompt = (
        f"【上下文信息】：\n"
        f"- 用户是否已上传参考文件/素材 (has_files): {str(has_files).lower()}\n\n"
        f"请审计以下用户海报需求，并按 json 格式输出结果：\n"
        f"\"{user_input}\""
    )

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt}
    ]

    settings = get_settings()
    headers = {}
    if settings.effective_agent_llm_key:
        headers["Authorization"] = f"Bearer {settings.effective_agent_llm_key}"

    payload = {
        "model": settings.agent_llm_model,
        "messages": messages,
        "temperature": 0.2,
        "stream": False,
        "response_format": {"type": "json_object"}
    }

    url = f"{settings.agent_llm_base.rstrip('/')}/chat/completions"
    logger.info("llm_audit_user_intent_request url=%s model=%s input=%s has_files=%s", url, settings.agent_llm_model, user_input, has_files)

    async with httpx.AsyncClient(timeout=180.0) as client:
        response = await client.post(url, headers=headers, json=payload)
        if response.status_code != 200:
            err_text = await response.aread()
            logger.error("llm_audit_failed status=%d response=%s", response.status_code, err_text.decode(errors="ignore"))
            raise RuntimeError(f"LLM API returned status {response.status_code}: {err_text.decode(errors='ignore')}")
        
        res_json = response.json()
        content = res_json["choices"][0]["message"]["content"].strip()
        
        try:
            return json.loads(content)
        except Exception:
            import re
            match = re.search(r"(\{.*\})", content, re.DOTALL)
            if match:
                return json.loads(match.group(1))
            raise ValueError(f"Failed to parse JSON from auditor response: {content}")


async def extract_strategy_from_reply(user_message: str, history_context: str) -> dict:
    """
    当处于 clarifying_strategy 状态时，用户对设计总监前置追问做出了回答（或点击了快捷气泡）。
    我们需要从其回复和之前的上下文中，提炼出 position 和 purpose 策略因子。
    """
    system_prompt = (
        "你是一个海报策略提取专家。你需要从用户对“海报定位与作用”的回复以及初始需求中，提炼出以下两个核心策略因子：\n"
        "1. 【海报定位/应用场景】（是什么海报，在哪里展示，例如：天猫主图、朋友圈海报、小红书种草长图、线下易拉宝等）。\n"
        "2. 【核心作用/目标】（用来干什么，例如：新品宣发、节日问候、大促吸睛引流、行动号召等）。\n\n"
        "请结合上下文，进行精准提炼，字数保持极其简练（均控制在 12 字以内）。\n"
        "请以 json 格式 (JSON) 输出结果，必须输出有效 json 格式，绝对不能包含任何其他文字或说明。输出格式如下：\n"
        "{\n"
        "  \"position\": \"提炼出的海报定位，若未提及则填 '默认海报'\",\n"
        "  \"purpose\": \"提炼出的核心作用，若未提及则填 '视觉呈现'\"\n"
        "}"
    )

    user_prompt = (
        f"【上下文与输入数据】\n"
        f"- 初始需求与对话背景: {history_context}\n"
        f"- 用户当前回复: {user_message}\n\n"
        f"请按 json 格式提取定位与作用："
    )

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt}
    ]

    settings = get_settings()
    headers = {}
    if settings.effective_agent_llm_key:
        headers["Authorization"] = f"Bearer {settings.effective_agent_llm_key}"

    payload = {
        "model": settings.agent_llm_model,
        "messages": messages,
        "temperature": 0.2,
        "stream": False,
        "response_format": {"type": "json_object"}
    }

    url = f"{settings.agent_llm_base.rstrip('/')}/chat/completions"
    logger.info("llm_extract_strategy_request url=%s model=%s message=%s", url, settings.agent_llm_model, user_message)

    async with httpx.AsyncClient(timeout=180.0) as client:
        response = await client.post(url, headers=headers, json=payload)
        if response.status_code != 200:
            err_text = await response.aread()
            logger.error("llm_extract_failed status=%d response=%s", response.status_code, err_text.decode(errors="ignore"))
            raise RuntimeError(f"LLM API returned status {response.status_code}: {err_text.decode(errors='ignore')}")
        
        res_json = response.json()
        content = res_json["choices"][0]["message"]["content"].strip()
        
        try:
            return json.loads(content)
        except Exception:
            import re
            match = re.search(r"(\{.*\})", content, re.DOTALL)
            if match:
                return json.loads(match.group(1))
            raise ValueError(f"Failed to parse JSON from extractor response: {content}")


async def rewrite_prompt_for_edit(
    current_prompt: str,
    edit_description: str,
    subject_image_base64: str | None = None,
) -> str:
    """
    根据用户的修改描述和合并后的标注图（base64），重写当前的生图提示词。
    """
    system_prompt = (
        "You are a professional AI poster design prompt engineer.\n"
        "Your task is to modify an existing image generation prompt based on the user's edit description "
        "and their red pen markings (which indicate the area to modify).\n"
        "You must output ONLY the complete new English prompt for the image generator. "
        "Do not output any introductory or conversational text, markdown formatting blocks, or JSON. Just the raw text prompt."
    )
    
    user_content = [
        {
            "type": "text",
            "text": (
                f"Original Prompt:\n{current_prompt}\n\n"
                f"User's Edit Description:\n{edit_description}\n\n"
                "Please rewrite the Visual Scene Design portion of the prompt to apply the user's edit description. "
                "The user has uploaded the original poster overlaid with red pen circles/arrows/drawings marking the region to edit. "
                "Make sure to apply the modification specifically to the marked areas, describe it clearly, "
                "and instruct the generator to wipe out/remove the red marks themselves from the final output image."
            )
        }
    ]
    
    if subject_image_base64:
        user_content.append({
            "type": "image_url",
            "image_url": {"url": subject_image_base64}
        })
        
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_content}
    ]
    
    settings = get_settings()
    headers = {}
    if settings.effective_agent_llm_key:
        headers["Authorization"] = f"Bearer {settings.effective_agent_llm_key}"
        
    payload = {
        "model": settings.agent_llm_model,
        "messages": messages,
        "temperature": 0.3,
        "stream": False,
    }
    
    url = f"{settings.agent_llm_base.rstrip('/')}/chat/completions"
    logger.info("llm_rewrite_prompt_for_edit url=%s model=%s description=%s", url, settings.agent_llm_model, edit_description)
    
    async with httpx.AsyncClient(timeout=180.0) as client:
        response = await client.post(url, headers=headers, json=payload)
        if response.status_code != 200:
            err_text = await response.aread()
            logger.error("llm_rewrite_failed status=%d response=%s", response.status_code, err_text.decode(errors="ignore"))
            raise RuntimeError(f"LLM API returned status {response.status_code}: {err_text.decode(errors='ignore')}")
            
        res_json = response.json()
        new_prompt = res_json["choices"][0]["message"]["content"].strip()
        if new_prompt.startswith("```"):
            new_prompt = "\n".join(new_prompt.split("\n")[1:])
            if new_prompt.endswith("```"):
                new_prompt = new_prompt[:-3]
        return new_prompt.strip()


