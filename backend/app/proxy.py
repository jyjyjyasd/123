"""HTTP client for apimart gpt-image-2 (async task model).

contract（CLAUDE.md §7）:
- 上传参考图：POST /v1/uploads/images (multipart) → { url, ... }
  - 返回的 url 72h 有效，可直接用作 image_urls 元素
- 提交：POST /v1/images/generations (JSON)
  - 文生图：仅 prompt + size
  - 图生图：附加 image_urls 字符串数组，元素为 apimart upload 返回的 url
- 提交响应：{ code, data: [{ status: "submitted", task_id }] }
- 轮询：GET /v1/tasks/{task_id}
- 完成响应：data.result.images[0].url[0]
- 下载稳定 URL（apimart 已镜像到 R2），存到我们自己的本地磁盘
"""
from __future__ import annotations

import asyncio
import json as _json
import logging
import time
from dataclasses import dataclass
from typing import Any, Optional

import httpx

from app.config import Settings, get_settings
from app.errors import AppError

logger = logging.getLogger("posterforge.proxy")


def json_dumps(s: str) -> str:
    return _json.dumps(s, ensure_ascii=False)


@dataclass
class ImageResult:
    bytes_: bytes
    mime: str
    revised_prompt: Optional[str]  # apimart 不返回；保留字段方便上层无脑赋值


def _new_client(settings: Settings) -> httpx.AsyncClient:
    return httpx.AsyncClient(
        base_url=settings.apimart_base_url.rstrip("/"),
        headers={"Authorization": f"Bearer {settings.apimart_api_key}"},
        timeout=httpx.Timeout(settings.request_timeout_seconds),
    )


def _classify_status_error(exc: httpx.HTTPStatusError) -> AppError:
    body: dict = {}
    try:
        body = exc.response.json()
    except Exception:
        body = {"raw": exc.response.text[:500]}
    err = body.get("error") or {}
    upstream_code = (err.get("code") or "")
    if isinstance(upstream_code, int):
        upstream_code = str(upstream_code)
    upstream_code = upstream_code.lower()
    upstream_msg = err.get("message") or exc.response.text[:200] or "upstream error"
    logger.warning(
        '{"event":"upstream_error","status":%d,"upstream_code":"%s","upstream_msg":%s}',
        exc.response.status_code, upstream_code, json_dumps(upstream_msg),
    )

    status = exc.response.status_code
    text = (upstream_msg or "").lower()

    if status == 400 and ("content" in text or "审核" in upstream_msg or "敏感" in upstream_msg):
        return AppError("content_policy", "Prompt 触发了内容审核", status_code=400)
    if status == 402:
        return AppError("payment_required", "代理账号余额不足，请联系管理员充值", status_code=402)
    if status == 429:
        return AppError("rate_limited", "请求过于频繁，请稍后再试", status_code=429)
    if 500 <= status < 600:
        return AppError("upstream_error", f"上游 {status}: {upstream_msg}", status_code=502)
    if status == 401:
        return AppError("upstream_error", "代理 API key 无效", status_code=502)
    if status == 400:
        return AppError("invalid_input", upstream_msg, status_code=400)
    if status == 404:
        return AppError("not_found", upstream_msg, status_code=404)
    return AppError("upstream_error", f"上游 {status}: {upstream_msg}", status_code=502)


# Retry budget: 429/5xx/network 4 attempts (1+2+4=7s backoff)；timeout 2 attempts。
_MAX_ATTEMPTS_TRANSIENT = 4
_MAX_ATTEMPTS_TIMEOUT = 2


