from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Optional

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    Form,
    Query,
    status,
)
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import current_user
from app.db import get_session
from app.errors import raise_http
from app.jobs import run_generation_job
from app.models import File, Generation, User
from app.schemas import (
    CreateGenerationOut,
    FileRefOut,
    GenerationOut,
    GenerationParamsOut,
    HistoryItemOut,
    HistoryPageOut,
)

router = APIRouter(prefix="/api/generations", tags=["generations"])

# v0.8 size 改为 apimart 比例字符串（与 frontend/src/features/generation/size-presets.ts
# 同步）。比例 + resolution 组合决定实际像素；'auto' 仅 edit 可用 — 让上游
# 按参考图自适应。如要扩档，两端同步改。
_VALID_SIZES = {
    "1:1",   # 方图
    "4:3",   # 横向 PPT
    "3:4",   # 小红书
    "16:9",  # 宽屏
    "9:16",  # 海报
    "3:2",   # 摄影
    "2:3",   # 杂志
    "9:32",  # 详情页
    "auto",
}
_VALID_RESOLUTIONS = {"1k", "2k", "4k"}
_MAX_PROMPT_LEN = 8000
_MAX_REFERENCE_IMAGES = 5  # 代理商支持 16，本期暂保持 5；见 CLAUDE.md §7


def _serialize(gen: Generation, files: list[File]) -> GenerationOut:
    file_map = {f.id: f for f in files}

    def _refs(raw: Optional[str]) -> list[FileRefOut]:
        if not raw:
            return []
        try:
            ids = json.loads(raw) or []
        except Exception:
            return []
        out: list[FileRefOut] = []
        for fid in ids:
            f = file_map.get(fid)
            if f is None:
                continue
            out.append(
                FileRefOut(
                    file_id=f.id,
                    url=f"/api/files/{f.id}",
                    width=f.width,
                    height=f.height,
                )
            )
        return out

    params = json.loads(gen.params)
    return GenerationOut(
        id=gen.id,
        action=gen.action,  # type: ignore[arg-type]
        status=gen.status,  # type: ignore[arg-type]
        prompt=gen.prompt,
        params=GenerationParamsOut(**params),
        revised_prompt=gen.revised_prompt,
        reference_files=_refs(gen.reference_file_ids),
        output_files=_refs(gen.output_file_ids),
        error_code=gen.error_code,
        error_message=gen.error_message,
        created_at=gen.created_at,
        completed_at=gen.completed_at,
    )


