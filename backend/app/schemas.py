from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal, Optional

from pydantic import BaseModel, Field, field_serializer, field_validator


def _ensure_utc_iso(v: Optional[datetime]) -> Optional[str]:
    if v is None:
        return None
    if v.tzinfo is None:
        v = v.replace(tzinfo=timezone.utc)
    return v.isoformat()


# ───── Auth ─────


class LoginRequest(BaseModel):
    work_id: str = Field(min_length=2, max_length=32)


class UserOut(BaseModel):
    id: str
    work_id: str
    name: str
    is_admin: bool
    is_admin_elevated: bool = False


class AdminElevateRequest(BaseModel):
    secret: str = Field(min_length=1, max_length=256)


class AdminSessionOut(BaseModel):
    is_admin: bool
    is_admin_elevated: bool


class AdminCountOut(BaseModel):
    total: int
    failed: int
    failure_rate: float


class AdminPeriodOut(BaseModel):
    total: AdminCountOut
    generate: AdminCountOut
    edit: AdminCountOut


class AdminTopUserOut(BaseModel):
    user_id: str
    work_id: str
    name: str
    total: int
    failed: int
    generate: int
    edit: int


class AdminFailureOut(BaseModel):
    generation_id: str
    user_id: str
    work_id: str
    name: str
    action: Literal["generate", "edit"]
    error_code: Optional[str] = None
    error_message: Optional[str] = None
    created_at: datetime
    completed_at: Optional[datetime] = None

    @field_serializer("created_at", "completed_at")
    def _ser_dt(self, v: Optional[datetime]) -> Optional[str]:
        return _ensure_utc_iso(v)


class AdminTrendDayOut(BaseModel):
    date: str  # YYYY-MM-DD (UTC)
    total: int
    failed: int


class AdminStorageBucketOut(BaseModel):
    file_count: int
    bytes: int
    oldest_at: Optional[datetime]
    expired_count: int
    retention_days: int

    @field_serializer("oldest_at")
    def _ser_dt(self, v: Optional[datetime]) -> Optional[str]:
        return _ensure_utc_iso(v)


class AdminStorageOut(BaseModel):
    uploads: AdminStorageBucketOut
    outputs: AdminStorageBucketOut
    cleanup_implemented: bool


class AdminUserOut(BaseModel):
    id: str
    work_id: str
    name: str
    last_login_at: Optional[datetime]

    @field_serializer("last_login_at")
    def _ser_dt(self, v: Optional[datetime]) -> Optional[str]:
        return _ensure_utc_iso(v)


class AdminStatsOut(BaseModel):
    today: AdminPeriodOut
    month: AdminPeriodOut
    last_7_days: list[AdminTrendDayOut]
    top_users: list[AdminTopUserOut]
    recent_failures: list[AdminFailureOut]


class AdminGalleryItemOut(BaseModel):
    id: str
    user_id: str
    work_id: str
    name: str
    action: Literal["generate", "edit"]
    status: Literal["pending", "running", "completed", "failed"]
    prompt: str
    params: "GenerationParamsOut"
    thumbnail_url: Optional[str] = None
    output_count: int = 0
    error_code: Optional[str] = None
    created_at: datetime

    @field_serializer("created_at")
    def _ser_dt(self, v: datetime) -> str:
        return _ensure_utc_iso(v) or ""


class AdminGalleryPageOut(BaseModel):
    items: list[AdminGalleryItemOut]
    next_cursor: Optional[str] = None
    has_more: bool = False


class AdminGenerationDetailOut(BaseModel):
    id: str
    user_id: str
    work_id: str
    name: str
    action: Literal["generate", "edit"]
    status: Literal["pending", "running", "completed", "failed"]
    prompt: str
    params: "GenerationParamsOut"
    revised_prompt: Optional[str] = None
    reference_files: list["FileRefOut"] = []
    output_files: list["FileRefOut"] = []
    error_code: Optional[str] = None
    error_message: Optional[str] = None
    created_at: datetime
    completed_at: Optional[datetime] = None

    @field_serializer("created_at", "completed_at")
    def _ser_dt(self, v: Optional[datetime]) -> Optional[str]:
        return _ensure_utc_iso(v)


