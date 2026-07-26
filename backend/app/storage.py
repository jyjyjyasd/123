"""Local-disk file storage. Records each saved file in the `files` table.

PRD §4.6 path layout:
  data/uploads/{user_id}/{yyyy}/{mm}/{uuid}.{ext}
  data/outputs/{user_id}/{yyyy}/{mm}/{uuid}_{i}.{ext}
"""
from __future__ import annotations

import io
import logging
import uuid as _uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from PIL import Image
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models import File

logger = logging.getLogger("posterforge.storage")


_MIME_TO_EXT = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/webp": "webp",
}


def _ext_for(mime: str) -> str:
    return _MIME_TO_EXT.get(mime.lower(), "png")


def _today() -> tuple[str, str]:
    now = datetime.now(timezone.utc)
    return f"{now.year:04d}", f"{now.month:02d}"


def _read_dimensions(data: bytes) -> tuple[Optional[int], Optional[int]]:
    try:
        with Image.open(io.BytesIO(data)) as im:
            return im.width, im.height
    except Exception:  # noqa: BLE001
        return None, None


async def save_output(
    session: AsyncSession,
    *,
    user_id: str,
    data: bytes,
    mime: str,
    index: int,
) -> File:
    settings = get_settings()
    yyyy, mm = _today()
    file_uuid = str(_uuid.uuid4())
    ext = _ext_for(mime)
    filename = f"{file_uuid}_{index}.{ext}"
    rel_dir = Path("outputs") / user_id / yyyy / mm
    abs_dir = settings.upload_dir.parent / rel_dir
    abs_dir.mkdir(parents=True, exist_ok=True)
    abs_path = abs_dir / filename
    abs_path.write_bytes(data)

    width, height = _read_dimensions(data)

    file_row = File(
        user_id=user_id,
        kind="output",
        path=str(rel_dir / filename),
        mime_type=mime,
        size_bytes=len(data),
        width=width,
        height=height,
    )
    session.add(file_row)
    await session.flush()
    logger.info(
        '{"event":"file_saved","kind":"output","user_id":"%s","file_id":"%s","bytes":%d}',
        user_id, file_row.id, len(data),
    )
    return file_row


async def save_upload(
    session: AsyncSession,
    *,
    user_id: str,
    data: bytes,
    mime: str,
) -> File:
    settings = get_settings()
    yyyy, mm = _today()
    file_uuid = str(_uuid.uuid4())
    ext = _ext_for(mime)
    filename = f"{file_uuid}.{ext}"
    rel_dir = Path("uploads") / user_id / yyyy / mm
    abs_dir = settings.upload_dir.parent / rel_dir
    abs_dir.mkdir(parents=True, exist_ok=True)
    abs_path = abs_dir / filename
    abs_path.write_bytes(data)

    width, height = _read_dimensions(data)

    file_row = File(
        user_id=user_id,
        kind="upload",
        path=str(rel_dir / filename),
        mime_type=mime,
        size_bytes=len(data),
        width=width,
        height=height,
    )
    session.add(file_row)
    await session.flush()
    return file_row


def absolute_path_for(file: File) -> Path:
    settings = get_settings()
    return settings.upload_dir.parent / file.path
