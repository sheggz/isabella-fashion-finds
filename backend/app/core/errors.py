"""Domain errors.

Services and repositories raise these. They know nothing about HTTP responses;
the handlers in app/core/handlers.py translate them at the boundary.
"""
from typing import Any


class AppError(Exception):
    status_code = 500
    code = "internal_error"

    def __init__(self, message: str, details: Any = None):
        super().__init__(message)
        self.message = message
        self.details = details


class NotFound(AppError):
    status_code = 404
    code = "not_found"


class Conflict(AppError):
    status_code = 409
    code = "conflict"


class OutOfStock(Conflict):
    code = "out_of_stock"


class BadRequest(AppError):
    status_code = 400
    code = "bad_request"


class LimitExceeded(Conflict):
    code = "limit_exceeded"


class Unauthorized(AppError):
    status_code = 401
    code = "unauthorized"


class Forbidden(AppError):
    status_code = 403
    code = "forbidden"


class PayloadTooLarge(AppError):
    status_code = 413
    code = "file_too_large"


class UnsupportedMediaType(AppError):
    status_code = 415
    code = "unsupported_media_type"


class ServiceUnavailable(AppError):
    """A dependency we need (database, payment provider...) is down or not configured."""

    status_code = 503
    code = "service_unavailable"
