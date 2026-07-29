"""Background job runner for image generation.

FastAPI BackgroundTasks invokes `run_generation_job(generation_id)`,
which opens its own DB session, calls the proxy, persists files,
and updates the Generation row.

v1.0 (Tencent Cloud VOD): 读取本地参考图字节，由 proxy 层使用 VOD ApplyUpload 
上传至媒资获取 FileId，再提交异步生成任务。
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone

from sqlalchemy import select

from app.db import SessionLocal
from app.errors import AppError
from app.models import File, Generation
from app.proxy import run_image_generation
from app.storage import absolute_path_for, save_output

logger = logging.getLogger("posterforge.jobs")


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


async def _load_reference_ids(gen: Generation) -> list[str]:
    if not gen.reference_file_ids:
        return []
    try:
        return json.loads(gen.reference_file_ids) or []
    except Exception:
        return []


async def _load_ref_files(session, ref_ids: list[str]) -> list[tuple[bytes, str]]:
    """读取本地参考图文件，返回 (bytes, mime) 列表，保持原始顺序。"""
    ref_files_rows = list(
        (
            await session.execute(select(File).where(File.id.in_(ref_ids)))
        )
        .scalars()
        .all()
    )
    row_by_id = {f.id: f for f in ref_files_rows}

    result: list[tuple[bytes, str]] = []
    for fid in ref_ids:
        ref = row_by_id.get(fid)
        if ref is None:
            raise AppError("not_found", f"Reference file {fid} not found")
        path = absolute_path_for(ref)
        result.append((path.read_bytes(), ref.mime_type))
    return result


async def run_generation_job(generation_id: str) -> None:
    async with SessionLocal() as session:
        gen = (
            await session.execute(select(Generation).where(Generation.id == generation_id))
        ).scalar_one_or_none()
        if gen is None:
            logger.warning('{"event":"job_missing","gen_id":"%s"}', generation_id)
            return

        gen.status = "running"
        await session.commit()

        params = json.loads(gen.params)
        size = params["size"]
        resolution = params.get("resolution") or "1k"
        prompt = gen.prompt

        started = _utcnow()
        try:
            if gen.action not in {"generate", "edit"}:
                raise AppError("invalid_input", f"Unknown action: {gen.action}")

            ref_ids = await _load_reference_ids(gen)

            if gen.action == "edit" and not ref_ids:
                raise AppError("invalid_input", "Missing reference files for edit mode")

            # 读取本地参考图字节，由 proxy 层上传至 VOD 并换取 FileId
            ref_files: list[tuple[bytes, str]] = []
            if ref_ids:
                ref_files = await _load_ref_files(session, ref_ids)

            results = await run_image_generation(
                prompt=prompt,
                size=size,
                resolution=resolution,
                ref_files=ref_files or None,
            )

            output_ids: list[str] = []
            revised: str | None = None
            for i, result in enumerate(results):
                file_row = await save_output(
                    session,
                    user_id=gen.user_id,
                    data=result.bytes_,
                    mime=result.mime,
                    index=i,
                )
                output_ids.append(file_row.id)
                if revised is None and result.revised_prompt:
                    revised = result.revised_prompt

            gen.output_file_ids = json.dumps(output_ids)
            gen.revised_prompt = revised
            gen.status = "completed"
            gen.completed_at = _utcnow()
            await session.commit()

            elapsed = (_utcnow() - started).total_seconds()
            logger.info(
                '{"event":"job_completed","gen_id":"%s","user_id":"%s","n":%d,"elapsed_s":%.2f}',
                gen.id,
                gen.user_id,
                len(output_ids),
                elapsed,
            )

        except AppError as e:
            gen.status = "failed"
            gen.error_code = e.code
            gen.error_message = e.message
            gen.completed_at = _utcnow()
            await session.commit()
            logger.warning(
                '{"event":"job_failed","gen_id":"%s","user_id":"%s","code":"%s","msg":"%s"}',
                gen.id,
                gen.user_id,
                e.code,
                e.message[:200],
            )
        except Exception as e:  # noqa: BLE001
            gen.status = "failed"
            gen.error_code = "unknown"
            gen.error_message = str(e)[:500]
            gen.completed_at = _utcnow()
            await session.commit()
            logger.exception(
                '{"event":"job_crashed","gen_id":"%s","user_id":"%s"}',
                gen.id,
                gen.user_id,
            )
