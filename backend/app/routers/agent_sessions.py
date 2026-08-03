"""routers/agent_sessions.py

Agent 会话 API 路由。9 个端点，覆盖完整工作流：
  POST   /api/agent/sessions                     → 创建会话
  GET    /api/agent/sessions/{id}                → 获取会话
  PATCH  /api/agent/sessions/{id}                → 更新参数（内联编辑）
  DELETE /api/agent/sessions/{id}                → 删除会话
  POST   /api/agent/sessions/{id}/clarify        → SSE 对话（核心）
  POST   /api/agent/sessions/{id}/compile        → 编译最终 prompt
  POST   /api/agent/sessions/{id}/generate       → 触发最终生成
  POST   /api/agent/sessions/{id}/extend         → 多尺寸延伸
  POST   /api/agent/sessions/{id}/refresh-styles → 刷新风格推荐
  POST   /api/agent/sessions/{id}/upload         → 上传参考图（复用 /api/uploads）
"""
from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, Depends, Form, Query, UploadFile, File as UploadFileDep
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.agent import skill_runner
from app.agent.skill_runner import load_json
from app.auth import current_user
from app.db import get_session
from app.errors import raise_http
from app.models import AgentSession, File, User
from app.schemas import (
    AgentChatRequest,
    AgentExtendRequest,
    AgentSessionOut,
    AgentUpdateRequest,
    CreateAgentSessionOut,
    AgentRefreshCopyRequest,
    AgentRefreshCopyResponse,
    AgentVersionGroup,
    AgentEditRequest,
)

logger = logging.getLogger("posterforge.agent.router")

router = APIRouter(prefix="/api/agent/sessions", tags=["agent"])

_VALID_RATIOS = {"1:1", "16:9", "9:16", "A4", "Banner", "A4_Horizontal", "4:3", "3:4", "3:2", "2:3", "9:32"}
_VALID_RESOLUTIONS = {"1k", "2k", "4k"}


# ──────────────────────────── 辅助 ────────────────────────────────────────────

async def _get_or_404(
    session_id: str, user: User, db: AsyncSession
) -> AgentSession:
    s = await skill_runner.get_session(session_id, user=user, db=db)
    if s is None:
        raise_http("not_found", "Agent 会话不存在", status_code=404)
    return s  # type: ignore[return-value]


async def _resolve_file(file_id: str | None, user: User, db: AsyncSession) -> File | None:
    """根据 file_id 解析文件（校验归属）。"""
    if not file_id:
        return None
    f = (
        await db.execute(select(File).where(File.id == file_id))
    ).scalar_one_or_none()
    if f is None or f.user_id != user.id or f.deleted_at is not None:
        raise_http("invalid_input", f"文件 {file_id} 不存在或无权限", status_code=400)
    return f


