"""agent/skill_runner.py

状态机编排：init → clarifying → prompting → generating → review → done | failed

移植自 prd 的 session 状态机逻辑，用 Python 重写，集成 PosterForge 基础设施。
"""
from __future__ import annotations

import json
import logging
import re
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, AsyncIterator

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.agent.prompt_compiler import build_final_prompt, NEGATIVE_PROMPT
from app.config import get_settings
from app.db import SessionLocal
from app.models import AgentSession, File, Generation, User

logger = logging.getLogger("posterforge.agent.runner")

_VALID_STATUSES = {"init", "clarifying_strategy", "clarifying", "prompting", "generating", "review", "done", "failed"}
_FILE_URL_RE = re.compile(r"^/api/files/([a-f0-9-]{8,64})$", re.IGNORECASE)


# ───────────────────── session 序列化/反序列化辅助 ──────────────────────────

def _load_json(raw: str | None, default: Any = None) -> Any:
    if not raw:
        return default
    try:
        return json.loads(raw)
    except Exception:
        return default


# 公开别名，供 router 的 _to_out 使用
load_json = _load_json


def _dump_json(obj: Any) -> str | None:
    if obj is None:
        return None
    return json.dumps(obj, ensure_ascii=False)


def _extract_file_id_from_url(url: str | None) -> str | None:
    if not url or not isinstance(url, str):
        return None
    match = _FILE_URL_RE.match(url.strip())
    return match.group(1) if match else None


async def _resolve_session_reference_file(
    url: str | None,
    *,
    user_id: str,
    db: AsyncSession,
) -> File | None:
    file_id = _extract_file_id_from_url(url)
    if not file_id:
        return None
    row = (
        await db.execute(select(File).where(File.id == file_id))
    ).scalar_one_or_none()
    if row is None or row.user_id != user_id or row.deleted_at is not None:
        return None
    return row


async def collect_subject_reference_file_ids(
    s: AgentSession,
    *,
    db: AsyncSession,
) -> list[str]:
    return await collect_material_reference_file_ids(s, include_types={"subject"}, db=db)


async def collect_material_reference_file_ids(
    s: AgentSession,
    *,
    include_types: set[str],
    db: AsyncSession,
) -> list[str]:
    stream_b = _load_json(s.stream_b, {}) or {}
    ordered_urls: list[str | None] = []

    primary_type = stream_b.get("subject_reference_image_type") or "subject"
    if primary_type in include_types:
        ordered_urls.append(stream_b.get("subject_reference_image"))

    for material in stream_b.get("subject_materials") or []:
        material_type = "subject"
        if isinstance(material, dict):
            material_type = material.get("type") or "subject"
        if isinstance(material, dict) and material_type in include_types:
            ordered_urls.append(material.get("url"))

    seen: set[str] = set()
    file_ids: list[str] = []
    for url in ordered_urls:
        file_id = _extract_file_id_from_url(url)
        if not file_id or file_id in seen:
            continue
        row = (
            await db.execute(select(File).where(File.id == file_id))
        ).scalar_one_or_none()
        if row is None or row.user_id != s.user_id or row.deleted_at is not None:
            continue
        seen.add(file_id)
        file_ids.append(file_id)
    return file_ids[:5]


async def collect_generation_reference_file_ids(
    s: AgentSession,
    *,
    db: AsyncSession,
) -> list[str]:
    # 主体物和“其他素材”都进入模型参考图链路，并触发图生图语义。
    # Logo 素材不参与这一层分流，它只走独立的前端/导出叠加层。
    return await collect_material_reference_file_ids(
        s,
        include_types={"subject", "other"},
        db=db,
    )


async def collect_regeneration_reference_file_ids(
    s: AgentSession,
    *,
    db: AsyncSession,
) -> list[str]:
    file_ids: list[str] = []
    seen: set[str] = set()

    for file_id in await collect_generation_reference_file_ids(s, db=db):
        if file_id not in seen:
            seen.add(file_id)
            file_ids.append(file_id)

    # Regeneration should still remember the last approved poster look, but
    # the original uploaded subject/material references stay ahead of it.
    if s.generation_id:
        gen_row = (
            await db.execute(select(Generation).where(Generation.id == s.generation_id))
        ).scalar_one_or_none()
        if gen_row and gen_row.output_file_ids:
            output_ids = _load_json(gen_row.output_file_ids, [])
            if output_ids:
                previous_output_id = output_ids[0]
                if previous_output_id not in seen:
                    seen.add(previous_output_id)
                    file_ids.append(previous_output_id)

    return file_ids[:5]


def resolve_generation_action(reference_file_ids: list[str]) -> str:
    # 只要存在主体物或其他素材参考图，就显式走 edit/img2img 流程；
    # 没有参考图时，才回退为普通文生图 generate。
    return "edit" if reference_file_ids else "generate"


async def collect_extend_reference_file_ids(
    s: AgentSession,
    *,
    base_image_url: str | None = None,
    db: AsyncSession,
) -> list[str]:
    file_ids: list[str] = []
    seen: set[str] = set()

    explicit_base_file_id = _extract_file_id_from_url(base_image_url)
    if explicit_base_file_id:
        row = (
            await db.execute(select(File).where(File.id == explicit_base_file_id))
        ).scalar_one_or_none()
        if row is not None and row.user_id == s.user_id and row.deleted_at is None:
            seen.add(explicit_base_file_id)
            file_ids.append(explicit_base_file_id)

    if not file_ids and s.generation_id:
        gen_row = (
            await db.execute(select(Generation).where(Generation.id == s.generation_id))
        ).scalar_one_or_none()
        if gen_row and gen_row.output_file_ids:
            output_ids = _load_json(gen_row.output_file_ids, [])
            if output_ids:
                primary_output_id = output_ids[0]
                if primary_output_id not in seen:
                    seen.add(primary_output_id)
                    file_ids.append(primary_output_id)

    for file_id in await collect_generation_reference_file_ids(s, db=db):
        if file_id not in seen:
            seen.add(file_id)
            file_ids.append(file_id)

    return file_ids[:5]


