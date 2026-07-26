import logging

from fastapi import APIRouter, Depends, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import (
    clear_admin_cookie,
    clear_session_cookie,
    current_user,
    is_admin,
    is_admin_elevated,
    issue_session_cookie,
    normalize_work_id,
    upsert_user,
    validate_work_id,
)
from app.config import Settings, get_settings
from app.db import get_session
from app.models import User
from app.schemas import LoginRequest, UserOut

logger = logging.getLogger("posterforge.auth")

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=UserOut)
async def login(
    payload: LoginRequest,
    response: Response,
    session: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings),
) -> UserOut:
    work_id = normalize_work_id(payload.work_id)
    validate_work_id(work_id)
    user = await upsert_user(session, work_id)
    clear_admin_cookie(response, settings)
    issue_session_cookie(response, user.id, settings)
    return UserOut(
        id=user.id,
        work_id=user.work_id,
        name=user.name,
        is_admin=is_admin(user, settings),
        is_admin_elevated=False,
    )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(response: Response, settings: Settings = Depends(get_settings)) -> Response:
    clear_admin_cookie(response, settings)
    clear_session_cookie(response, settings)
    response.status_code = status.HTTP_204_NO_CONTENT
    return response


me_router = APIRouter(prefix="/api", tags=["auth"])


@me_router.get("/me", response_model=UserOut)
async def me(
    request: Request,
    user: User = Depends(current_user),
    settings: Settings = Depends(get_settings),
) -> UserOut:
    admin_flag = is_admin(user, settings)
    return UserOut(
        id=user.id,
        work_id=user.work_id,
        name=user.name,
        is_admin=admin_flag,
        is_admin_elevated=is_admin_elevated(request, user, settings) if admin_flag else False,
    )
