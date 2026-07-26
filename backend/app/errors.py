"""Unified error codes per PRD §4.7."""

from typing import Literal

from fastapi import HTTPException
from fastapi.responses import JSONResponse

ErrorCode = Literal[
    "invalid_domain",
    "unauthenticated",
    "content_policy",
    "rate_limited",
    "payment_required",  # 402 — apimart 余额不足
    "upstream_error",
    "timeout",
    "invalid_input",
    "not_found",
    "forbidden",
    "unknown",
]


class AppError(Exception):
    def __init__(self, code: ErrorCode, message: str, status_code: int = 400):
        self.code = code
        self.message = message
        self.status_code = status_code
        super().__init__(message)


def error_response(code: ErrorCode, message: str, status_code: int = 400) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={"error": {"code": code, "message": message}},
    )


def raise_http(code: ErrorCode, message: str, status_code: int = 400) -> None:
    raise HTTPException(
        status_code=status_code,
        detail={"error": {"code": code, "message": message}},
    )
