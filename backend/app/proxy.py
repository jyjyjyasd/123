"""HTTP client for Tencent Cloud VOD gpt-image-2 (Async Polling API).

contract（AGENTS.md §7）:
- 文生图与图生图：POST CreateAigcImageTask (JSON)
  - 必填：Prompt, ModelName="OG", ModelVersion (image2_low/medium/high)
  - 尺寸：OutputConfig.Resolution (1K/2K/4K), OutputConfig.AspectRatio (比例)
  - 响应异步返回：TaskId
- 轮询：GET DescribeTaskDetail
  - 等待直至状态为 FINISH_SUCCESS 或 FINISH_FAIL
"""
from __future__ import annotations

import asyncio
import base64
import hashlib
import json as _json
import logging
import time
from dataclasses import dataclass
from typing import Any, Optional

import httpx
from tencentcloud.common import credential
from tencentcloud.vod.v20180717 import vod_client, models
from qcloud_cos import CosConfig, CosS3Client

from app.config import Settings, get_settings
from app.errors import AppError

logger = logging.getLogger("posterforge.proxy")


def json_dumps(s: Any) -> str:
    return _json.dumps(s, ensure_ascii=False)


@dataclass
class ImageResult:
    bytes_: bytes
    mime: str
    revised_prompt: Optional[str]


# ── 清晰度与尺寸 ─────────────────────────────────────────────────────

# 前端/DB 使用 1k/2k/4k，Tencent VOD OutputConfig.Resolution 接受 "1K", "2K", "4K"
def _map_resolution(resolution: str) -> str:
    r = resolution.upper()
    if r in {"1K", "2K", "4K"}:
        return r
    return "1K"


# 图生图：apiyi /v1/images/edits 接受的像素尺寸白名单（保留语义防止外部依赖）
_EDIT_VALID_PIXEL_SIZES = {
    "1024x1024", "1536x1024", "1024x1536",
    "768x1024", "1536x1152", "1536x864", "864x1536", "1536x512",
    "auto"
}

# ── 腾讯云 VOD 客户端与 SubAppId 发现 ───────────────────────────────────

_global_sub_app_id: Optional[int] = None

def _get_vod_client(settings: Settings) -> vod_client.VodClient:
    cred = credential.Credential(
        settings.tencentcloud_secret_id,
        settings.tencentcloud_secret_key
    )
    return vod_client.VodClient(cred, settings.tencentcloud_region or "ap-guangzhou")


def _get_sub_app_id(settings: Settings, client: vod_client.VodClient) -> int:
    global _global_sub_app_id
    if _global_sub_app_id is not None:
        return _global_sub_app_id

    if settings.tencentcloud_sub_app_id:
        try:
            _global_sub_app_id = int(settings.tencentcloud_sub_app_id)
            return _global_sub_app_id
        except ValueError:
            pass
    
    # Auto-discover
    try:
        req = models.DescribeSubAppIdsRequest()
        resp = client.DescribeSubAppIds(req)
        sub_apps = resp.SubAppIdInfoSet
        if sub_apps:
            _global_sub_app_id = sub_apps[0].SubAppId
        else:
            _global_sub_app_id = 0
    except Exception as e:
        logger.error(f"Failed to discover SubAppId: {e}")
        _global_sub_app_id = 0
    return _global_sub_app_id


# ── 参考图上传 (VOD 媒资中转) ──────────────────────────────────────────

# 内存级缓存与锁：md5_hash -> (vod_file_id, timestamp)
_VOD_FILE_ID_CACHE: dict[str, tuple[str, float]] = {}
_UPLOAD_LOCKS: dict[str, asyncio.Lock] = {}
_GLOBAL_LOCK = asyncio.Lock()


async def _upload_reference_to_vod_uncached(
    img_bytes: bytes,
    mime: str,
    settings: Settings,
    client: vod_client.VodClient,
    sub_app_id: int
) -> str:
    """物理上传本地字节至腾讯云 VOD，返回 FileId。
    
    使用 asyncio.to_thread 包装阻塞的 SDK 调用。
    """
    def _do_upload() -> str:
        # 1. ApplyUpload
        apply_req = models.ApplyUploadRequest()
        apply_req.SubAppId = sub_app_id
        ext = mime.split("/")[-1]
        if ext == "jpeg":
            ext = "jpg"
        apply_req.MediaType = ext
        
        apply_resp = client.ApplyUpload(apply_req)
        
        # 2. Upload to COS
        cos_config = CosConfig(
            Region=apply_resp.StorageRegion,
            SecretId=apply_resp.TempCertificate.SecretId,
            SecretKey=apply_resp.TempCertificate.SecretKey,
            Token=apply_resp.TempCertificate.Token
        )
        cos_client = CosS3Client(cos_config)
        cos_client.put_object(
            Bucket=apply_resp.StorageBucket,
            Body=img_bytes,
            Key=apply_resp.MediaStoragePath
        )
        
        # 3. CommitUpload
        commit_req = models.CommitUploadRequest()
        commit_req.SubAppId = sub_app_id
        commit_req.VodSessionKey = apply_resp.VodSessionKey
        commit_resp = client.CommitUpload(commit_req)
        return commit_resp.FileId
        
    try:
        return await asyncio.to_thread(_do_upload)
    except Exception as e:
        logger.error(f"Upload reference image failed: {e}")
        raise AppError("upstream_error", f"上传参考图失败: {e!s}"[:200])