def session_to_dict(s: AgentSession) -> dict:
    """AgentSession ORM 对象 → 前端可用的 dict（对应 AgentSessionOut schema）。"""
    return {
        "id": s.id,
        "user_id": s.user_id,
        "status": s.status,
        "aspect_ratio": s.aspect_ratio,
        "resolution": s.resolution,
        "clarify_messages": _load_json(s.clarify_messages, []),
        "stream_a": _load_json(s.stream_a),
        "stream_b": _load_json(s.stream_b),
        "final_prompt": s.final_prompt,
        "generation_id": s.generation_id,
        "primary_ratio": s.primary_ratio,
        "primary_resolution": s.primary_resolution,
        "extended_images": _load_json(s.extended_images, []),
        "archived_images": _load_json(s.archived_images, []),
        "error_message": s.error_message,
        "design_json": _load_json(s.design_json),
        "created_at": s.created_at.isoformat() if s.created_at else None,
        "updated_at": s.updated_at.isoformat() if s.updated_at else None,
    }


# ──────────────────────────── 核心状态机操作 ──────────────────────────────────

async def archive_current_images(s: AgentSession, db: AsyncSession) -> None:
    """归档当前生成的图像和延伸图至 archived_images 版本组列表。"""
    if not s.generation_id:
        return

    # 获取主视觉原图 URL
    primary_url = None
    gen_row = (
        await db.execute(select(Generation).where(Generation.id == s.generation_id))
    ).scalar_one_or_none()
    if gen_row and gen_row.output_file_ids:
        output_ids = _load_json(gen_row.output_file_ids, [])
        if output_ids:
            primary_url = f"/api/files/{output_ids[0]}"

    if not primary_url:
        return

    archived = _load_json(s.archived_images, [])
    # 避免重复归档同一个 generation_id/batch_id
    for item in archived:
        if isinstance(item, dict) and item.get("batch_id") == s.generation_id:
            return

    archived_at = datetime.now(timezone.utc).isoformat()
    stream_a = _load_json(s.stream_a, {})
    stream_b = _load_json(s.stream_b, {})

    # 构建主图 ExtendedImage 对象
    primary_img_obj = {
        "id": f"archived-primary-{s.generation_id}",
        "ratio": s.primary_ratio or s.aspect_ratio or "1:1",
        "resolution": s.primary_resolution or s.resolution or "1k",
        "generation_id": s.generation_id,
        "url": primary_url,
        "source": "primary",
        "archived_at": archived_at,
        "status": "completed",
        "progress": 100,
        "error_message": None
    }

    # 当前延伸图列表
    extended_list = _load_json(s.extended_images, [])
    archived_extended = []
    for idx, img in enumerate(extended_list):
        url = img.get("url")
        archived_extended.append({
            "id": img.get("id") or f"archived-extended-{s.generation_id}-{idx}",
            "ratio": img.get("ratio"),
            "generation_id": img.get("generation_id"),
            "url": url,
            "resolution": img.get("resolution") or "1k",
            "source": "extended",
            "archived_at": archived_at,
            "status": img.get("status") or "completed",
            "progress": img.get("progress") or 100,
            "error_message": img.get("error_message")
        })

    # 核心策略描述
    core_strategy = stream_b.get("visual_description") or ""
    if core_strategy:
        core_strategy = core_strategy.split("\n")[0][:45]
        if len(stream_b.get("visual_description") or "") > 45:
            core_strategy += "..."

    # 文案大纲
    text_outline = stream_a.get("copy") or stream_a.get("layout_notes") or ""
    if text_outline:
        text_outline = text_outline.split("\n")[0][:45]
        if len(stream_a.get("copy") or stream_a.get("layout_notes") or "") > 45:
            text_outline += "..."

    new_group = {
        "batch_id": s.generation_id,
        "created_at": archived_at,
        "core_strategy": core_strategy or "默认视觉风格",
        "text_outline": text_outline or "默认排版文案",
        "primary_image": primary_img_obj,
        "extended_images": archived_extended
    }

    archived.insert(0, new_group)
    s.archived_images = _dump_json(archived)


async def create_session(*, user: User, db: AsyncSession) -> AgentSession:
    """创建新的 Agent 会话（status=init）。"""
    s = AgentSession(user_id=user.id)
    db.add(s)
    await db.commit()
    await db.refresh(s)
    logger.info("agent_session created id=%s user=%s", s.id, user.work_id)
    return s


