"""Supabase Storage adapter: the boundary between us and the object store.

Vendor errors are caught here, logged without secrets, and translated into ServiceUnavailable.
"""
import logging

import httpx

from app.core.errors import AppError, ServiceUnavailable

logger = logging.getLogger(__name__)


def auth_headers(secret_key: str) -> dict[str, str]:
    """Pick the right auth headers for the kind of Supabase key we hold.

    New-style `sb_secret_...` keys are NOT JWTs: they go in the `apikey` header only, and
    sending them as `Authorization: Bearer` is rejected (verified against the live API).
    Legacy service-role keys are JWTs and need the bearer header as well.
    """
    if secret_key.startswith("sb_secret_"):
        return {"apikey": secret_key}
    return {"apikey": secret_key, "Authorization": f"Bearer {secret_key}"}


class StorageClient:
    def __init__(self, base_url, secret_key, bucket, transport=None, timeout=15.0):
        self._api = f"{base_url.rstrip('/')}/storage/v1"
        self._key = secret_key
        self._bucket = bucket
        self._transport = transport  # tests inject httpx.MockTransport here
        self._timeout = timeout

    def upload(self, path: str, data: bytes, content_type: str) -> None:
        self._call(
            "POST",
            f"{self._api}/object/{self._bucket}/{path}",
            headers={"Content-Type": content_type},
            content=data,
        )

    def delete(self, paths: list[str]) -> None:
        if not paths:
            return
        self._call("DELETE", f"{self._api}/object/{self._bucket}", json={"prefixes": paths})

    def ensure_bucket(self, max_bytes: int, mime_types: list[str]) -> None:
        """Create the public bucket, with size and type limits that Supabase itself enforces.

        Supabase answers "already exists" with HTTP 400 and puts the real reason in the
        body's `code`, so for this call the body is checked instead of the status alone.
        """
        res = self._send(
            "POST",
            f"{self._api}/bucket",
            json={
                "id": self._bucket,
                "name": self._bucket,
                "public": True,
                "file_size_limit": max_bytes,
                "allowed_mime_types": mime_types,
            },
        )
        if res.status_code >= 400 and _error_code(res) != "BucketAlreadyExists":
            self._reject(res)

    def _call(self, method, url, headers=None, **kwargs) -> httpx.Response:
        res = self._send(method, url, headers, **kwargs)
        if res.status_code >= 400:
            self._reject(res)
        return res

    def _send(self, method, url, headers=None, **kwargs) -> httpx.Response:
        try:
            with httpx.Client(transport=self._transport, timeout=self._timeout) as http:
                return http.request(
                    method, url, headers={**auth_headers(self._key), **(headers or {})}, **kwargs
                )
        except httpx.HTTPError:
            logger.warning("Storage request failed", exc_info=True)
            raise ServiceUnavailable("Image storage is unavailable") from None

    @staticmethod
    def _reject(res: httpx.Response):
        # Only the status and Supabase's error code are logged: never headers or bodies.
        logger.warning(
            "Storage request rejected (status=%s, code=%s)", res.status_code, _error_code(res)
        )
        raise ServiceUnavailable("Image storage is unavailable")


def _error_code(res: httpx.Response):
    try:
        body = res.json()
    except ValueError:
        return None
    return body.get("code") if isinstance(body, dict) else None


def delete_quietly(storage, paths: list[str]) -> None:
    """Best-effort cleanup. A failure leaves an orphaned file, which is a nuisance; it must
    never turn a successful user action (deleting a photo or product) into an error."""
    if not paths:
        return
    try:
        storage.delete(paths)
    except AppError:
        logger.warning("Could not delete %d stored image(s); they are now orphaned", len(paths))