def _to_out(s: AgentSession) -> AgentSessionOut:
    from app.schemas import (
        AgentClarifyMessage, AgentStreamA, AgentStreamB, AgentExtendedImage,
    )

    def _messages(raw):
        msgs = load_json(raw, [])
        return [AgentClarifyMessage(**m) for m in msgs if isinstance(m, dict)]

    def _stream_a(raw):
        d = load_json(raw)
        return AgentStreamA(**d) if d else None

    def _stream_b(raw):
        d = load_json(raw)
        return AgentStreamB(**d) if d else None

    def _extended(raw):
        items = load_json(raw, [])
        return [AgentExtendedImage(**i) for i in items if isinstance(i, dict)]

    def _archived(raw):
        from datetime import datetime, timezone
        from app.schemas import AgentExtendedImage, AgentVersionGroup
        items = load_json(raw, [])
        res = []
        for i in items:
            if not isinstance(i, dict):
                continue
            if "batch_id" in i:
                prim = None
                if i.get("primary_image"):
                    prim = AgentExtendedImage(**i["primary_image"])
                exts = []
                for ext in i.get("extended_images", []):
                    if isinstance(ext, dict):
                        exts.append(AgentExtendedImage(**ext))
                res.append(AgentVersionGroup(
                    batch_id=i["batch_id"],
                    created_at=i["created_at"],
                    core_strategy=i.get("core_strategy"),
                    text_outline=i.get("text_outline"),
                    primary_image=prim,
                    extended_images=exts
                ))
            else:
                is_ext = i.get("source") == "extended"
                img_obj = AgentExtendedImage(**i)
                archived_at_str = i.get("archived_at") or i.get("created_at") or ""
                
                matched_group = None
                if archived_at_str:
                    for g in res:
                        if g.batch_id.startswith("legacy-") and g.created_at == archived_at_str:
                            matched_group = g
                            break
                if matched_group:
                    if is_ext:
                        matched_group.extended_images.append(img_obj)
                    else:
                        matched_group.primary_image = img_obj
                else:
                    batch_id = f"legacy-{i.get('generation_id') or i.get('id') or int(datetime.now(timezone.utc).timestamp())}"
                    res.append(AgentVersionGroup(
                        batch_id=batch_id,
                        created_at=archived_at_str or datetime.now(timezone.utc).isoformat(),
                        core_strategy="历史归档图片",
                        text_outline="旧版本文案",
                        primary_image=None if is_ext else img_obj,
                        extended_images=[img_obj] if is_ext else []
                    ))
        return res

    return AgentSessionOut(
        id=s.id,
        user_id=s.user_id,
        status=s.status,
        aspect_ratio=s.aspect_ratio,
        resolution=s.resolution,
        clarify_messages=_messages(s.clarify_messages),
        stream_a=_stream_a(s.stream_a),
        stream_b=_stream_b(s.stream_b),
        final_prompt=s.final_prompt,
        generation_id=s.generation_id,
        primary_ratio=s.primary_ratio,
        primary_resolution=s.primary_resolution,
        extended_images=_extended(s.extended_images),
        archived_images=_archived(s.archived_images),
        error_message=s.error_message,
        design_json=load_json(s.design_json) if s.design_json else None,
        subject_description=skill_runner.get_subject_description(s),
        created_at=s.created_at,
        updated_at=s.updated_at,
    )


# ──────────────────────────── 端点 ────────────────────────────────────────────

