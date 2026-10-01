"""Create the public product-photo bucket if it does not exist yet. Safe to run repeatedly.

Run from backend/:  uv run python -m scripts.ensure_bucket
Use it once per Supabase project (local, staging, production). The size and type limits are
set on the bucket itself, so Supabase enforces them even if our own checks were bypassed.
"""
from app.core.config import get_settings
from app.domain.images import ALLOWED_TYPES, MAX_IMAGE_BYTES
from app.integrations.storage import StorageClient


def main() -> None:
    settings = get_settings()
    StorageClient(
        settings.supabase_url, settings.supabase_service_key, settings.storage_bucket
    ).ensure_bucket(max_bytes=MAX_IMAGE_BYTES, mime_types=list(ALLOWED_TYPES))
    print(f"Bucket '{settings.storage_bucket}' is ready.")


if __name__ == "__main__":
    main()
