from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy import case, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import (
    clear_admin_cookie,
    current_admin,
    current_user,
    is_admin,
    issue_admin_cookie,
    verify_admin_secret,
)
from app.config import Settings, get_settings
from app.db import get_session
from app.errors import raise_http
from app.models import File as FileModel, Generation, User

# Retention windows from PRD §4.6 — auto cleanup is not yet implemented in
# Phase 1. The admin storage endpoint reports `expired_count` so the operator
# can see how many files are past their nominal retention.
UPLOADS_RETENTION_DAYS = 7
OUTPUTS_RETENTION_DAYS = 30
from app.schemas import (
    AdminCountOut,
    AdminElevateRequest,
    AdminFailureOut,
    AdminGalleryItemOut,
    AdminGalleryPageOut,
    AdminGenerationDetailOut,
    AdminPeriodOut,
    AdminSessionOut,
    AdminStatsOut,
    AdminStorageBucketOut,
    AdminStorageOut,
    AdminTopUserOut,
    AdminTrendDayOut,
    AdminUserOut,
    FileRefOut,
    GenerationParamsOut,
)

router = APIRouter(prefix="/api/admin", tags=["admin"])
logger = logging.getLogger("posterforge.admin")


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _count_out(total: int, failed: int) -> AdminCountOut:
    failure_rate = round((failed / total) * 100, 1) if total else 0.0
    return AdminCountOut(total=total, failed=failed, failure_rate=failure_rate)


def _period_starts(now: datetime) -> tuple[datetime, datetime]:
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    month_start = today_start.replace(day=1)
    return today_start, month_start


async def _last_7_days(
    session: AsyncSession, today_start: datetime
) -> list[AdminTrendDayOut]:
    seven_days_ago = today_start - timedelta(days=6)
    is_failed = case((Generation.status == "failed", 1), else_=0)
    rows = (
        await session.execute(
            select(
                func.date(Generation.created_at).label("d"),
                func.count(Generation.id).label("total"),
                func.coalesce(func.sum(is_failed), 0).label("failed"),
            )
            .where(
                Generation.deleted_at.is_(None),
                Generation.created_at >= seven_days_ago,
            )
            .group_by(func.date(Generation.created_at))
        )
    ).all()

    by_date: dict[str, tuple[int, int]] = {
        str(r.d): (int(r.total or 0), int(r.failed or 0)) for r in rows
    }

    out: list[AdminTrendDayOut] = []
    for i in range(7):
        d = (seven_days_ago + timedelta(days=i)).date().isoformat()
        total, failed = by_date.get(d, (0, 0))
        out.append(AdminTrendDayOut(date=d, total=total, failed=failed))
    return out


async def _period_since(session: AsyncSession, start_at: datetime) -> AdminPeriodOut:
    is_failed = case((Generation.status == "failed", 1), else_=0)
    is_gen = case((Generation.action == "generate", 1), else_=0)
    is_edit = case((Generation.action == "edit", 1), else_=0)
    is_gen_failed = case(
        ((Generation.action == "generate") & (Generation.status == "failed"), 1),
        else_=0,
    )
    is_edit_failed = case(
        ((Generation.action == "edit") & (Generation.status == "failed"), 1),
        else_=0,
    )

    row = (
        await session.execute(
            select(
                func.count(Generation.id),
                func.coalesce(func.sum(is_failed), 0),
                func.coalesce(func.sum(is_gen), 0),
                func.coalesce(func.sum(is_gen_failed), 0),
                func.coalesce(func.sum(is_edit), 0),
                func.coalesce(func.sum(is_edit_failed), 0),
            ).where(
                Generation.deleted_at.is_(None),
                Generation.created_at >= start_at,
            )
        )
    ).one()
    total, failed, gen_total, gen_failed, edit_total, edit_failed = (int(x or 0) for x in row)
    return AdminPeriodOut(
        total=_count_out(total, failed),
        generate=_count_out(gen_total, gen_failed),
        edit=_count_out(edit_total, edit_failed),
    )