async def _upload_reference_to_vod(
    img_bytes: bytes,
    mime: str,
    settings: Settings,
    client: vod_client.VodClient,
    sub_app_id: int
) -> str:
    """带缓存与并发锁的参考图上传。
    
    对相同图片字节码，利用 MD5 唯一标识，仅允许单个协程进行物理上传，其余并发任务复用结果。
    """
    # 1. 计算图片字节的 MD5 唯一标识
    h = hashlib.md5(img_bytes).hexdigest()
    now_ts = time.time()

    # 2. 检查缓存（设定 30 分钟/1800s 有效期）
    async with _GLOBAL_LOCK:
        if h in _VOD_FILE_ID_CACHE:
            file_id, ts = _VOD_FILE_ID_CACHE[h]
            if now_ts - ts < 1800:
                logger.info("VOD reference upload cache hit for hash %s, file_id %s", h, file_id)
                return file_id
            else:
                # 缓存已过期，清理
                del _VOD_FILE_ID_CACHE[h]
        
        # 获取或创建对应 md5 的并发锁
        if h not in _UPLOAD_LOCKS:
            _UPLOAD_LOCKS[h] = asyncio.Lock()
        lock = _UPLOAD_LOCKS[h]

    # 3. 加锁执行物理上传
    async with lock:
        # 双重检查锁（防止排队等待锁的协程在被唤醒后重复上传）
        if h in _VOD_FILE_ID_CACHE:
            file_id, ts = _VOD_FILE_ID_CACHE[h]
            return file_id

        # 调用物理上传
        file_id = await _upload_reference_to_vod_uncached(
            img_bytes=img_bytes,
            mime=mime,
            settings=settings,
            client=client,
            sub_app_id=sub_app_id,
        )

        # 写入缓存
        _VOD_FILE_ID_CACHE[h] = (file_id, time.time())
        return file_id


# ── 任务轮询与图片下载 ───────────────────────────────────────────────

_POLL_INTERVAL_S = 3.0
_MAX_POLL_TIME_S = 180.0

async def _poll_task_until_done(
    task_id: str,
    settings: Settings,
    client: vod_client.VodClient,
    sub_app_id: int
) -> list[str]:
    """轮询 CreateAigcImageTask 结果，返回图片 URL 列表。"""
    
    def _check() -> Optional[list[str]]:
        req = models.DescribeTaskDetailRequest()
        req.TaskId = task_id
        req.SubAppId = sub_app_id
        resp = client.DescribeTaskDetail(req)
        status = resp.Status
        if status == "FINISH":
            # 生图任务的结果在 AigcImageTask.Output
            if hasattr(resp, "AigcImageTask") and resp.AigcImageTask:
                inner_status = getattr(resp.AigcImageTask, "Status", "")
                task_err_code = getattr(resp.AigcImageTask, "ErrCode", 0) or 0
                task_err_msg = getattr(resp.AigcImageTask, "Message", "") or ""
                task_err_ext = getattr(resp.AigcImageTask, "ErrCodeExt", "") or ""
                if inner_status == "FAIL" or task_err_code != 0 or task_err_msg or task_err_ext:
                    err_detail = task_err_msg or task_err_ext or f"ErrCode {task_err_code}"
                    raise AppError("upstream_error", f"任务失败: {err_detail}")
                if hasattr(resp.AigcImageTask, "Output") and resp.AigcImageTask.Output:
                    file_infos = getattr(resp.AigcImageTask.Output, "FileInfos", [])
                    if file_infos:
                        urls = [f.FileUrl for f in file_infos if hasattr(f, "FileUrl") and f.FileUrl]
                        if urls:
                            return urls
            raise AppError("upstream_error", "任务完成但未返回图片 URL")
        elif status == "FAIL":
            err_msg = resp.ErrCodeExt or resp.Message or "Unknown task error"
            if "Policy" in err_msg or "Compliance" in err_msg:
                raise AppError("content_policy", "触发了内容审核", status_code=400)
            raise AppError("upstream_error", f"上游任务失败: {err_msg}")
        return None

    t0 = time.monotonic()
    while time.monotonic() - t0 < _MAX_POLL_TIME_S:
        try:
            urls = await asyncio.to_thread(_check)
            if urls is not None:
                return urls
        except AppError:
            raise
        except Exception as e:
            logger.warning(f"Polling failed: {e}")
        
        await asyncio.sleep(_POLL_INTERVAL_S)

    raise AppError("timeout", "任务轮询超时", status_code=504)


