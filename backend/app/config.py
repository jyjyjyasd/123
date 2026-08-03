from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = BACKEND_ROOT / "data"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=BACKEND_ROOT / ".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    tencentcloud_secret_id: str = Field(default="")
    tencentcloud_secret_key: str = Field(default="")
    tencentcloud_sub_app_id: str = Field(default="")
    tencentcloud_region: str = Field(default="ap-guangzhou")

    apimart_base_url: str = Field(default="https://api.apimart.ai")
    apimart_api_key: str = Field(default="")

    database_url: str = Field(
        default=f"sqlite+aiosqlite:///{DATA_DIR / 'posterforge.db'}"
    )

    session_secret: str = Field(default="dev-only-not-for-production-32+chars-pls")
    session_max_age_seconds: int = Field(default=60 * 60 * 24 * 30)  # 30 days
    session_cookie_name: str = Field(default="pf_session")

    admin_work_ids: str = Field(default="")  # CSV
    admin_elevation_secret: str = Field(default="")
    admin_session_cookie_name: str = Field(default="pf_admin")
    admin_session_max_age_seconds: int = Field(default=60 * 60 * 4)  # 4 hours

    upload_dir: Path = DATA_DIR / "uploads"
    output_dir: Path = DATA_DIR / "outputs"

    request_timeout_seconds: int = 180

    # ── Agent 对话 LLM ──────────────────────────────────────────────────────────
    agent_llm_key: str = Field(default="")
    agent_llm_base: str = Field(default="https://api.apimart.ai/v1")
    agent_llm_model: str = Field(default="gemini-3.5-flash-lite")

    @property
    def effective_agent_llm_key(self) -> str:
        return self.agent_llm_key

    @property
    def admin_work_id_set(self) -> set[str]:
        return {x.strip() for x in self.admin_work_ids.split(",") if x.strip()}


@lru_cache
def get_settings() -> Settings:
    s = Settings()
    s.upload_dir.mkdir(parents=True, exist_ok=True)
    s.output_dir.mkdir(parents=True, exist_ok=True)
    return s