async def _sync_extend_result(
    *,
    session_id: str,
    generation_id: str,
) -> None:
    from app.jobs import run_generation_job

    await run_generation_job(generation_id)

    async with SessionLocal() as db:
        s = (
            await db.execute(select(AgentSession).where(AgentSession.id == session_id))
        ).scalar_one_or_none()
        gen = (
            await db.execute(select(Generation).where(Generation.id == generation_id))
        ).scalar_one_or_none()
        if s is None or gen is None:
            return

        extended = _load_json(s.extended_images, [])
        archived = _load_json(s.archived_images, [])
        updated_at = datetime.now(timezone.utc).isoformat()
        found = False

        # 1. 查找当前活跃的延伸图列表
        for item in extended:
            if item.get("generation_id") != generation_id:
                continue
            item["status"] = gen.status
            item["updated_at"] = updated_at
            item["progress"] = 100
            if gen.status == "completed":
                output_ids = _load_json(gen.output_file_ids, [])
                if output_ids:
                    item["url"] = f"/api/files/{output_ids[0]}"
                item["error_message"] = None
            else:
                item["error_message"] = gen.error_message or gen.error_code
            found = True
            break

        # 2. 查找历史版本分组中的延伸图列表
        if not found:
            for g in archived:
                if not isinstance(g, dict):
                    continue
                group_extended = g.get("extended_images", [])
                for item in group_extended:
                    if item.get("generation_id") != generation_id:
                        continue
                    item["status"] = gen.status
                    item["updated_at"] = updated_at
                    item["progress"] = 100
                    if gen.status == "completed":
                        output_ids = _load_json(gen.output_file_ids, [])
                        if output_ids:
                            item["url"] = f"/api/files/{output_ids[0]}"
                        item["error_message"] = None
                    else:
                        item["error_message"] = gen.error_message or gen.error_code
                    found = True
                    break
                if found:
                    break

        s.extended_images = _dump_json(extended)
        s.archived_images = _dump_json(archived)
        s.updated_at = datetime.now(timezone.utc)
        await db.commit()


async def sync_session_status(s: AgentSession, db: AsyncSession) -> None:
    """如果会话状态为 generating，且有关联的 generation，同步其最新状态。"""
    if s.status == "generating" and s.generation_id:
        gen = (
            await db.execute(select(Generation).where(Generation.id == s.generation_id))
        ).scalar_one_or_none()
        if gen:
            if gen.status == "completed":
                s.status = "review"
                s.updated_at = datetime.now(timezone.utc)
                await db.commit()
            elif gen.status == "failed":
                s.status = "failed"
                s.error_message = gen.error_message or "生成失败，请重试"
                s.updated_at = datetime.now(timezone.utc)
                await db.commit()


async def get_session(session_id: str, *, user: User, db: AsyncSession) -> AgentSession | None:
    """获取会话，校验归属。"""
    s = (
        await db.execute(select(AgentSession).where(AgentSession.id == session_id))
    ).scalar_one_or_none()
    if s is None or s.deleted_at is not None or s.user_id != user.id:
        return None
    await sync_session_status(s, db)
    return s


async def delete_session(session_id: str, *, user: User, db: AsyncSession) -> bool:
    """软删除会话。"""
    s = await get_session(session_id, user=user, db=db)
    if s is None:
        return False
    s.deleted_at = datetime.now(timezone.utc)
    await db.commit()
    return True


def prune_messages_on_rollback(messages: list[dict]) -> list[dict]:
    while len(messages) >= 2:
        last_msg = messages[-1]
        if last_msg.get("role") == "assistant":
            content = last_msg.get("content") or ""
            is_prompting = False
            if "[JSON_START]" in content and "[JSON_END]" in content:
                try:
                    start_idx = content.index("[JSON_START]") + len("[JSON_START]")
                    end_idx = content.index("[JSON_END]")
                    json_str = content[start_idx:end_idx].strip()
                    structured_data = json.loads(json_str)
                    if structured_data.get("status") == "prompting":
                        is_prompting = True
                except Exception:
                    pass
            if is_prompting:
                messages = messages[:-2]
                continue
        break
    return messages


