"""Dependencies shared by several routers."""
from typing import Annotated

from fastapi import Depends
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.core.errors import ServiceUnavailable
from app.db.session import get_session
from app.integrations.storage import StorageClient

DbSession = Annotated[Session, Depends(get_session)]
SettingsDep = Annotated[Settings, Depends(get_settings)]


def get_storage(settings: SettingsDep) -> StorageClient:
    if not settings.supabase_url or not settings.supabase_service_key:
        raise ServiceUnavailable("Image storage is not configured")
    return StorageClient(settings.supabase_url, settings.supabase_service_key, settings.storage_bucket)


StorageDep = Annotated[StorageClient, Depends(get_storage)]