@router.post("/elevate", response_model=AdminSessionOut)
async def elevate_admin(
    payload: AdminElevateRequest,
    response: Response,
    user: User = Depends(current_user),
    settings: Settings = Depends(get_settings),
) -> AdminSessionOut:
    if not is_admin(user, settings):
        raise_http("forbidden", "你没有管理员权限", status_code=403)
    if not settings.admin_elevation_secret:
        raise_http("forbidden", "管理员二次验证未配置", status_code=403)
    if not verify_admin_secret(payload.secret, settings):
        logger.warning(
            '{"event":"admin_elevate_failed","user_id":"%s","work_id":"%s"}',
            user.id,
            user.work_id,
        )
        raise_http("forbidden", "管理员口令错误", status_code=403)

    issue_admin_cookie(response, user.id, settings)
    logger.info(
        '{"event":"admin_elevated","user_id":"%s","work_id":"%s"}',
        user.id,
        user.work_id,
    )
    return AdminSessionOut(is_admin=True, is_admin_elevated=True)


@router.post("/lock", status_code=status.HTTP_204_NO_CONTENT)
async def lock_admin(
    response: Response,
    _user: User = Depends(current_user),
    settings: Settings = Depends(get_settings),
) -> Response:
    clear_admin_cookie(response, settings)
    response.status_code = status.HTTP_204_NO_CONTENT
    return response


@router.get("/stats", response_model=AdminStatsOut)
async def get_admin_stats(
    _admin: User = Depends(current_admin),
    session: AsyncSession = Depends(get_session),
) -> AdminStatsOut:
    now = _utcnow()
    today_start, month_start = _period_starts(now)
    today = await _period_since(session, today_start)
    month = await _period_since(session, month_start)
    last_7_days = await _last_7_days(session, today_start)

    failed_case = case((Generation.status == "failed", 1), else_=0)
    gen_case = case((Generation.action == "generate", 1), else_=0)
    edit_case = case((Generation.action == "edit", 1), else_=0)
    top_user_rows = (
        await session.execute(
            select(
                User.id,
                User.work_id,
                User.name,
                func.count(Generation.id).label("total"),
                func.coalesce(func.sum(failed_case), 0).label("failed"),
                func.coalesce(func.sum(gen_case), 0).label("generate"),
                func.coalesce(func.sum(edit_case), 0).label("edit"),
            )
            .join(Generation, Generation.user_id == User.id)
            .where(
                Generation.deleted_at.is_(None),
                Generation.created_at >= month_start,
            )
            .group_by(User.id, User.work_id, User.name)
            .order_by(func.count(Generation.id).desc(), User.work_id.asc())
            .limit(10)
        )
    ).all()

    top_users = [
        AdminTopUserOut(
            user_id=row.id,
            work_id=row.work_id,
            name=row.name,
            total=int(row.total or 0),
            failed=int(row.failed or 0),
            generate=int(row.generate or 0),
            edit=int(row.edit or 0),
        )
        for row in top_user_rows
    ]

    recent_failure_rows = (
        await session.execute(
            select(Generation, User)
            .join(User, User.id == Generation.user_id)
            .where(
                Generation.deleted_at.is_(None),
                Generation.status == "failed",
            )
            .order_by(Generation.completed_at.desc(), Generation.created_at.desc())
            .limit(50)
        )
    ).all()

    recent_failures = [
        AdminFailureOut(
            generation_id=gen.id,
            user_id=user.id,
            work_id=user.work_id,
            name=user.name,
            action=gen.action,  # type: ignore[arg-type]
            error_code=gen.error_code,
            error_message=gen.error_message,
            created_at=gen.created_at,
            completed_at=gen.completed_at,
        )
        for gen, user in recent_failure_rows
    ]

    return AdminStatsOut(
        today=today,
        month=month,
        last_7_days=last_7_days,
        top_users=top_users,
        recent_failures=recent_failures,
    )


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


