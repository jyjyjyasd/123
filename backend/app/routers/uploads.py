"""Standalone upload endpoint.

Decoupled from /api/generations so the frontend can show real upload
progress per-file at file-pick time. The generations endpoint then takes
just the resulting file_ids. See CLAUDE.md §8 (decoupled-upload entry).
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, UploadFile, File as UploadFileDep, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import current_user
from app.db import get_session
from app.errors import raise_http
from app.models import User
from app.schemas import UploadOut
from app.storage import save_upload

router = APIRouter(prefix="/api/uploads", tags=["uploads"])

# v0.9 起参考图改走 apimart 自家 /v1/uploads/images 端点（multipart），
# 不再 base64 内联，单图上限从 5MB 提到 10MB。apimart 端单文件上限 20MB；
# 留 10MB 余量给 LAN 用户常见的微信原图、屏幕截图。详见 CLAUDE.md §7 / §8。
_MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10MB
_ALLOWED_UPLOAD_MIMES = {"image/png", "image/jpeg", "image/webp", "application/pdf"}


@router.post("", response_model=UploadOut, status_code=status.HTTP_201_CREATED)
async def create_upload(
    file: UploadFile = UploadFileDep(...),
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> UploadOut:
    mime = (file.content_type or "").lower()
    if mime not in _ALLOWED_UPLOAD_MIMES:
        raise_http("invalid_input", "参考图只能是 png/jpg/webp/pdf 格式")
    data = await file.read()
    if len(data) == 0:
        raise_http("invalid_input", "文件为空")
    if len(data) > _MAX_UPLOAD_BYTES:
        raise_http("invalid_input", "单张参考图或文档不能超过 10MB")

    if mime == "application/pdf":
        from app.agent.pdf_helper import render_pdf_page_to_image
        try:
            png_data = render_pdf_page_to_image(data, 0)
            data = png_data
            mime = "image/png"
        except Exception as e:
            raise_http("invalid_input", f"PDF 解析或图片渲染失败: {str(e)}")

    row = await save_upload(session, user_id=user.id, data=data, mime=mime)
    await session.commit()
    return UploadOut(
        file_id=row.id,
        url=f"/api/files/{row.id}",
        width=row.width,
        height=row.height,
    )
