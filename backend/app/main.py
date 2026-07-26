import logging
import json
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.config import get_settings
from app.errors import AppError, error_response
from app.routers import admin, agent_sessions, auth, files, generations, health, uploads

class JsonLogFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "time": self.formatTime(record, self.datefmt),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
        }
        if record.exc_info:
            payload["exc_info"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False)


handler = logging.StreamHandler()
handler.setFormatter(JsonLogFormatter())
logging.basicConfig(level=logging.INFO, handlers=[handler], force=True)
logger = logging.getLogger("posterforge")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    settings = get_settings()
    logger.info(
        "posterforge starting; data_dir=%s apimart=%s admins=%s",
        settings.upload_dir.parent,
        settings.apimart_base_url,
        sorted(settings.admin_work_id_set),
    )
    
    # 启动时重置残留的处于 pending 或 running 状态的任务为 failed
    from app.db import SessionLocal
    from app.models import Generation
    from sqlalchemy import update
    from datetime import datetime, timezone
    try:
        async with SessionLocal() as db:
            result = await db.execute(
                update(Generation)
                .where(Generation.status.in_(["pending", "running"]))
                .values(
                    status="failed",
                    error_code="server_restarted",
                    error_message="服务器重启，任务执行中断，请重试。",
                    completed_at=datetime.now(timezone.utc)
                )
            )
            await db.commit()
            row_count = result.rowcount
            if row_count > 0:
                logger.info("Reset %d stuck generations to 'failed' on startup", row_count)
    except Exception:
        logger.exception("Failed to reset stuck generations on startup")

    yield


def create_app() -> FastAPI:
    app = FastAPI(title="Poster Forge API", version="0.1.0", lifespan=lifespan)

    app.include_router(health.router)
    app.include_router(auth.router)
    app.include_router(auth.me_router)
    app.include_router(admin.router)
    app.include_router(uploads.router)
    app.include_router(generations.router)
    app.include_router(generations.history_router)
    app.include_router(files.router)
    app.include_router(agent_sessions.router)

    @app.exception_handler(AppError)
    async def _app_error_handler(_request: Request, exc: AppError) -> JSONResponse:
        return error_response(exc.code, exc.message, exc.status_code)

    @app.exception_handler(RequestValidationError)
    async def _validation_handler(_request: Request, exc: RequestValidationError) -> JSONResponse:
        return error_response("invalid_input", "请求参数有误", 422)

    return app


app = create_app()