@router.get("/gallery", response_model=AdminGalleryPageOut)
async def get_admin_gallery(
    cursor: Optional[str] = Query(default=None),
    page_size: int = Query(default=24, ge=1, le=60),
    user_id: Optional[str] = Query(default=None),
    action: Optional[str] = Query(default=None),
    status: Optional[str] = Query(default=None),
    _admin: User = Depends(current_admin),
    session: AsyncSession = Depends(get_session),
) -> AdminGalleryPageOut:
    if action is not None and action not in {"generate", "edit"}:
        raise_http("invalid_input", "action 必须是 generate 或 edit")
    if status is not None and status not in {"pending", "running", "completed", "failed"}:
        raise_http("invalid_input", "status 取值无效")

    cursor_dt = _parse_cursor(cursor)

    stmt = (
        select(Generation, User)
        .join(User, User.id == Generation.user_id)
        .where(Generation.deleted_at.is_(None))
        .order_by(Generation.created_at.desc())
        .limit(page_size + 1)
    )
    if cursor_dt is not None:
        stmt = stmt.where(Generation.created_at < cursor_dt)
    if user_id:
        stmt = stmt.where(Generation.user_id == user_id)
    if action:
        stmt = stmt.where(Generation.action == action)
    if status:
        stmt = stmt.where(Generation.status == status)

    rows = list((await session.execute(stmt)).all())
    has_more = len(rows) > page_size
    rows = rows[:page_size]

    items: list[AdminGalleryItemOut] = []
    for gen, owner in rows:
        params = json.loads(gen.params)
        out_ids: list[str] = []
        if gen.output_file_ids:
            try:
                out_ids = json.loads(gen.output_file_ids) or []
            except Exception:
                out_ids = []
        first = out_ids[0] if out_ids else None
        items.append(
            AdminGalleryItemOut(
                id=gen.id,
                user_id=owner.id,
                work_id=owner.work_id,
                name=owner.name,
                action=gen.action,  # type: ignore[arg-type]
                status=gen.status,  # type: ignore[arg-type]
                prompt=gen.prompt,
                params=GenerationParamsOut(**params),
                thumbnail_url=f"/api/files/{first}" if first else None,
                output_count=len(out_ids),
                error_code=gen.error_code,
                created_at=gen.created_at,
            )
        )

    next_cursor: Optional[str] = None
    if has_more and rows:
        last_dt = rows[-1][0].created_at
        if last_dt.tzinfo is None:
            last_dt = last_dt.replace(tzinfo=timezone.utc)
        next_cursor = last_dt.isoformat()

    return AdminGalleryPageOut(items=items, next_cursor=next_cursor, has_more=has_more)


async def _bucket_stats(
    session: AsyncSession,
    *,
    kind: str,
    retention_days: int,
    now: datetime,
) -> AdminStorageBucketOut:
    cutoff = now - timedelta(days=retention_days)
    expired_case = case((FileModel.created_at < cutoff, 1), else_=0)
    row = (
        await session.execute(
            select(
                func.count(FileModel.id),
                func.coalesce(func.sum(FileModel.size_bytes), 0),
                func.min(FileModel.created_at),
                func.coalesce(func.sum(expired_case), 0),
            ).where(FileModel.kind == kind, FileModel.deleted_at.is_(None))
        )
    ).one()
    count, size_bytes, oldest_at, expired_count = row
    return AdminStorageBucketOut(
        file_count=int(count or 0),
        bytes=int(size_bytes or 0),
        oldest_at=oldest_at,
        expired_count=int(expired_count or 0),
        retention_days=retention_days,
    )


