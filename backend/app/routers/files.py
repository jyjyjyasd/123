from fastapi import APIRouter, Depends, Request
from fastapi.responses import FileResponse, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import current_user, is_admin_elevated
from app.config import Settings, get_settings
from app.db import get_session
from app.errors import raise_http
from app.models import File, User
from app.storage import absolute_path_for

router = APIRouter(prefix="/api/files", tags=["files"])


@router.get("/{file_id}")
async def get_file(
    file_id: str,
    request: Request,
    user: User = Depends(current_user),
    settings: Settings = Depends(get_settings),
    session: AsyncSession = Depends(get_session),
) -> Response:
    file = (
        await session.execute(select(File).where(File.id == file_id))
    ).scalar_one_or_none()
    if file is None or file.deleted_at is not None:
        # 404 — don't leak existence
        raise_http("not_found", "文件不存在", status_code=404)
    if file.user_id != user.id and not is_admin_elevated(request, user, settings):
        # Treat as 404 to avoid telling caller it exists
        raise_http("not_found", "文件不存在", status_code=404)

    abs_path = absolute_path_for(file)
    if not abs_path.exists():
        raise_http("not_found", "文件不存在", status_code=404)

    return FileResponse(
        path=abs_path,
        media_type=file.mime_type,
        headers={"Cache-Control": "private, max-age=300"},
    )