async def _download_url(url: str, *, settings: Optional[Settings] = None) -> tuple[bytes, str]:
    """下载图片 URL。"""
    _settings = settings or get_settings()
    async with httpx.AsyncClient(timeout=httpx.Timeout(_settings.request_timeout_seconds)) as client:
        r = await client.get(url)
        r.raise_for_status()
        mime = r.headers.get("content-type", "image/png").split(";")[0].strip()
        return r.content, mime


# ── 核心生图逻辑 ────────────────────────────────────────────────────────

async def _create_image_task(
    prompt: str,
    size: str,
    resolution: str,
    ref_file_ids: Optional[list[str]],
    settings: Settings,
    client: vod_client.VodClient,
    sub_app_id: int
) -> str:
    """提交 AIGC 生图任务，返回 TaskId。"""
    def _do_submit() -> str:
        req = models.CreateAigcImageTaskRequest()
        
        params: dict[str, Any] = {
            "SubAppId": sub_app_id,
            "ModelName": "OG",
            "ModelVersion": "image2_medium",
            "Prompt": prompt,
            "OutputConfig": {
                "StorageMode": "Temporary",
                "Resolution": _map_resolution(resolution),
                "OutputImageCount": 1
            }
        }
        
        # 尺寸处理
        size_key = size.lower().replace(" ", "")
        if size_key == "auto":
            params["ExtInfo"] = '{"AdditionalParameters": "{\\"size\\":\\"auto\\"}"}'
        elif "x" in size_key:
            params["ExtInfo"] = '{"AdditionalParameters": "{\\"size\\":\\"' + size_key + '\\"}"}'
        else:
            if size_key == "9:32":
                params["OutputConfig"]["AspectRatio"] = "1:3"
            else:
                params["OutputConfig"]["AspectRatio"] = size
            
        # 参考图处理
        if ref_file_ids:
            # Type must be 'File' when using VOD Media
            params["FileInfos"] = [{"Type": "File", "FileId": fid} for fid in ref_file_ids]
            
        req.from_json_string(_json.dumps(params))
        resp = client.CreateAigcImageTask(req)
        return resp.TaskId

    try:
        return await asyncio.to_thread(_do_submit)
    except Exception as e:
        logger.error(f"Submit image task failed: {e}")
        # 这里可做更细致的错误分类
        raise AppError("upstream_error", f"提交生图失败: {e!s}"[:200])


async def generate_image_text_to_image(
    *,
    prompt: str,
    size: str,
    resolution: str = "1k",
    settings: Optional[Settings] = None,
) -> list[ImageResult]:
    """文生图"""
    settings = settings or get_settings()
    client = _get_vod_client(settings)
    sub_app_id = _get_sub_app_id(settings, client)
    
    task_id = await _create_image_task(prompt, size, resolution, None, settings, client, sub_app_id)
    urls = await _poll_task_until_done(task_id, settings, client, sub_app_id)
    
    results = []
    for url in urls:
        img_bytes, mime = await _download_url(url, settings=settings)
        results.append(ImageResult(bytes_=img_bytes, mime=mime, revised_prompt=None))
    return results


async def generate_image_with_references(
    *,
    prompt: str,
    size: str,
    resolution: str = "1k",
    ref_files: list[tuple[bytes, str]],
    settings: Optional[Settings] = None,
) -> list[ImageResult]:
    """图生图（参考图预先上传到 VOD 媒资）"""
    settings = settings or get_settings()
    client = _get_vod_client(settings)
    sub_app_id = _get_sub_app_id(settings, client)
    
    # 1. 上传所有参考图
    upload_tasks = []
    for img_bytes, mime in ref_files:
        upload_tasks.append(_upload_reference_to_vod(img_bytes, mime, settings, client, sub_app_id))
    
    ref_file_ids = await asyncio.gather(*upload_tasks)
    
    # 2. 提交生图任务
    task_id = await _create_image_task(prompt, size, resolution, ref_file_ids, settings, client, sub_app_id)
    
    # 3. 轮询并下载
    urls = await _poll_task_until_done(task_id, settings, client, sub_app_id)
    
    results = []
    for url in urls:
        img_bytes, mime = await _download_url(url, settings=settings)
        results.append(ImageResult(bytes_=img_bytes, mime=mime, revised_prompt=None))
    return results


async def run_image_generation(
    *,
    prompt: str,
    size: str,
    resolution: str = "1k",
    ref_files: Optional[list[tuple[bytes, str]]] = None,
    image_urls: Optional[list[str]] = None,
    settings: Optional[Settings] = None,
) -> list[ImageResult]:
    """统一入口：jobs 层调用此函数。"""
    settings = settings or get_settings()
    if ref_files:
        return await generate_image_with_references(
            prompt=prompt,
            size=size,
            resolution=resolution,
            ref_files=ref_files,
            settings=settings,
        )
    return await generate_image_text_to_image(
        prompt=prompt,
        size=size,
        resolution=resolution,
        settings=settings,
    )