async def update_session_params(
    s: AgentSession,
    *,
    status: str | None = None,
    aspect_ratio: str | None = None,
    resolution: str | None = None,
    stream_a: dict | None = None,
    stream_b: dict | None = None,
    extended_images: list[dict] | None = None,
    db: AsyncSession,
) -> None:
    """前端内联编辑后同步参数（对应 prd PATCH session 逻辑）。"""
    changed = False
    if status and status != s.status:
        s.status = status
        changed = True
        if status == "clarifying":
            messages = _load_json(s.clarify_messages, [])
            if messages:
                pruned = prune_messages_on_rollback(messages)
                if len(pruned) != len(messages):
                    s.clarify_messages = _dump_json(pruned)
    if aspect_ratio and aspect_ratio != s.aspect_ratio:
        s.aspect_ratio = aspect_ratio
        changed = True
    if resolution and resolution != s.resolution:
        s.resolution = resolution
        changed = True
    if stream_a is not None:
        existing = _load_json(s.stream_a, {})
        existing.update(stream_a)
        s.stream_a = _dump_json(existing)
        changed = True

        # Sync copy changes to s.clarify_messages history
        if "copy" in stream_a:
            new_copy = stream_a["copy"]
            new_copy_escaped = new_copy.replace("\n", "<br />").replace("\r", "")
            messages = _load_json(s.clarify_messages, [])
            if messages:
                import re
                pattern = r"(\[\[SECTION:poster_text\]\]\s*)(真实文案\s*[:：]\s*)(.*?)(\s*\[\[/SECTION\]\])"
                messages_changed = False
                for msg in messages:
                    if msg.get("role") == "assistant" and msg.get("content"):
                        old_content = msg["content"]
                        # Replace the copy inside the poster_text section
                        new_content = re.sub(pattern, f"\\1\\2{new_copy_escaped}\\4", old_content, flags=re.DOTALL)
                        if new_content != old_content:
                            msg["content"] = new_content
                            messages_changed = True
                if messages_changed:
                    s.clarify_messages = _dump_json(messages)

        # Sync layout_notes changes to s.clarify_messages history
        if "layout_notes" in stream_a:
            new_layout = stream_a["layout_notes"]
            new_layout_escaped = new_layout.replace("\n", "<br />").replace("\r", "")
            messages = _load_json(s.clarify_messages, [])
            if messages:
                import re
                messages_changed = False
                for msg in messages:
                    if msg.get("role") == "assistant" and msg.get("content"):
                        old_content = msg["content"]
                        sec_pattern = r"(\[\[SECTION:layout_plan\]\])([\s\S]*?)(\[\[/SECTION\]\])"
                        sec_match = re.search(sec_pattern, old_content)
                        if sec_match:
                            sec_content = sec_match.group(2)
                            known_pattern = r"(全局布局\s*[|｜]\s*)([^\n]*)"
                            if re.search(known_pattern, sec_content):
                                new_sec_content = re.sub(known_pattern, rf"\1{new_layout_escaped}", sec_content)
                            else:
                                if sec_content.startswith("\n"):
                                    new_sec_content = "\n全局布局 | " + new_layout_escaped + sec_content[1:]
                                else:
                                    new_sec_content = "全局布局 | " + new_layout_escaped + "\n" + sec_content
                            new_content = old_content.replace(sec_content, new_sec_content)
                            if new_content != old_content:
                                msg["content"] = new_content
                                messages_changed = True
                if messages_changed:
                    s.clarify_messages = _dump_json(messages)
    if stream_b is not None:
        existing = _load_json(s.stream_b, {})
        existing.update(stream_b)
        s.stream_b = _dump_json(existing)
        changed = True

        if "visual_description" in stream_b:
            new_vis = stream_b["visual_description"]
            new_vis_escaped = new_vis.replace("\n", "<br />").replace("\r", "")
            messages = _load_json(s.clarify_messages, [])
            if messages:
                import re
                messages_changed = False
                for msg in messages:
                    if msg.get("role") == "assistant" and msg.get("content"):
                        content = msg["content"]
                        sec_pattern = r"(\[\[SECTION:visual\]\])([\s\S]*?)(\[\[/SECTION\]\])"
                        sec_match = re.search(sec_pattern, content)
                        if sec_match:
                            sec_content = sec_match.group(2)
                            known_pattern = r"(已知\s*[:：]\s*)([^\n]*)"
                            if re.search(known_pattern, sec_content):
                                new_sec_content = re.sub(known_pattern, rf"\1{new_vis_escaped}", sec_content)
                            else:
                                if sec_content.startswith("\n"):
                                    new_sec_content = "\n已知：" + new_vis_escaped + sec_content[1:]
                                else:
                                    new_sec_content = "已知：" + new_vis_escaped + "\n" + sec_content
                            new_content = content.replace(sec_content, new_sec_content)
                            if new_content != content:
                                msg["content"] = new_content
                                messages_changed = True
                if messages_changed:
                    s.clarify_messages = _dump_json(messages)

    extended_changed = False
    if extended_images is not None:
        s.extended_images = _dump_json(extended_images)
        extended_changed = True

    if changed:
        # 参数变化时清除已生成的结果（与 prd archiveCurrentImages 逻辑对应）
        await archive_current_images(s, db)
        s.final_prompt = None
        s.generation_id = None
        s.primary_ratio = None
        s.primary_resolution = None
        if not extended_changed:
            s.extended_images = None
        await db.commit()
    elif extended_changed:
        await db.commit()