@router.get("/users", response_model=list[AdminUserOut])
async def search_admin_users(
    q: Optional[str] = Query(default=None, max_length=64),
    limit: int = Query(default=20, ge=1, le=50),
    _admin: User = Depends(current_admin),
    session: AsyncSession = Depends(get_session),
) -> list[AdminUserOut]:
    stmt = select(User).order_by(
        User.last_login_at.desc().nulls_last(), User.work_id.asc()
    )
    if q and q.strip():
        norm = f"%{q.strip().lower()}%"
        stmt = stmt.where(
            or_(
                func.lower(User.work_id).like(norm),
                func.lower(User.name).like(norm),
            )
        )
    stmt = stmt.limit(limit)
    rows = list((await session.execute(stmt)).scalars().all())
    return [
        AdminUserOut(
            id=u.id,
            work_id=u.work_id,
            name=u.name,
            last_login_at=u.last_login_at,
        )
        for u in rows
    ]


@router.get("/storage", response_model=AdminStorageOut)
async def get_admin_storage(
    _admin: User = Depends(current_admin),
    session: AsyncSession = Depends(get_session),
) -> AdminStorageOut:
    now = _utcnow()
    uploads = await _bucket_stats(
        session, kind="upload", retention_days=UPLOADS_RETENTION_DAYS, now=now
    )
    outputs = await _bucket_stats(
        session, kind="output", retention_days=OUTPUTS_RETENTION_DAYS, now=now
    )
    return AdminStorageOut(
        uploads=uploads,
        outputs=outputs,
        cleanup_implemented=False,
    )


@router.get("/generations/{generation_id}", response_model=AdminGenerationDetailOut)
async def get_admin_generation_detail(
    generation_id: str,
    _admin: User = Depends(current_admin),
    session: AsyncSession = Depends(get_session),
) -> AdminGenerationDetailOut:
    row = (
        await session.execute(
            select(Generation, User)
            .join(User, User.id == Generation.user_id)
            .where(Generation.id == generation_id, Generation.deleted_at.is_(None))
        )
    ).first()
    if row is None:
        raise_http("not_found", "任务不存在", status_code=404)
    gen, owner = row

    params = json.loads(gen.params)

    out_ids: list[str] = []
    if gen.output_file_ids:
        try:
            out_ids = json.loads(gen.output_file_ids) or []
        except Exception:
            out_ids = []

    ref_ids: list[str] = []
    if gen.reference_file_ids:
        try:
            ref_ids = json.loads(gen.reference_file_ids) or []
        except Exception:
            ref_ids = []

    file_ids: list[str] = list(out_ids) + list(ref_ids)

    file_map: dict[str, FileModel] = {}
    if file_ids:
        files = list(
            (
                await session.execute(select(FileModel).where(FileModel.id.in_(file_ids)))
            )
            .scalars()
            .all()
        )
        file_map = {f.id: f for f in files}

    output_refs: list[FileRefOut] = []
    for fid in out_ids:
        f = file_map.get(fid)
        if f is None:
            continue
        output_refs.append(
            FileRefOut(file_id=f.id, url=f"/api/files/{f.id}", width=f.width, height=f.height)
        )

    reference_refs: list[FileRefOut] = []
    for fid in ref_ids:
        rf = file_map.get(fid)
        if rf is None:
            continue
        reference_refs.append(
            FileRefOut(
                file_id=rf.id, url=f"/api/files/{rf.id}", width=rf.width, height=rf.height
            )
        )

    return AdminGenerationDetailOut(
        id=gen.id,
        user_id=owner.id,
        work_id=owner.work_id,
        name=owner.name,
        action=gen.action,  # type: ignore[arg-type]
        status=gen.status,  # type: ignore[arg-type]
        prompt=gen.prompt,
        params=GenerationParamsOut(**params),
        revised_prompt=gen.revised_prompt,
        reference_files=reference_refs,
        output_files=output_refs,
        error_code=gen.error_code,
        error_message=gen.error_message,
        created_at=gen.created_at,
        completed_at=gen.completed_at,
    )
