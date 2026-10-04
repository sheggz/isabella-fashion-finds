from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# .env lives at the project root (shared by backend and frontend tooling), not in backend/.
ENV_FILE = Path(__file__).resolve().parents[3] / ".env"


class Settings(BaseSettings):
    """Configuration comes from environment variables (or .env). Nothing is hard-coded."""

    model_config = SettingsConfigDict(env_file=ENV_FILE, extra="ignore")

    app_env: str = "development"
    cors_origins: str = "http://localhost:5173"  # comma-separated
    owner_emails: str = ""  # comma-separated; bootstraps the owner role
    database_url: str = ""
    supabase_url: str = ""
    supabase_service_key: str = ""
    storage_bucket: str = "product-images"

    google_client_id: str = ""
    google_client_secret: str = ""
    session_secret: str = ""
    # Where the mobile app may be sent after Google sign-in: comma-separated link prefixes. The app's
    # own scheme by default; add "exp://" ONLY while testing in Expo Go (see ADR 0013).
    mobile_redirect_prefixes: str = "isabella://"
    frontend_url: str = "http://localhost:5173"  # where users land after login
    backend_url: str = "http://localhost:8000"  # public URL of this API (builds the OAuth callback)

    log_level: str = "INFO"
    log_format: str = "auto"  # "text", "json", or "auto" (json in production, text otherwise)

    @property
    def log_json(self) -> bool:
        return self.log_format == "json" or (self.log_format == "auto" and self.app_env == "production")

    @property
    def mobile_redirect_prefix_list(self) -> list[str]:
        return [p.strip() for p in self.mobile_redirect_prefixes.split(",") if p.strip()]

    @property
    def cookie_secure(self) -> bool:
        """Browsers only send Secure cookies over HTTPS, so enable it outside local dev."""
        return self.app_env == "production"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def owner_email_list(self) -> list[str]:
        return [e.strip().lower() for e in self.owner_emails.split(",") if e.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
