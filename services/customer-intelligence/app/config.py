from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/aaiq_cdp"
    redis_url: str = "redis://localhost:6379/2"
    service_api_key: str = "replace-before-production"
    activation_mode: str = "DRY_RUN"
    meta_pixel_id: str | None = None
    meta_access_token: str | None = None
    meta_api_version: str = "v23.0"
    google_ads_developer_token: str | None = None
    google_ads_customer_id: str | None = None
    google_ads_login_customer_id: str | None = None
    google_ads_user_list_resource: str | None = None
    google_ads_refresh_token: str | None = None
    google_ads_client_id: str | None = None
    google_ads_client_secret: str | None = None
    sendgrid_api_key: str | None = None
    sendgrid_from_email: str | None = None
    sendgrid_loyalty_template_id: str | None = None
    sendgrid_suppression_group_id: int | None = None
    postiz_endpoint: str = "https://api.postiz.com/public/v1"
    postiz_api_key: str | None = None
    request_timeout_seconds: float = 15


@lru_cache
def get_settings() -> Settings:
    return Settings()