# ───── Generations ─────


class GenerationParamsOut(BaseModel):
    # v0.8 起 size 是 apimart 比例字符串（'1:1' / '16:9' 等）或 'auto'（仅 edit）；
    # resolution 是 apimart 档位 '1k' / '2k' / '4k'。
    # 老历史：v0.7 (像素 'WxH')、v0.1–v0.6 (枚举 square/landscape 等，迁移 c2d3e4f56789
    # 映射成像素) 都通过 size: str 兼容；resolution 在老条目里没有 → Optional。
    # quality / n 自 v0.8 废弃（apimart 不支持）；保留 Optional 读老历史不报错。
    size: str
    resolution: Optional[Literal["1k", "2k", "4k"]] = None
    quality: Optional[Literal["low", "medium", "high", "auto"]] = None
    n: Optional[int] = None


class FileRefOut(BaseModel):
    file_id: str
    url: str
    width: Optional[int] = None
    height: Optional[int] = None


class GenerationOut(BaseModel):
    id: str
    action: Literal["generate", "edit"]
    status: Literal["pending", "running", "completed", "failed"]
    prompt: str
    params: GenerationParamsOut
    revised_prompt: Optional[str] = None
    reference_files: list[FileRefOut] = []
    output_files: list[FileRefOut] = []
    error_code: Optional[str] = None
    error_message: Optional[str] = None
    created_at: datetime
    completed_at: Optional[datetime] = None

    # SQLite stores naive UTC; tag explicit +00:00 so JS Date parses correctly.
    @field_serializer("created_at", "completed_at")
    def _ser_dt(self, v: Optional[datetime]) -> Optional[str]:
        return _ensure_utc_iso(v)


class CreateGenerationOut(BaseModel):
    job_id: str
    status: Literal["pending"]


class UploadOut(BaseModel):
    file_id: str
    url: str
    width: Optional[int] = None
    height: Optional[int] = None


class HistoryItemOut(BaseModel):
    id: str
    action: Literal["generate", "edit"]
    status: Literal["pending", "running", "completed", "failed"]
    prompt: str
    params: GenerationParamsOut
    thumbnail_url: Optional[str] = None
    output_count: int = 0
    error_code: Optional[str] = None
    created_at: datetime

    @field_serializer("created_at")
    def _ser_dt(self, v: datetime) -> str:
        return _ensure_utc_iso(v) or ""


class HistoryPageOut(BaseModel):
    items: list[HistoryItemOut]
    next_cursor: Optional[str] = None
    has_more: bool = False


# ───── Agent ─────


class AgentClarifyMessage(BaseModel):
    id: str
    role: Literal["user", "assistant"]
    content: str
    timestamp: str  # ISO 字符串


class AgentStreamA(BaseModel):
    """文案 + 排版流（stream_a），对应 prd CopyLayoutStream。"""
    copy: str = ""
    layout_notes: str = ""
    layout_prompt: str = ""
    layout_recommendations: Optional[list[dict]] = None
    density: Optional[str] = "中"  # "疏" | "中" | "密"
    poster_strategy: Optional[dict] = None
    quick_replies: Optional[list[str]] = None

    @field_validator("layout_recommendations", mode="before")
    @classmethod
    def _validate_layout_recs(cls, v):
        if not isinstance(v, list):
            return None
        return [item for item in v if isinstance(item, dict)]