@router.post("", response_model=CreateAgentSessionOut, status_code=201)
async def create_agent_session(
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> CreateAgentSessionOut:
    """创建新的 Agent 对话会话。"""
    s = await skill_runner.create_session(user=user, db=db)
    return CreateAgentSessionOut(session_id=s.id, status=s.status)


@router.get("", response_model=list[AgentSessionOut])
async def list_agent_sessions(
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> list[AgentSessionOut]:
    """获取当前用户的所有 Agent 对话会话列表。"""
    stmt = (
        select(AgentSession)
        .where(AgentSession.user_id == user.id, AgentSession.deleted_at.is_(None))
        .order_by(AgentSession.updated_at.desc())
    )
    rows = (await db.execute(stmt)).scalars().all()
    for r in rows:
        await skill_runner.sync_session_status(r, db)
    return [_to_out(r) for r in rows]


@router.get("/{session_id}", response_model=AgentSessionOut)
async def get_agent_session(
    session_id: str,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> AgentSessionOut:
    s = await _get_or_404(session_id, user, db)
    return _to_out(s)


@router.patch("/{session_id}", response_model=AgentSessionOut)
async def update_agent_session(
    session_id: str,
    body: AgentUpdateRequest,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> AgentSessionOut:
    """前端内联编辑后同步参数（aspect_ratio / resolution / stream_a / stream_b）。"""
    s = await _get_or_404(session_id, user, db)

    if body.aspect_ratio and body.aspect_ratio not in _VALID_RATIOS:
        raise_http("invalid_input", "不支持的画幅比例")
    if body.resolution and body.resolution not in _VALID_RESOLUTIONS:
        raise_http("invalid_input", "不支持的清晰度")

    await skill_runner.update_session_params(
        s,
        status=body.status,
        aspect_ratio=body.aspect_ratio,
        resolution=body.resolution,
        stream_a=body.stream_a.model_dump(exclude_unset=True) if body.stream_a else None,
        stream_b=body.stream_b.model_dump(exclude_unset=True) if body.stream_b else None,
        extended_images=[img.model_dump(exclude_none=True) for img in body.extended_images] if body.extended_images is not None else None,
        db=db,
    )
    return _to_out(s)


@router.delete("/{session_id}", status_code=204)
async def delete_agent_session(
    session_id: str,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> None:
    ok = await skill_runner.delete_session(session_id, user=user, db=db)
    if not ok:
        raise_http("not_found", "Agent 会话不存在", status_code=404)


@router.post("/{session_id}/clarify")
async def clarify(
    session_id: str,
    body: AgentChatRequest,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
):
    """
    核心对话端点，返回 SSE 流式响应。
    每个 data: 帧携带 {chunk: str, session: {...}} 或 {done: true, session: {...}}。
    """
    s = await _get_or_404(session_id, user, db)

    if not body.message.strip():
        raise_http("invalid_input", "消息不能为空")

    style_file = await _resolve_file(body.style_file_id, user, db)
    layout_file = await _resolve_file(body.layout_file_id, user, db)
    subject_file = await _resolve_file(body.subject_file_id, user, db)

    async def generator():
        async for chunk_bytes in skill_runner.stream_clarify(
            s,
            user_message=body.message,
            style_file=style_file,
            layout_file=layout_file,
            subject_file=subject_file,
            db=db,
        ):
            yield chunk_bytes

    return StreamingResponse(
        generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/{session_id}/compile", response_model=AgentSessionOut)
async def compile_prompt(
    session_id: str,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> AgentSessionOut:
    """编译最终生图提示词（status 需为 prompting 或更后阶段）。"""
    s = await _get_or_404(session_id, user, db)
    if s.status not in ("prompting", "review", "done", "failed"):
        raise_http("invalid_input", f"当前状态 {s.status} 不允许编译提示词")

    await skill_runner.compile_prompt(s, db=db)
    return _to_out(s)


@router.post("/{session_id}/generate", response_model=AgentSessionOut)
async def generate(
    session_id: str,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> AgentSessionOut:
    """
    触发最终海报生成。
    内部复用 run_generation_job，自动写入 generations 表，出现在历史页。
    """
    s = await _get_or_404(session_id, user, db)
    if s.status not in ("prompting", "review", "done", "failed"):
        raise_http("invalid_input", f"当前状态 {s.status} 不允许生成")

    await skill_runner.generate_poster(s, user=user, db=db)
    return _to_out(s)


@router.post("/{session_id}/extend", response_model=AgentSessionOut)
async def extend(
    session_id: str,
    body: AgentExtendRequest,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> AgentSessionOut:
    """
    多尺寸延伸：对每个目标比例并发提交生成任务。
    移植自 prd extend/route.ts（Promise.all 并发 → asyncio.gather）。
    """
    s = await _get_or_404(session_id, user, db)

    if not body.ratios:
        raise_http("invalid_input", "请至少选择一个目标比例")
    invalid = [r for r in body.ratios if r not in _VALID_RATIOS]
    if invalid:
        raise_http("invalid_input", f"不支持的比例：{', '.join(invalid)}")
    archived_list = load_json(s.archived_images, [])
    if s.generation_id is None and not archived_list:
        raise_http("invalid_input", "请先完成主海报生成后再进行多尺寸延伸")

    await skill_runner.extend_poster_parallel(
        s,
        ratios=body.ratios,
        resolution=body.resolution,
        base_image_url=body.base_image_url,
        user=user,
        db=db,
    )
    return _to_out(s)


@router.post("/{session_id}/edit", response_model=AgentSessionOut)
async def edit(
    session_id: str,
    body: AgentEditRequest,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> AgentSessionOut:
    """
    海报直接修改（局部圈画修改）：直接触发后台图片编辑生成。
    """
    s = await _get_or_404(session_id, user, db)

    archived_list = load_json(s.archived_images, [])
    if s.generation_id is None and not archived_list:
        raise_http("invalid_input", "请先生成主海报后再进行圈画修改")

    await skill_runner.edit_poster_direct(
        s,
        edit_description=body.edit_description,
        subject_file_id=body.subject_file_id,
        size=body.size,
        resolution=body.resolution,
        user=user,
        db=db,
    )
    return _to_out(s)


@router.post("/{session_id}/refresh-styles", response_model=AgentSessionOut)
async def refresh_styles(
    session_id: str,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> AgentSessionOut:
    """
    刷新风格推荐：向 LLM 重新请求 style_recommendations。
    通过追加一条特殊 user 消息触发，无需改变状态机。
    """
    s = await _get_or_404(session_id, user, db)

    # 以特殊消息触发风格推荐重刷（LLM 会根据 system prompt 规则重新生成推荐）
    refresh_trigger = "请重新推荐 4 种不同方向的海报设计风格方案供我选择。"

    async for _ in skill_runner.stream_clarify(
        s,
        user_message=refresh_trigger,
        style_file=None,
        layout_file=None,
        subject_file=None,
        db=db,
        is_refresh_styles=True,
    ):
        pass  # 静默消费流，仅等待 session 更新

    return _to_out(s)


@router.post("/{session_id}/refresh-layouts", response_model=AgentSessionOut)
async def refresh_layouts(
    session_id: str,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> AgentSessionOut:
    """
    刷新排版推荐：向 LLM 重新请求 layout_recommendations。
    通过追加一条特殊 user 消息触发，无需改变状态机。
    """
    s = await _get_or_404(session_id, user, db)

    # 以特殊消息触发排版推荐重刷（LLM 会根据 system prompt 规则重新生成推荐）
    refresh_trigger = "请重新推荐 4 种不同结构布局的海报排版方案供我选择。"

    async for _ in skill_runner.stream_clarify(
        s,
        user_message=refresh_trigger,
        style_file=None,
        layout_file=None,
        subject_file=None,
        db=db,
        is_refresh_layouts=True,
    ):
        pass  # 静默消费流，仅等待 session 更新

    return _to_out(s)


@router.post("/{session_id}/upload", response_model=AgentSessionOut)
async def upload_reference_image(
    session_id: str,
    file: UploadFile = UploadFileDep(...),
    type: str = Form("style"),
    subjectType: Optional[str] = Form(None),
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> AgentSessionOut:
    """
    上传参考图（风格/排版/主体物素材）。
    存盘、记库、并自动更新关联到 s.stream_b 中。
    """
    import json
    import uuid
    from datetime import datetime, timezone
    from app.storage import save_upload

    s = await _get_or_404(session_id, user, db)

    mime = (file.content_type or "").lower()
    allowed_mimes = {"image/png", "image/jpeg", "image/jpg", "image/webp", "application/pdf"}
    if mime not in allowed_mimes:
        raise_http("invalid_input", "不支持的文件格式，仅支持图片和 PDF 格式")
    data = await file.read()
    if len(data) == 0:
        raise_http("invalid_input", "文件为空")
    if len(data) > 10 * 1024 * 1024:
        raise_http("invalid_input", "单张参考图或文档不能超过 10MB")

    # PDF 特殊处理
    if mime == "application/pdf":
        from app.agent.pdf_helper import extract_text_from_pdf, render_pdf_page_to_image
        if type == "pdf_document":
            # 1. 提取 PDF 纯文本，并保存 PDF 原始文件
            parsed_text = extract_text_from_pdf(data)
            row = await save_upload(db, user_id=user.id, data=data, mime=mime)
            pdf_url = f"/api/files/{row.id}"

            existing_a = load_json(s.stream_a, {})
            existing_a["pdf_document_url"] = pdf_url
            existing_a["pdf_document_text"] = parsed_text
            existing_a["pdf_document_name"] = file.filename
            existing_a["pdf_document_size"] = len(data)
            s.stream_a = json.dumps(existing_a, ensure_ascii=False)

            # 参数变化时清除已生成结果以重新编译
            s.final_prompt = None
            s.updated_at = datetime.now(timezone.utc)
            await db.commit()
            return _to_out(s)
        else:
            # 2. 作为参考图：将第 0 页渲染为 PNG
            try:
                png_data = render_pdf_page_to_image(data, 0)
                data = png_data
                mime = "image/png"
            except Exception as e:
                raise_http("invalid_input", f"PDF 解析或渲染失败: {str(e)}")

    row = await save_upload(db, user_id=user.id, data=data, mime=mime)
    imageUrl = f"/api/files/{row.id}"

    existing_b = load_json(s.stream_b, {})

    if type == "layout":
        existing_b["layout_reference_image"] = imageUrl
    elif type == "subject":
        stype = subjectType or "subject"
        if stype == "subject":
            existing_b["subject_reference_image"] = imageUrl
            existing_b["subject_reference_image_type"] = stype

        new_mat = {
            "id": f"mat-{int(datetime.now(timezone.utc).timestamp())}-{uuid.uuid4().hex[:6]}",
            "url": imageUrl,
            "type": stype
        }

        if stype == "other":
            from app.agent.llm_client import describe_reference_image
            from app.storage import absolute_path_for
            abs_path = absolute_path_for(row)
            desc = await describe_reference_image(abs_path)
            new_mat["description"] = desc

        if "subject_materials" not in existing_b or not isinstance(existing_b["subject_materials"], list):
            existing_b["subject_materials"] = []
        existing_b["subject_materials"].append(new_mat)
    else:  # style
        existing_b["style_reference_image"] = imageUrl
        existing_b["reference_image"] = imageUrl  # 默认兼容主图

    s.stream_b = json.dumps(existing_b, ensure_ascii=False)
    # 参数变化时清除已生成的结果以重新编译
    s.final_prompt = None
    s.updated_at = datetime.now(timezone.utc)

    await db.commit()
    return _to_out(s)





@router.post("/{session_id}/refresh-copy", response_model=AgentRefreshCopyResponse)
async def refresh_copy(
    session_id: str,
    body: AgentRefreshCopyRequest,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> AgentRefreshCopyResponse:
    """
    根据指定密度刷新重写全部海报印刷文案，并更新持久化存盘。
    """
    import json
    from datetime import datetime, timezone
    from app.agent.llm_client import refresh_copy_text

    s = await _get_or_404(session_id, user, db)

    # 提取首个 user 消息作为需求输入
    initial_user_prompt = None
    messages = load_json(s.clarify_messages, [])
    for msg in messages:
        if msg.get("role") == "user" and msg.get("content"):
            initial_user_prompt = msg["content"]
            break

    stream_a = load_json(s.stream_a, {})
    poster_strategy = stream_a.get("poster_strategy") if stream_a else None

    try:
        refreshed = await refresh_copy_text(
            density=body.density,
            current_copy=body.current_copy,
            aspect_ratio=s.aspect_ratio,
            selected_style_name=body.selected_style_name,
            selected_style_desc=body.selected_style_desc,
            initial_user_prompt=initial_user_prompt,
            poster_strategy=poster_strategy,
        )
    except Exception as e:
        logger.error("refresh_copy_endpoint_failed err=%s", e)
        raise_http("server_error", f"文案刷新接口调用失败: {str(e)}", status_code=500)

    # 将新密度和新文案持久化保存至 session.stream_a
    stream_a["density"] = body.density
    stream_a["copy"] = refreshed
    s.stream_a = json.dumps(stream_a, ensure_ascii=False)

    # 同步修改对话历史（clarify_messages）中最后一条 assistant 消息中的文案，确保上下文一致
    try:
        import re
        refreshed_escaped = refreshed.replace("\n", "<br />").replace("\r", "")
        updated_messages = []
        for msg in reversed(messages):
            if msg.get("role") == "assistant" and not updated_messages:
                content = msg.get("content", "")
                # 正则匹配并替换 [[SECTION:poster_text]] 内部的真实文案行
                pattern = r"(\[\[SECTION:poster_text\]\]\s*)(真实文案\s*[:：]\s*)(.*?)(\s*\[\[/SECTION\]\])"
                if re.search(pattern, content, flags=re.DOTALL):
                    new_content = re.sub(pattern, rf"\1\2{refreshed_escaped}\4", content, flags=re.DOTALL)
                    msg["content"] = new_content
                updated_messages.append(msg)
            else:
                updated_messages.append(msg)
        updated_messages.reverse()
        s.clarify_messages = json.dumps(updated_messages, ensure_ascii=False)
    except Exception as history_err:
        logger.error("refresh_copy_sync_history_failed err=%s", history_err)

    # 清理已生成的结果以便后续重新编译排版
    s.final_prompt = None
    s.updated_at = datetime.now(timezone.utc)

    await db.commit()

    return AgentRefreshCopyResponse(refreshed_copy=refreshed)


