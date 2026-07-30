from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, Text, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


def _uuid() -> str:
    return str(uuid.uuid4())


def _now() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    work_id: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)
    last_login_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)


class Generation(Base):
    __tablename__ = "generations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    action: Mapped[str] = mapped_column(String(16), nullable=False)  # 'generate' | 'edit'
    status: Mapped[str] = mapped_column(String(16), nullable=False)  # pending|running|completed|failed
    prompt: Mapped[str] = mapped_column(Text, nullable=False)
    params: Mapped[str] = mapped_column(Text, nullable=False)  # JSON {size}（v0.8+；老历史含 quality/n）
    # 1–5 个参考图的 file id 数组（JSON 文本）。无参考图时为 NULL 或空数组。
    # 见 alembic b1c2d3e4f567：从 reference_file_id 单 FK 迁移而来。
    reference_file_ids: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    output_file_ids: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON array
    revised_prompt: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    error_code: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    deleted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        Index(
            "idx_gen_user_created",
            "user_id",
            "created_at",
            sqlite_where=text("deleted_at IS NULL"),
        ),
        Index(
            "idx_gen_status",
            "status",
            sqlite_where=text("status IN ('pending', 'running')"),
        ),
    )


class File(Base):
    __tablename__ = "files"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    kind: Mapped[str] = mapped_column(String(16), nullable=False)  # 'upload' | 'output'
    path: Mapped[str] = mapped_column(Text, nullable=False)  # relative to backend/data/
    mime_type: Mapped[str] = mapped_column(String(64), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    width: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    height: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)
    deleted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)


class AgentSession(Base):
    """AI 海报 Agent 对话会话。

    设计要点：
    - clarify_messages / stream_a / stream_b 作为 JSON blob 存储，与 prd 的 GenerationSession 字段一一对应。
    - generation_id 外键关联 Generation 表，确保最终生成图片自动出现在历史/Admin 页面。
    - extended_images 存多尺寸延伸结果（JSON 数组），每项含 ratio / generation_id / url。
    """

    __tablename__ = "agent_sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False, index=True)

    # 状态机：init → clarifying → prompting → generating → review → done | failed
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="init")

    # 基础参数（对应 prd GenerationSession 同名字段）
    aspect_ratio: Mapped[str] = mapped_column(String(16), nullable=False, default="1:1")
    resolution: Mapped[str] = mapped_column(String(4), nullable=False, default="1k")  # 1k|2k|4k

    # Agent 对话历史（JSON array of {id, role, content, timestamp}）
    clarify_messages: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # 双流拆解结果
    # stream_a: {copy, layout_notes, layout_prompt, layout_recommendations?}
    stream_a: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # stream_b: {visual_description, denoising_strength, style_reference_image?,
    #            layout_reference_image?, subject_reference_image?, subject_materials?,
    #            style_recommendations?}
    stream_b: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # 编译后的最终提示词
    final_prompt: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    negative_prompt: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # 关联最终生成的 Generation 记录（主海报）
    generation_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("generations.id"), nullable=True
    )
    # 主海报生成时的比例与清晰度（延伸时用于区分主图/延伸图）
    primary_ratio: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)
    primary_resolution: Mapped[Optional[str]] = mapped_column(String(4), nullable=True)

    # 多尺寸延伸结果（JSON array of {ratio, generation_id, url, resolution, created_at}）
    extended_images: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # 历史版本归档（JSON array of {ratio, generation_id, url, resolution, source, archived_at}）
    archived_images: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # 错误信息（failed 状态时）
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # 新增：prompting 阶段从 stream_a/stream_b 聚合的结构化设计数据
    # 格式: {copy, visual, layout, recommendations, missing_fields}
    # clarifying 阶段为 null；老会话为 null（前端兜底读 stream_a/stream_b）
    design_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, onupdate=_now, nullable=False
    )
    deleted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        Index("idx_agent_user_created", "user_id", "created_at"),
    )