class AgentStreamB(BaseModel):
    """主视觉流（stream_b），对应 prd VisualStream。"""
    visual_description: str = ""
    denoising_strength: float = 0.5
    reference_image: Optional[str] = None          # 向下兼容
    style_reference_image: Optional[str] = None
    layout_reference_image: Optional[str] = None
    subject_reference_image: Optional[str] = None
    subject_reference_image_type: Optional[str] = None
    subject_materials: Optional[list[dict]] = None  # [{id, url, type}]
    style_recommendations: Optional[list[dict]] = None

    @field_validator("style_recommendations", mode="before")
    @classmethod
    def _validate_style_recs(cls, v):
        if not isinstance(v, list):
            return None
        return [item for item in v if isinstance(item, dict)]

    @field_validator("subject_materials", mode="before")
    @classmethod
    def _validate_subject_materials(cls, v):
        if not isinstance(v, list):
            return None
        return [item for item in v if isinstance(item, dict)]


class AgentExtendedImage(BaseModel):
    id: Optional[str] = None
    ratio: str
    generation_id: Optional[str] = None
    url: Optional[str] = None
    resolution: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    source: Optional[str] = None
    archived_at: Optional[str] = None
    status: Optional[str] = None
    progress: Optional[int] = None
    error_message: Optional[str] = None


class AgentVersionGroup(BaseModel):
    batch_id: str
    created_at: str
    core_strategy: Optional[str] = None
    text_outline: Optional[str] = None
    primary_image: Optional[AgentExtendedImage] = None
    extended_images: list[AgentExtendedImage] = []


class AgentSessionOut(BaseModel):
    """完整 Agent 会话，前端用于渲染对话区域和画布。"""
    id: str
    user_id: str
    status: str
    aspect_ratio: str
    resolution: str
    clarify_messages: list[AgentClarifyMessage] = []
    stream_a: Optional[AgentStreamA] = None
    stream_b: Optional[AgentStreamB] = None
    final_prompt: Optional[str] = None
    generation_id: Optional[str] = None
    primary_ratio: Optional[str] = None
    primary_resolution: Optional[str] = None
    extended_images: list[AgentExtendedImage] = []
    archived_images: list[AgentVersionGroup] = []
    error_message: Optional[str] = None
    design_json: Optional[dict] = None
    created_at: datetime
    updated_at: datetime

    @field_serializer("created_at", "updated_at")
    def _ser_dt(self, v: datetime) -> str:
        return _ensure_utc_iso(v) or ""


class CreateAgentSessionOut(BaseModel):
    session_id: str
    status: str


class AgentChatRequest(BaseModel):
    message: str
    # 可选：本轮附带的上传文件 id（风格参考图/排版参考图/主体物）
    style_file_id: Optional[str] = None
    layout_file_id: Optional[str] = None
    subject_file_id: Optional[str] = None


class AgentUpdateRequest(BaseModel):
    """前端内联编辑后同步 session 参数。"""
    status: Optional[str] = None
    aspect_ratio: Optional[str] = None
    resolution: Optional[str] = None
    stream_a: Optional[AgentStreamA] = None
    stream_b: Optional[AgentStreamB] = None
    extended_images: Optional[list[AgentExtendedImage]] = None



class AgentExtendRequest(BaseModel):
    ratios: list[str]  # 目标比例列表，如 ["9:16", "16:9"]
    resolution: Optional[str] = None  # 留空则沿用 session.resolution
    base_image_url: Optional[str] = None


class AgentEditRequest(BaseModel):
    edit_description: str
    subject_file_id: str
    size: str        # 当前展示图的比例，如 "9:16"，不读 session.aspect_ratio
    resolution: str  # 当前展示图的清晰度，如 "1k"，不读 session.resolution


class AgentRefreshStylesRequest(BaseModel):
    pass  # 触发信号，无额外参数





class AgentRefreshCopyRequest(BaseModel):
    density: str  # "疏" | "中" | "密"
    current_copy: str
    selected_style_name: Optional[str] = None
    selected_style_desc: Optional[str] = None


class AgentRefreshCopyResponse(BaseModel):
    refreshed_copy: str