async def _request_with_retry(
    settings: Settings,
    method: str,
    path: str,
    *,
    json: Optional[dict] = None,
) -> httpx.Response:
    last_exc: Optional[Exception] = None
    for attempt in range(_MAX_ATTEMPTS_TRANSIENT):
        t0 = time.monotonic()
        try:
            async with _new_client(settings) as client:
                resp = await client.request(method, path, json=json)
                resp.raise_for_status()
                if attempt > 0:
                    logger.info(
                        '{"event":"apimart_retry_recovered","path":"%s","attempt":%d,"elapsed_s":%.2f}',
                        path, attempt, time.monotonic() - t0,
                    )
                return resp
        except httpx.HTTPStatusError as e:
            last_exc = e
            status = e.response.status_code
            elapsed = time.monotonic() - t0
            retriable = status == 429 or 500 <= status < 600
            if retriable and attempt < _MAX_ATTEMPTS_TRANSIENT - 1:
                delay = 2.0 * (2 ** attempt) if status == 429 else float(1 << attempt)
                logger.warning(
                    '{"event":"apimart_retrying","path":"%s","attempt":%d,"reason":"http_%d","elapsed_s":%.2f,"delay_s":%.1f}',
                    path, attempt, status, elapsed, delay,
                )
                await asyncio.sleep(delay)
                continue
            raise _classify_status_error(e) from e
        except (httpx.TimeoutException, httpx.NetworkError, OSError) as e:
            last_exc = e
            elapsed = time.monotonic() - t0
            is_timeout = isinstance(e, httpx.TimeoutException)
            max_attempts = _MAX_ATTEMPTS_TIMEOUT if is_timeout else _MAX_ATTEMPTS_TRANSIENT
            if attempt < max_attempts - 1:
                delay = float(1 << attempt)
                logger.warning(
                    '{"event":"apimart_retrying","path":"%s","attempt":%d,"reason":"%s","exc":%s,"elapsed_s":%.2f,"delay_s":%.1f}',
                    path, attempt, type(e).__name__, json_dumps(repr(e)[:200]), elapsed, delay,
                )
                await asyncio.sleep(delay)
                continue
            logger.warning(
                '{"event":"apimart_giveup","path":"%s","attempts":%d,"reason":"%s","exc":%s,"elapsed_s":%.2f}',
                path, attempt + 1, type(e).__name__, json_dumps(repr(e)[:200]), elapsed,
            )
            if is_timeout:
                raise AppError("timeout", "代理 API 超时", status_code=504) from e
            raise AppError("upstream_error", f"代理网络错误: {e!s}"[:200], status_code=502) from e
    raise AppError("unknown", str(last_exc) if last_exc else "unknown")


_UPLOAD_EXT_BY_MIME = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
}


async def upload_reference_to_apimart(
    data: bytes,
    mime: str,
    *,
    filename: Optional[str] = None,
    settings: Optional[Settings] = None,
) -> str:
    """把参考图字节传给 apimart 的 /v1/uploads/images，拿到 72h 有效的 url。

    取代 v0.8 早期的 base64 data URI 内联方案 — 后者随 apimart 文档变更被弃用，
    且内存峰值约 4× 原图。改走专用上传端点后请求体小一个量级。
    """
    settings = settings or get_settings()
    mime = (mime or "").lower() or "image/png"
    ext = _UPLOAD_EXT_BY_MIME.get(mime, "png")
    name = filename or f"ref.{ext}"

    async with _new_client(settings) as client:
        # 仅在网络/5xx/429 上重试；上传是有状态写入，4xx 直接抛
        last_exc: Optional[Exception] = None
        for attempt in range(_MAX_ATTEMPTS_TRANSIENT):
            t0 = time.monotonic()
            try:
                resp = await client.post(
                    "/v1/uploads/images",
                    files={"file": (name, data, mime)},
                )
                resp.raise_for_status()
                body = resp.json()
                url = body.get("url")
                if not isinstance(url, str) or not url:
                    raise AppError("upstream_error", "apimart 上传未返回 url")
                logger.info(
                    '{"event":"apimart_upload","bytes":%d,"mime":"%s","elapsed_s":%.2f}',
                    len(data), mime, time.monotonic() - t0,
                )
                return url
            except httpx.HTTPStatusError as e:
                last_exc = e
                status = e.response.status_code
                if (status == 429 or 500 <= status < 600) and attempt < _MAX_ATTEMPTS_TRANSIENT - 1:
                    delay = 2.0 * (2 ** attempt) if status == 429 else float(1 << attempt)
                    logger.warning(
                        '{"event":"apimart_upload_retrying","attempt":%d,"reason":"http_%d","delay_s":%.1f}',
                        attempt, status, delay,
                    )
                    await asyncio.sleep(delay)
                    continue
                raise _classify_status_error(e) from e
            except (httpx.TimeoutException, httpx.NetworkError, OSError) as e:
                last_exc = e
                is_timeout = isinstance(e, httpx.TimeoutException)
                max_attempts = _MAX_ATTEMPTS_TIMEOUT if is_timeout else _MAX_ATTEMPTS_TRANSIENT
                if attempt < max_attempts - 1:
                    delay = float(1 << attempt)
                    logger.warning(
                        '{"event":"apimart_upload_retrying","attempt":%d,"reason":"%s","delay_s":%.1f}',
                        attempt, type(e).__name__, delay,
                    )
                    await asyncio.sleep(delay)
                    continue
                if is_timeout:
                    raise AppError("timeout", "上传参考图到代理超时", status_code=504) from e
                raise AppError("upstream_error", f"上传参考图网络错误: {e!s}"[:200], status_code=502) from e
        raise AppError("unknown", str(last_exc) if last_exc else "upload retry exhausted")


