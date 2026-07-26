"""Work-id no-password auth (PRD偏离: §3.1 邮箱域名 → 工号无密码).

Cookie-based session: signed `{user_id}` payload via itsdangerous.
First login auto-registers; subsequent logins update last_login_at.
"""
from __future__ import annotations

import hmac
import logging
import re
from typing import Optional

from fastapi import Depends, Request, Response
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings, get_settings
from app.db import get_session
from app.errors import raise_http
from app.models import User

logger = logging.getLogger("posterforge.auth")

WORK_ID_PATTERN = re.compile(r"^[A-Za-z0-9_.-]{2,32}$")


def _serializer(settings: Settings) -> URLSafeTimedSerializer:
    return URLSafeTimedSerializer(settings.session_secret, salt="pf-session-v1")


def _admin_serializer(settings: Settings) -> URLSafeTimedSerializer:
    return URLSafeTimedSerializer(settings.session_secret, salt="pf-admin-v1")


def issue_session_cookie(response: Response, user_id: str, settings: Settings) -> None:
    token = _serializer(settings).dumps({"uid": user_id})
    response.set_cookie(
        key=settings.session_cookie_name,
        value=token,
        max_age=settings.session_max_age_seconds,
        httponly=True,
        samesite="lax",
        secure=False,  # Phase 1: HTTP only on LAN
        path="/",
    )


def clear_session_cookie(response: Response, settings: Settings) -> None:
    response.delete_cookie(key=settings.session_cookie_name, path="/")


def issue_admin_cookie(response: Response, user_id: str, settings: Settings) -> None:
    token = _admin_serializer(settings).dumps({"uid": user_id})
    response.set_cookie(
        key=settings.admin_session_cookie_name,
        value=token,
        max_age=settings.admin_session_max_age_seconds,
        httponly=True,
        samesite="lax",
        secure=False,
        path="/",
    )


def clear_admin_cookie(response: Response, settings: Settings) -> None:
    response.delete_cookie(key=settings.admin_session_cookie_name, path="/")


def normalize_work_id(raw: str) -> str:
    return raw.strip()


def validate_work_id(work_id: str) -> None:
    if not WORK_ID_PATTERN.match(work_id):
        raise_http(
            "invalid_input",
            "工号格式不对（2~32 位字母/数字/._-）",
            status_code=400,
        )


async def upsert_user(session: AsyncSession, work_id: str) -> User:
    from datetime import datetime, timezone

    existing = (
        await session.execute(select(User).where(User.work_id == work_id))
    ).scalar_one_or_none()

    if existing is None:
        user = User(work_id=work_id, name=work_id, last_login_at=datetime.now(timezone.utc))
        session.add(user)
        await session.flush()
        logger.info('{"event":"user_created","work_id":"%s","user_id":"%s"}', work_id, user.id)
    else:
        existing.last_login_at = datetime.now(timezone.utc)
        user = existing
    await session.commit()
    await session.refresh(user)
    return user


def _decode_session(token: str, settings: Settings) -> Optional[str]:
    try:
        payload = _serializer(settings).loads(
            token, max_age=settings.session_max_age_seconds
        )
        return payload.get("uid") if isinstance(payload, dict) else None
    except (BadSignature, SignatureExpired):
        return None


def _decode_admin_session(token: str, settings: Settings) -> Optional[str]:
    try:
        payload = _admin_serializer(settings).loads(
            token, max_age=settings.admin_session_max_age_seconds
        )
        return payload.get("uid") if isinstance(payload, dict) else None
    except (BadSignature, SignatureExpired):
        return None


async def current_user(
    request: Request,
    session: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings),
) -> User:
    token = request.cookies.get(settings.session_cookie_name)
    if not token:
        raise_http("unauthenticated", "未登录", status_code=401)

    user_id = _decode_session(token, settings)
    if not user_id:
        raise_http("unauthenticated", "登录已过期", status_code=401)

    user = (
        await session.execute(select(User).where(User.id == user_id))
    ).scalar_one_or_none()
    if user is None:
        raise_http("unauthenticated", "用户不存在", status_code=401)
    return user


async def optional_user(
    request: Request,
    session: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings),
) -> Optional[User]:
    token = request.cookies.get(settings.session_cookie_name)
    if not token:
        return None
    user_id = _decode_session(token, settings)
    if not user_id:
        return None
    return (
        await session.execute(select(User).where(User.id == user_id))
    ).scalar_one_or_none()


def is_admin(user: User, settings: Settings) -> bool:
    return user.work_id in settings.admin_work_id_set


def is_admin_elevated(request: Request, user: User, settings: Settings) -> bool:
    if not is_admin(user, settings):
        return False
    token = request.cookies.get(settings.admin_session_cookie_name)
    if not token:
        return False
    admin_user_id = _decode_admin_session(token, settings)
    return admin_user_id == user.id


def verify_admin_secret(secret: str, settings: Settings) -> bool:
    expected = settings.admin_elevation_secret
    if not expected:
        return False
    return hmac.compare_digest(secret, expected)


async def current_admin(
    request: Request,
    user: User = Depends(current_user),
    settings: Settings = Depends(get_settings),
) -> User:
    if not is_admin(user, settings):
        raise_http("forbidden", "你没有管理员权限", status_code=403)
    if not is_admin_elevated(request, user, settings):
        raise_http("forbidden", "需要管理员二次验证", status_code=403)
    return user