async def stream_clarify(
    s: AgentSession,
    *,
    user_message: str,
    style_file: File | None,
    layout_file: File | None,
    subject_file: File | None,
    db: AsyncSession,
    is_refresh_styles: bool = False,
    is_refresh_layouts: bool = False,
) -> AsyncIterator[bytes]:
    """
    流式对话：SSE 字节流。
    将 LLM chunk 实时 yield 给前端，完成后更新 session 状态。
    """
    import asyncio
    from app.agent.llm_client import stream_chat
    from app.config import get_settings
    settings = get_settings()

    messages: list[dict] = _load_json(s.clarify_messages, [])

    # 1. 状态拦截与处理
    if s.status == "init":
        from app.agent.llm_client import audit_user_intent
        
        # 检测是否包含已上传的参考文件或素材
        stream_b = _load_json(s.stream_b, {})
        stream_a = _load_json(s.stream_a, {})
        has_files = bool(
            style_file or layout_file or subject_file or
            stream_b.get("style_reference_image") or
            stream_b.get("layout_reference_image") or
            stream_b.get("subject_reference_image") or
            stream_b.get("reference_image") or
            stream_b.get("subject_materials") or
            stream_a.get("pdf_document_url")
        )

        # 审计用户输入并传入是否有文件的上下文
        audit_res = await audit_user_intent(user_message, has_files=has_files)
        
        if audit_res.get("rich", False):
            # 放行：提取定位与作用存入 stream_a
            stream_a = _load_json(s.stream_a, {})
            stream_a["poster_strategy"] = {
                "position": audit_res.get("position"),
                "purpose": audit_res.get("purpose")
            }
            s.stream_a = _dump_json(stream_a)
            # 正常放行，继续向下流式生成 Stage 1 卡片。状态变更为 clarifying
            s.status = "clarifying"
        else:
            # 拦截：进入 clarifying_strategy 状态并流式输出追问话术
            stream_a = _load_json(s.stream_a, {})
            stream_a["quick_replies"] = audit_res.get("quick_replies") or []
            s.stream_a = _dump_json(stream_a)
            s.status = "clarifying_strategy"
            
            # 追加用户消息与总监提问
            user_msg = {
                "id": f"msg-{uuid.uuid4().hex[:8]}-user",
                "role": "user",
                "content": user_message,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
            messages.append(user_msg)
            
            question_text = audit_res.get("question") or "请问您需要设计什么定位和核心作用的海报呢？"
            asst_msg = {
                "id": f"msg-{uuid.uuid4().hex[:8]}-assistant",
                "role": "assistant",
                "content": question_text,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
            messages.append(asst_msg)
            
            s.clarify_messages = _dump_json(messages)
            s.updated_at = datetime.now(timezone.utc)
            await db.commit()
            
            # 流式模拟打字机输出追问
            accumulated = ""
            chunk_size = 3
            for i in range(0, len(question_text), chunk_size):
                chunk = question_text[i:i+chunk_size]
                accumulated += chunk
                yield _sse({"chunk": chunk, "session": session_to_dict(s)})
                await asyncio.sleep(0.01)
                
            yield _sse({"done": True, "session": session_to_dict(s)})
            return
            
    elif s.status == "clarifying_strategy":
        from app.agent.llm_client import extract_strategy_from_reply
        
        # 提取追问回复中的策略定位与作用
        prev_question = ""
        # 查找上一个 assistant 提问
        for m in reversed(messages):
            if m.get("role") == "assistant" and m.get("content"):
                prev_question = m.get("content")
                break
                
        history_context = f"初始模糊需求: {messages[0].get('content') if messages else ''}\n总监追问: {prev_question}"
        strategy_res = await extract_strategy_from_reply(user_message, history_context)
        
        # 存入 stream_a 并清除 Quick Replies
        stream_a = _load_json(s.stream_a, {})
        stream_a["poster_strategy"] = {
            "position": strategy_res.get("position"),
            "purpose": strategy_res.get("purpose")
        }
        if "quick_replies" in stream_a:
            stream_a["quick_replies"] = None
        s.stream_a = _dump_json(stream_a)
        
        # 状态转换为 clarifying，继续向下运行以生成 Stage 1 卡片推荐
        s.status = "clarifying"

    has_prior_assistant = any(m.get("role") == "assistant" for m in messages)

    # 追加用户消息
    user_msg = {
        "id": f"msg-{uuid.uuid4().hex[:8]}-user",
        "role": "user",
        "content": user_message,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    messages.append(user_msg)

    # 创建 assistant 占位
    asst_msg = {
        "id": f"msg-{uuid.uuid4().hex[:8]}-assistant",
        "role": "assistant",
        "content": "",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    messages.append(asst_msg)

    # 解析参考图路径
    data_dir = settings.upload_dir.parent  # backend/data/

    def _get_path(f: File | None) -> Path | None:
        if f is None:
            return None
        return data_dir / f.path

    stream_b_raw = _load_json(s.stream_b, {})
    resolved_style_file = style_file or await _resolve_session_reference_file(
        stream_b_raw.get("style_reference_image"),
        user_id=s.user_id,
        db=db,
    )
    resolved_layout_file = layout_file or await _resolve_session_reference_file(
        stream_b_raw.get("layout_reference_image"),
        user_id=s.user_id,
        db=db,
    )
    resolved_subject_file = subject_file or await _resolve_session_reference_file(
        stream_b_raw.get("subject_reference_image"),
        user_id=s.user_id,
        db=db,
    )
    include_reference_images = bool(style_file or layout_file or subject_file) or not has_prior_assistant

    full_text = ""
    structured: dict | None = None
    clarify_started_at = time.perf_counter()

    # 传入大模型前，兜底确保历史消息中最后一条 assistant 消息的真实文案与当前数据库最新的 copy 完全一致（避免任何并发或正则失败）
    history_messages = [{"role": m["role"], "content": m["content"]} for m in messages[:-2]]
    try:
        import re
        db_copy = _load_json(s.stream_a, {}).get("copy", "")
        if db_copy:
            db_copy_escaped = db_copy.replace("\n", "<br />").replace("\r", "")
            pattern = r"(\[\[SECTION:poster_text\]\]\s*)(真实文案\s*[:：]\s*)(.*?)(\s*\[\[/SECTION\]\])"
            for msg in reversed(history_messages):
                if msg.get("role") == "assistant" and msg.get("content"):
                    old_c = msg["content"]
                    new_c = re.sub(pattern, f"\\1\\2{db_copy_escaped}\\4", old_c, flags=re.DOTALL)
                    if new_c != old_c:
                        msg["content"] = new_c
                    break
    except Exception as sync_history_err:
        logger.error("stream_clarify_sync_history_failed err=%s", sync_history_err)

    async for chunk, final_structured in stream_chat(
        aspect_ratio=s.aspect_ratio,
        resolution=s.resolution,
        clarify_messages=history_messages,
        user_input=user_message,
        has_prior_assistant_reply=has_prior_assistant,
        style_image_path=_get_path(resolved_style_file),
        layout_image_path=_get_path(resolved_layout_file),
        subject_image_path=_get_path(resolved_subject_file),
        include_reference_images=include_reference_images,
        stream_a=_load_json(s.stream_a, {}),
        stream_b=stream_b_raw,
        is_refresh_styles=is_refresh_styles,
        is_refresh_layouts=is_refresh_layouts,
        status=s.status,
    ):
        if final_structured is not None:
            # 最后一次 yield：含完整文本 + 结构化数据
            full_text = chunk
            structured = final_structured
        else:
            asst_msg["content"] += chunk
            yield _sse({"chunk": chunk, "session": session_to_dict(s)})

    # 更新 assistant 消息内容
    asst_msg["content"] = full_text

    # 解析并合并 stream_a / stream_b
    new_status = s.status
    if structured:
        new_status = structured.get("status", s.status)
        if new_status not in _VALID_STATUSES:
            new_status = "clarifying"

        prompt_sources_changed = False
        if sa := structured.get("stream_a"):
            if is_refresh_styles:
                # 刷新风格时，完全隔离排版与文案流，不进行任何更新
                pass
            elif is_refresh_layouts:
                # 刷新排版时，只更新 layout_recommendations，不进行其它排版或文案更新
                existing_a = _load_json(s.stream_a, {})
                for k, v in sa.items():
                    if k == "layout_recommendations":
                        existing_a[k] = v
                s.stream_a = _dump_json(existing_a)
            else:
                existing_a = _load_json(s.stream_a, {})
                for k, v in sa.items():
                    if k == "copy" and (new_status == "prompting" or s.status == "prompting") and existing_a.get("copy"):
                        # 强制忽略 Stage 2 隐式输出中的 copy，避免覆写已确认的文案快照
                        continue
                    if v is not None and existing_a.get(k) != v:
                        existing_a[k] = v
                        if k != "layout_recommendations":
                            prompt_sources_changed = True
                s.stream_a = _dump_json(existing_a)

        if sb := structured.get("stream_b"):
            if is_refresh_layouts:
                # 刷新排版时，不更新视觉属性
                pass
            else:
                existing_b = _load_json(s.stream_b, {})
                for k, v in sb.items():
                    if is_refresh_styles:
                        if k != "style_recommendations":
                            # 刷新风格时，只更新 style_recommendations，不修改其它视觉属性
                            continue
                    if v is not None and existing_b.get(k) != v:
                        existing_b[k] = v
                        if k != "style_recommendations":
                            prompt_sources_changed = True
                s.stream_b = _dump_json(existing_b)

        if prompt_sources_changed:
            await archive_current_images(s, db)
            s.final_prompt = None
            s.generation_id = None
            s.primary_ratio = None
            s.primary_resolution = None
            s.extended_images = None

    s.status = new_status
    s.clarify_messages = _dump_json(messages)
    s.updated_at = datetime.now(timezone.utc)

    # 聚合写入 design_json（仅在 prompting 阶段，clarifying 阶段跳过）
    if new_status == "prompting":
        sa_cur = _load_json(s.stream_a, {})
        sb_cur = _load_json(s.stream_b, {})
        copy_raw = sa_cur.get("copy", "")
        # 按 | 拆分 copy 生成 segments
        segments = []
        for i, seg in enumerate([p.strip() for p in copy_raw.split("|") if p.strip()]):
            segments.append({
                "text": seg,
                "role": "headline" if i == 0 else "other",
                "level": 1 if i == 0 else 2,
            })
        design_json_data = {
            "copy": {"raw": copy_raw, "segments": segments},
            "visual": {
                "description_en": sb_cur.get("visual_description", ""),
                "palette": [],
                "mood": [],
            },
            "layout": {
                "description": sa_cur.get("layout_notes", ""),
                "structure": [],
                "global_notes": "",
            },
            "recommendations": {
                "styles": sb_cur.get("style_recommendations") or [],
                "layouts": sa_cur.get("layout_recommendations") or [],
            },
            "missing_fields": [],
        }
        s.design_json = _dump_json(design_json_data)

    await db.commit()

    logger.info(
        "agent_clarify_done session=%s latency_ms=%.1f include_refs=%s history_count=%d final_status=%s",
        s.id,
        (time.perf_counter() - clarify_started_at) * 1000,
        include_reference_images,
        len(messages),
        new_status,
    )

    yield _sse({"done": True, "session": session_to_dict(s)})


async def compile_prompt(s: AgentSession, *, db: AsyncSession) -> str:
    """
    编译最终 prompt（对应 prd /compile 端点）。
    仅在 status=prompting 时允许调用。
    """
    stream_a = _load_json(s.stream_a, {})
    stream_b = _load_json(s.stream_b, {})

    prompt = build_final_prompt(
        stream_a=stream_a,
        stream_b=stream_b,
        aspect_ratio=s.aspect_ratio,
        resolution=s.resolution,
    )
    s.final_prompt = prompt
    s.updated_at = datetime.now(timezone.utc)
    await db.commit()
    return prompt


async def generate_poster(s: AgentSession, *, user: User, db: AsyncSession) -> AgentSession:
    """
    最终生成海报（对应 prd /generate 端点）。
    复用 PosterForge 现有 run_generation_job + Generation 表，自动进历史。
    """
    import asyncio
    from app.jobs import run_generation_job

    if not s.final_prompt:
        await compile_prompt(s, db=db)

    # 归档上一版结果
    await archive_current_images(s, db)

    # Final generation remains prompt-driven, but when the user uploaded
    # subject/other materials we now explicitly route through the img2img
    # semantics (`edit`) so the upstream model is forced onto the reference-
    # image branch rather than the weaker text-only/generate branch.
    generation_reference_file_ids = await collect_regeneration_reference_file_ids(s, db=db)
    generation_action = resolve_generation_action(generation_reference_file_ids)

    gen = Generation(
        user_id=user.id,
        action=generation_action,
        status="pending",
        prompt=s.final_prompt,
        params=json.dumps({"size": s.aspect_ratio, "resolution": s.resolution}),
        reference_file_ids=json.dumps(generation_reference_file_ids) if generation_reference_file_ids else None,
    )
    db.add(gen)
    await db.commit()
    await db.refresh(gen)

    # 关联到 AgentSession
    s.generation_id = gen.id
    s.primary_ratio = s.aspect_ratio
    s.primary_resolution = s.resolution
    s.extended_images = None
    s.status = "generating"
    s.updated_at = datetime.now(timezone.utc)
    await db.commit()

    # 触发后台生成任务（复用现有链路，自动处理 apimart 轮询 + 存储 + 错误分类）
    asyncio.create_task(run_generation_job(gen.id))

    logger.info(
        "agent poster generation started agent_session=%s generation=%s",
        s.id, gen.id,
    )
    return s


async def edit_poster_direct(
    s: AgentSession,
    *,
    edit_description: str,
    subject_file_id: str,
    size: str,        # 当前展示图的比例，由前端传入，不读 s.aspect_ratio
    resolution: str,  # 当前展示图的清晰度，由前端传入，不读 s.resolution
    user: User,
    db: AsyncSession,
) -> AgentSession:
    """
    海报原位圈画修改直接生成任务：
    1. 背景调用 LLM 重写生图提示词（不写入对话历史）
    2. 对当前海报进行归档版本处理
    3. 创建一个 Generation 任务（action="edit"），把 subject_file_id 作为 reference_file_ids
    4. 将会话状态置为 generating，启动后台生图任务
    """
    import asyncio
    from app.jobs import run_generation_job
    from app.agent.llm_client import rewrite_prompt_for_edit
    from app.storage import absolute_path_for

    # 1. 查找合并后的标注图文件并转换为 base64
    file_row = (
        await db.execute(select(File).where(File.id == subject_file_id))
    ).scalar_one_or_none()
    if file_row is None or file_row.user_id != user.id or file_row.deleted_at is not None:
        raise ValueError(f"Annotated subject reference file {subject_file_id} not found")

    file_path = absolute_path_for(file_row)
    base64_data = None
    if file_path.exists():
        import base64
        ext = file_path.suffix.lower()
        mime = {"png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg", "webp": "image/webp"}.get(
            ext.lstrip("."), "image/png"
        )
        data = base64.b64encode(file_path.read_bytes()).decode()
        base64_data = f"data:{mime};base64,{data}"

    # 2. 调用 LLM 提示词重写
    current_prompt = s.final_prompt or ""
    if not current_prompt:
        current_prompt = await compile_prompt(s, db=db)

    new_prompt = await rewrite_prompt_for_edit(
        current_prompt=current_prompt,
        edit_description=edit_description,
        subject_image_base64=base64_data,
    )

    # 3. 归档上一个生成结果
    await archive_current_images(s, db)

    # 4. 创建编辑任务
    generation_reference_file_ids = [subject_file_id]

    gen = Generation(
        user_id=user.id,
        action="edit",
        status="pending",
        prompt=new_prompt,
        params=json.dumps({"size": size, "resolution": resolution}),
        reference_file_ids=json.dumps(generation_reference_file_ids) if generation_reference_file_ids else None,
    )
    db.add(gen)
    await db.commit()
    await db.refresh(gen)

    # 5. 关联到 AgentSession 状态
    s.final_prompt = new_prompt
    s.generation_id = gen.id
    s.primary_ratio = size
    s.primary_resolution = resolution
    s.extended_images = None
    s.status = "generating"
    s.updated_at = datetime.now(timezone.utc)
    await db.commit()

    # 6. 异步启动生成任务
    asyncio.create_task(run_generation_job(gen.id))

    logger.info(
        "agent direct poster edit started agent_session=%s generation=%s description=%s",
        s.id, gen.id, edit_description,
    )
    return s


async def extend_poster(
    s: AgentSession,
    *,
    ratios: list[str],
    resolution: str | None,
    base_image_url: str | None,
    user: User,
    db: AsyncSession,
) -> AgentSession:
    """
    多尺寸延伸（对应 prd /extend 端点）。
    对每个目标比例独立提交 Generation 任务，并发执行，结果写入 extended_images。
    移植自 prd extend/route.ts 的 Promise.all 并发逻辑。
    """
    import asyncio
    from app.jobs import run_generation_job

    db_lock = asyncio.Lock()
    target_resolution = resolution or s.resolution
    stream_a = _load_json(s.stream_a, {})
    stream_b = _load_json(s.stream_b, {})
    extend_reference_file_ids = await collect_extend_reference_file_ids(
        s,
        base_image_url=base_image_url,
        db=db,
    )
    extend_action = resolve_generation_action(extend_reference_file_ids)

    extended: list[dict] = _load_json(s.extended_images, [])
    errors: list[str] = []

    async def _extend_one(target_ratio: str) -> dict | None:
        extended_stream_b = dict(stream_b)

        # 为目标比例编译 prompt
        ext_prompt = build_final_prompt(
            stream_a=stream_a,
            stream_b=extended_stream_b,
            aspect_ratio=target_ratio,
            resolution=target_resolution,
            is_extend=True,
            primary_ratio=s.primary_ratio,
        )

        gen = Generation(
            user_id=user.id,
            action=extend_action,
            status="pending",
            prompt=ext_prompt,
            params=json.dumps({"size": target_ratio, "resolution": target_resolution}),
            reference_file_ids=json.dumps(extend_reference_file_ids) if extend_reference_file_ids else None,
        )
        async with db_lock:
            db.add(gen)
            await db.commit()
            await db.refresh(gen)

        # 同步等待任务完成
        asyncio.create_task(run_generation_job(gen.id))

        # 等待完成（最多 300s）
        for _ in range(60):
            await asyncio.sleep(5)
            async with db_lock:
                await db.refresh(gen)
            if gen.status in ("completed", "failed"):
                break

        if gen.status != "completed":
            errors.append(f"{target_ratio}: 生成失败 ({gen.error_message or gen.error_code})")
            return None

        output_ids = _load_json(gen.output_file_ids, [])
        url = f"/api/files/{output_ids[0]}" if output_ids else None
        if not url:
            errors.append(f"{target_ratio}: 未返回输出文件")
            return None

        return {
            "ratio": target_ratio,
            "generation_id": gen.id,
            "url": url,
            "resolution": target_resolution,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }

    results = await asyncio.gather(*[_extend_one(r) for r in ratios], return_exceptions=False)
    for r in results:
        if r is not None:
            extended.append(r)

    s.extended_images = _dump_json(extended)
    s.updated_at = datetime.now(timezone.utc)
    await db.commit()

    if errors:
        logger.warning("extend partial errors: %s", "; ".join(errors))

    return s


async def extend_poster_parallel(
    s: AgentSession,
    *,
    ratios: list[str],
    resolution: str | None,
    base_image_url: str | None,
    user: User,
    db: AsyncSession,
) -> AgentSession:
    """
    多尺寸延伸并发提交版本：
    - 为每个目标尺寸立即创建一个 Generation 任务
    - 立刻返回 pending 列表给前端
    - 后台异步完成实际生成并回写每个尺寸结果
    """
    import asyncio

    target_resolution = resolution or s.resolution
    stream_a = _load_json(s.stream_a, {})
    stream_b = _load_json(s.stream_b, {})
    extend_reference_file_ids = await collect_extend_reference_file_ids(
        s,
        base_image_url=base_image_url,
        db=db,
    )
    extend_action = resolve_generation_action(extend_reference_file_ids)

    # 检测 base_image_url 是否属于已归档的历史版本分组
    archived_list = _load_json(s.archived_images, [])
    now_iso = datetime.now(timezone.utc).isoformat()

    # 动态把 legacy flat items 升级为 VersionGroup 结构
    migrated_archived = []
    for i in archived_list:
        if not isinstance(i, dict):
            continue
        if "batch_id" in i:
            migrated_archived.append(i)
        else:
            is_ext = i.get("source") == "extended"
            archived_at_str = i.get("archived_at") or i.get("created_at") or now_iso
            
            matched_group = None
            for g in migrated_archived:
                if g.get("batch_id", "").startswith("legacy-") and g.get("created_at") == archived_at_str:
                    matched_group = g
                    break
            
            if matched_group:
                if is_ext:
                    matched_group.setdefault("extended_images", []).append(i)
                else:
                    matched_group["primary_image"] = i
            else:
                batch_id = f"legacy-{i.get('generation_id') or i.get('id') or int(datetime.now(timezone.utc).timestamp())}"
                migrated_archived.append({
                    "batch_id": batch_id,
                    "created_at": archived_at_str,
                    "core_strategy": "历史归档图片",
                    "text_outline": "旧版本文案",
                    "primary_image": None if is_ext else i,
                    "extended_images": [i] if is_ext else []
                })
    archived_list = migrated_archived

    target_group = None
    if base_image_url:
        for g in archived_list:
            prim = g.get("primary_image") or {}
            if prim.get("url") == base_image_url:
                target_group = g
                break
            found = False
            for ext in g.get("extended_images", []):
                if ext.get("url") == base_image_url:
                    target_group = g
                    found = True
                    break
            if found:
                break

    created_jobs: list[str] = []

    if target_group is not None:
        group_extended = target_group.setdefault("extended_images", [])
        group_extended = [item for item in group_extended if item.get("ratio") not in ratios]
        target_group["extended_images"] = group_extended
    else:
        extended: list[dict] = _load_json(s.extended_images, [])
        extended = [item for item in extended if item.get("ratio") not in ratios]

    for target_ratio in ratios:
        ext_prompt = build_final_prompt(
            stream_a=stream_a,
            stream_b=dict(stream_b),
            aspect_ratio=target_ratio,
            resolution=target_resolution,
            is_extend=True,
            primary_ratio=s.primary_ratio,
        )

        gen = Generation(
            user_id=user.id,
            action=extend_action,
            status="pending",
            prompt=ext_prompt,
            params=json.dumps({"size": target_ratio, "resolution": target_resolution}),
            reference_file_ids=json.dumps(extend_reference_file_ids) if extend_reference_file_ids else None,
        )
        db.add(gen)
        await db.commit()
        await db.refresh(gen)

        new_ext_item = {
            "id": f"extended-{gen.id}",
            "ratio": target_ratio,
            "generation_id": gen.id,
            "url": None,
            "resolution": target_resolution,
            "created_at": now_iso,
            "updated_at": now_iso,
            "status": "pending",
            "progress": 5,
            "error_message": None,
        }

        if target_group is not None:
            target_group["extended_images"].append(new_ext_item)
        else:
            extended.append(new_ext_item)

        created_jobs.append(gen.id)

    if target_group is not None:
        s.archived_images = _dump_json(archived_list)
    else:
        s.extended_images = _dump_json(extended)

    s.updated_at = datetime.now(timezone.utc)
    await db.commit()

    for gen_id in created_jobs:
        asyncio.create_task(_sync_extend_result(session_id=s.id, generation_id=gen_id))

    return s


# ─────────────────────────────── SSE 辅助 ────────────────────────────────────

def _sse(data: dict) -> bytes:
    return f"data: {json.dumps(data, ensure_ascii=False)}\n\n".encode()