@router.post("", response_model=CreateGenerationOut, status_code=status.HTTP_202_ACCEPTED)
async def create_generation(
    background: BackgroundTasks,
    action: str = Form(...),
    prompt: str = Form(...),
    size: str = Form("1:1"),
    resolution: str = Form("1k"),
    # File ids previously uploaded via POST /api/uploads. Form field repeats
    # for multiple ids: fd.append("reference_file_ids", id) on the client.
    reference_file_ids: list[str] = Form(default_factory=list),
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> CreateGenerationOut:
    # ── validate ──
    if action not in {"generate", "edit"}:
        raise_http("invalid_input", "action 必须是 generate 或 edit")
    if size not in _VALID_SIZES:
        raise_http("invalid_input", "size 不在支持的预设清单内")
    # auto 仅 edit 端支持（generations 接受 auto，但语义上只对参考图有意义）
    if size == "auto" and action != "edit":
        raise_http("invalid_input", "size=auto 仅在 edit 模式下可用")
    if resolution not in _VALID_RESOLUTIONS:
        raise_http("invalid_input", "resolution 必须是 1k / 2k / 4k")
    prompt = prompt.strip()
    if not prompt:
        raise_http("invalid_input", "prompt 不能为空")
    if len(prompt) > _MAX_PROMPT_LEN:
        raise_http("invalid_input", f"prompt 长度不能超过 {_MAX_PROMPT_LEN}")

    if action == "edit":
        if not reference_file_ids:
            raise_http("invalid_input", "edit 需要至少 1 张参考图")
        if len(reference_file_ids) > _MAX_REFERENCE_IMAGES:
            raise_http(
                "invalid_input",
                f"参考图最多 {_MAX_REFERENCE_IMAGES} 张",
            )
        # All ids must exist, belong to this user, be uploads, not deleted.
        rows = list(
            (
                await session.execute(
                    select(File).where(File.id.in_(reference_file_ids))
                )
            )
            .scalars()
            .all()
        )
        # Treat any missing/foreign/deleted/non-upload id uniformly as invalid_input
        # (don't leak whether an id exists for someone else).
        if len(rows) != len(set(reference_file_ids)):
            raise_http("invalid_input", "存在无效的参考图")
        for f in rows:
            if (
                f.user_id != user.id
                or f.deleted_at is not None
                or f.kind != "upload"
            ):
                raise_http("invalid_input", "存在无效的参考图")
    elif reference_file_ids:
        # generate-mode: ignore any leaked file ids
        reference_file_ids = []

    gen = Generation(
        user_id=user.id,
        action=action,
        status="pending",
        prompt=prompt,
        # size 是 apimart 比例字符串（'1:1' 等）或 'auto'；resolution 是 1k/2k/4k
        # 档位。auto 模式下 resolution 不参与上游计算（输出跟随参考图），但仍持久化以保
        # 留用户选择，便于历史卡片 / 复用语义一致。
        params=json.dumps({"size": size, "resolution": resolution}),
        reference_file_ids=json.dumps(reference_file_ids) if reference_file_ids else None,
    )
    session.add(gen)
    await session.commit()
    await session.refresh(gen)

    background.add_task(run_generation_job, gen.id)
    return CreateGenerationOut(job_id=gen.id, status="pending")


@router.get("/{job_id}", response_model=GenerationOut)
async def get_generation(
    job_id: str,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> GenerationOut:
    gen = (
        await session.execute(select(Generation).where(Generation.id == job_id))
    ).scalar_one_or_none()
    if gen is None or gen.deleted_at is not None:
        raise_http("not_found", "生成任务不存在", status_code=404)
    if gen.user_id != user.id:
        # Don't leak existence
        raise_http("not_found", "生成任务不存在", status_code=404)

    file_ids: list[str] = []
    if gen.output_file_ids:
        try:
            file_ids.extend(json.loads(gen.output_file_ids) or [])
        except Exception:
            pass
    if gen.reference_file_ids:
        try:
            file_ids.extend(json.loads(gen.reference_file_ids) or [])
        except Exception:
            pass
    files: list[File] = []
    if file_ids:
        files = list(
            (await session.execute(select(File).where(File.id.in_(file_ids))))
            .scalars()
            .all()
        )
    return _serialize(gen, files)


@router.delete("/{job_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_generation(
    job_id: str,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> None:
    gen = (
        await session.execute(select(Generation).where(Generation.id == job_id))
    ).scalar_one_or_none()
    if gen is None or gen.deleted_at is not None:
        raise_http("not_found", "生成任务不存在", status_code=404)
    if gen.user_id != user.id:
        raise_http("not_found", "生成任务不存在", status_code=404)
    gen.deleted_at = datetime.now(timezone.utc)
    await session.commit()


# Sibling router (no /generations prefix) for the listing endpoint.
history_router = APIRouter(prefix="/api", tags=["generations"])


def _parse_cursor(cursor: Optional[str]) -> Optional[datetime]:
    if not cursor:
        return None
    try:
        dt = datetime.fromisoformat(cursor)
    except ValueError:
        raise_http("invalid_input", "cursor 格式无效（需 ISO 8601）")
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


@history_router.get("/history", response_model=HistoryPageOut)
async def list_history(
    cursor: Optional[str] = Query(default=None),
    page_size: int = Query(default=20, ge=1, le=50),
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> HistoryPageOut:
    cursor_dt = _parse_cursor(cursor)

    stmt = (
        select(Generation)
        .where(Generation.user_id == user.id, Generation.deleted_at.is_(None))
        .order_by(Generation.created_at.desc())
        .limit(page_size + 1)  # one extra to compute has_more
    )
    if cursor_dt is not None:
        stmt = stmt.where(Generation.created_at < cursor_dt)

    rows = list((await session.execute(stmt)).scalars().all())
    has_more = len(rows) > page_size
    rows = rows[:page_size]

    # Batch-fetch first output File per Generation for thumbnail
    first_file_ids: list[str] = []
    per_gen_first: dict[str, Optional[str]] = {}
    for g in rows:
        ids: list[str] = []
        if g.output_file_ids:
            try:
                ids = json.loads(g.output_file_ids) or []
            except Exception:
                ids = []
        first = ids[0] if ids else None
        per_gen_first[g.id] = first
        if first:
            first_file_ids.append(first)

    # We don't actually need to query File rows for thumbnail_url construction
    # — /api/files/{id} resolves at fetch time and rejects unauthorized.
    items: list[HistoryItemOut] = []
    for g in rows:
        params = json.loads(g.params)
        out_ids: list[str] = []
        if g.output_file_ids:
            try:
                out_ids = json.loads(g.output_file_ids) or []
            except Exception:
                out_ids = []
        first = per_gen_first.get(g.id)
        items.append(
            HistoryItemOut(
                id=g.id,
                action=g.action,  # type: ignore[arg-type]
                status=g.status,  # type: ignore[arg-type]
                prompt=g.prompt,
                params=GenerationParamsOut(**params),
                thumbnail_url=f"/api/files/{first}" if first else None,
                output_count=len(out_ids),
                error_code=g.error_code,
                created_at=g.created_at,
            )
        )

    next_cursor: Optional[str] = None
    if has_more and rows:
        last = rows[-1].created_at
        if last.tzinfo is None:
            last = last.replace(tzinfo=timezone.utc)
        next_cursor = last.isoformat()

    return HistoryPageOut(items=items, next_cursor=next_cursor, has_more=has_more)