# 9:32 is mapped to "1:3" which is natively supported by apimart.


def _map_apimart_size(size: str, resolution: str = "1k") -> str:
    s = size.upper()
    if s == "A4":
        return "3:4"
    if s == "A4_HORIZONTAL":
        return "4:3"
    if s == "BANNER":
        return "3:1"
    # 9:32 -> ratio string (apimart rejects "9:32" ratio string, map to supported "1:3" ratio)
    if s == "9:32":
        return "1:3"
    return size.lower()


# edit（图生图）模式下 apimart 仅接受的像素尺寸白名单
_EDIT_VALID_SIZES = {"1024x1024", "1536x1024", "1024x1536", "auto"}

# 非原生比例 → edit 模式下的最近像素尺寸映射
_EDIT_RATIO_TO_PIXEL: dict[str, str] = {
    "4:3":  "1536x1024",
    "3:4":  "1024x1536",
    "16:9": "1536x1024",
    "9:16": "1024x1536",
    "3:2":  "1536x1024",
    "2:3":  "1024x1536",
    "9:32": "1024x1536",
    "1:3":  "1024x1536",
    "1:1":  "1024x1024",
}


def _map_size_for_edit(size: str) -> str:
    """图生图模式下，将比例字符串映射为 apimart edit API 实际接受的像素尺寸。"""
    mapped = _map_apimart_size(size)
    if mapped in _EDIT_VALID_SIZES:
        return mapped
    return _EDIT_RATIO_TO_PIXEL.get(mapped, "1024x1024")


async def submit_image_task(
    *,
    prompt: str,
    size: str,
    resolution: str = "1k",
    image_urls: Optional[list[str]] = None,
    settings: Optional[Settings] = None,
) -> str:
    """提交一个图像生成任务，返回 task_id。

    - image_urls 为空 → 文生图
    - image_urls 非空 → 图生图（每个 url 是 apimart 自家上传端点返回的 72h 链接）
    - size 'auto' 仅图生图允许；底层 apimart 接受 auto 作为 size 值
    - resolution 控制 apimart 计费 / 输出像素档位（1k/2k/4k）。size='auto' 时
      apimart 文档说 resolution 仍然会被解析但实际像素跟随参考图 — 安全起见照传
    """
    settings = settings or get_settings()
    if image_urls:
        mapped_size = _map_size_for_edit(size)
    else:
        mapped_size = _map_apimart_size(size, resolution)
    payload: dict[str, Any] = {
        "model": "gpt-image-2",
        "prompt": prompt,
        "n": 1,
        "size": mapped_size,
        "resolution": resolution,
    }
    if image_urls:
        payload["image_urls"] = image_urls

    logger.info(
        '{"event":"apimart_submit","size":"%s","mapped_size":"%s","resolution":"%s","ref_count":%d,"prompt_len":%d}',
        size, mapped_size, resolution, len(image_urls or []), len(prompt),
    )
    resp = await _request_with_retry(settings, "POST", "/v1/images/generations", json=payload)
    body = resp.json()
    items = (body or {}).get("data") or []
    if not items:
        raise AppError("upstream_error", "代理返回空 data")
    task_id = items[0].get("task_id")
    if not task_id:
        raise AppError("upstream_error", "代理未返回 task_id")
    return task_id


async def poll_task_until_done(
    task_id: str,
    *,
    settings: Optional[Settings] = None,
) -> list[str]:
    """轮询任务直到 completed / failed / 超时，返回 result.images[0].url 数组。

    文档建议：先等 10–20s 再查，3–5s 间隔，单图 30–60s 完成。
    超过 apimart_poll_max_seconds 抛 timeout。
    """
    settings = settings or get_settings()
    deadline = time.monotonic() + settings.apimart_poll_max_seconds
    # 首次查询前的等待（让上游有时间真正开始处理）
    await asyncio.sleep(settings.apimart_poll_initial_delay_seconds)

    while True:
        resp = await _request_with_retry(settings, "GET", f"/v1/tasks/{task_id}")
        body = resp.json()
        data = body.get("data") or {}
        status = data.get("status")

        if status == "completed":
            result = data.get("result") or {}
            images = result.get("images") or []
            urls: list[str] = []
            for img in images:
                u = img.get("url")
                if isinstance(u, list):
                    urls.extend([x for x in u if x])
                elif isinstance(u, str):
                    urls.append(u)
            if not urls:
                raise AppError("upstream_error", "任务完成但 result.images 为空")
            logger.info(
                '{"event":"apimart_task_done","task_id":"%s","img_count":%d,"actual_time":%s,"cost":%s}',
                task_id, len(urls), data.get("actual_time"), data.get("cost"),
            )
            return urls

        if status == "failed":
            err = (data.get("error") or {}) if isinstance(data.get("error"), dict) else {}
            msg = err.get("message") or "任务失败"
            text = msg.lower()
            if "content" in text or "审核" in msg or "敏感" in msg or "violat" in text:
                raise AppError("content_policy", "Prompt 触发了内容审核", status_code=400)
            raise AppError("upstream_error", f"上游任务失败: {msg}"[:300], status_code=502)

        # submitted / processing / 其它 → 继续等
        if time.monotonic() >= deadline:
            raise AppError("timeout", f"任务 {task_id} 在 {settings.apimart_poll_max_seconds}s 内未完成", status_code=504)
        await asyncio.sleep(settings.apimart_poll_interval_seconds)


async def download_image(url: str, *, settings: Optional[Settings] = None) -> tuple[bytes, str]:
    """从 apimart 返回的稳定 URL 下载图片。

    apimart 已把上游临时签名链接镜像到自家 R2，链接稳定 24h，但建议尽快转存到本地。
    """
    settings = settings or get_settings()
    # 用独立的 httpx client：base_url 不能用，apimart R2 是另一个域
    async with httpx.AsyncClient(timeout=httpx.Timeout(settings.request_timeout_seconds)) as client:
        for attempt in range(_MAX_ATTEMPTS_TRANSIENT):
            try:
                r = await client.get(url)
                r.raise_for_status()
                mime = r.headers.get("content-type", "image/png").split(";")[0].strip()
                return r.content, mime
            except (httpx.TimeoutException, httpx.NetworkError, OSError, httpx.HTTPStatusError) as e:
                if attempt < _MAX_ATTEMPTS_TRANSIENT - 1:
                    delay = float(1 << attempt)
                    logger.warning(
                        '{"event":"download_retrying","attempt":%d,"exc":%s,"delay_s":%.1f}',
                        attempt, json_dumps(repr(e)[:200]), delay,
                    )
                    await asyncio.sleep(delay)
                    continue
                raise AppError("upstream_error", f"下载图片失败: {e!s}"[:200], status_code=502) from e
        raise AppError("unknown", "download retry exhausted")


async def run_image_generation(
    *,
    prompt: str,
    size: str,
    resolution: str = "1k",
    image_urls: Optional[list[str]] = None,
    settings: Optional[Settings] = None,
) -> list[ImageResult]:
    """端到端：submit → poll → download。jobs 层只调这一个函数。

    参考图上传走 upload_reference_to_apimart，由 jobs 层先并发上传拿到 url 列表，
    再传进来 — 上传出错与 generation 任务失败要区分开，分两个阶段处理。
    """
    settings = settings or get_settings()
    task_id = await submit_image_task(
        prompt=prompt,
        size=size,
        resolution=resolution,
        image_urls=image_urls,
        settings=settings,
    )
    urls = await poll_task_until_done(task_id, settings=settings)
    results: list[ImageResult] = []
    for url in urls:
        data, mime = await download_image(url, settings=settings)
        results.append(ImageResult(bytes_=data, mime=mime, revised_prompt=None))
    return results
