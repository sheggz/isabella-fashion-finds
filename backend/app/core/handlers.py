"""Global exception handlers: the single place errors become HTTP responses."""
import logging
import uuid
from http import HTTPStatus

from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.errors import AppError

logger = logging.getLogger(__name__)

_CODES = {
    400: "bad_request",
    401: "unauthorized",
    403: "forbidden",
    404: "not_found",
    405: "method_not_allowed",
    409: "conflict",
    429: "rate_limited",
}


def _request_id(request: Request) -> str:
    return getattr(request.state, "request_id", None) or uuid.uuid4().hex


def error_response(request: Request, status: int, code: str, message: str, details=None):
    rid = _request_id(request)
    body = {"error": {"code": code, "message": message, "details": details, "request_id": rid}}
    return JSONResponse(jsonable_encoder(body), status_code=status, headers={"X-Request-ID": rid})


async def _app_error(request: Request, exc: AppError):
    return error_response(request, exc.status_code, exc.code, exc.message, exc.details)


async def _http_error(request: Request, exc: StarletteHTTPException):
    code = _CODES.get(exc.status_code, "http_error")
    message = exc.detail if isinstance(exc.detail, str) else HTTPStatus(exc.status_code).phrase
    return error_response(request, exc.status_code, code, message)


async def _validation_error(request: Request, exc: RequestValidationError):
    details = [
        {"field": ".".join(str(p) for p in e["loc"]), "message": e["msg"]} for e in exc.errors()
    ]
    return error_response(request, 422, "validation_error", "Invalid request", details)


async def _unhandled(request: Request, exc: Exception):
    """Last resort for any exception nobody handled: log everything, tell the client nothing.

    Full detail (traceback) goes to the logs only; the client gets a generic message plus the
    request id so we can find the log entry later.

    Why `exc_info=exc` instead of `logger.exception(...)`: `logger.exception` finds the error by
    asking Python for "the exception currently being handled", which only exists inside an
    `except` block. Starlette happens to call us from inside one, so it would work today, but it
    would silently log no traceback if anything ever called this function from elsewhere (a
    test, a refactor). Passing the exception object explicitly has no such hidden dependency.

    Why the request id is passed in `extra`: Starlette runs this handler outside our
    middleware, after `request_id_var` has been reset, so the automatic context lookup would
    only find "-".
    """
    logger.error(
        "Unhandled error",
        exc_info=exc,
        extra={"request_id": _request_id(request)},
    )
    return error_response(request, 500, "internal_error", "Something went wrong")


def is_unique_violation(exc: IntegrityError) -> bool:
    """True only for "this value already exists" database errors.

    Postgres reports the cause as an SQLSTATE code on the driver error (23505 = unique
    violation; 23503 foreign key, 23514 check, 23502 not-null are different problems). SQLite,
    used in our tests, only gives a message, so it is the fallback when there is no code.
    """
    orig = exc.orig
    state = getattr(orig, "sqlstate", None) or getattr(orig, "pgcode", None)
    if state:
        return state == "23505"
    return "UNIQUE constraint failed" in str(orig)


async def _integrity_error(request: Request, exc: IntegrityError):
    """Turn "that already exists" races into a 409; leave every other integrity error a 500.

    Two requests inserting the same unique value at once can both pass our checks and one then
    loses at the database: that is a conflict the user can understand and retry. A CHECK or
    foreign-key failure means our own validation missed something, which is a bug and must stay
    a loud 500. The constraint name and offending values stay out of the response and the log
    (Postgres messages can contain emails or other personal data).
    """
    if is_unique_violation(exc):
        logger.warning("Unique constraint conflict", extra={"request_id": _request_id(request)})
        return error_response(
            request, 409, "conflict", "That conflicts with something that already exists"
        )
    return await _unhandled(request, exc)


def register_handlers(app: FastAPI) -> None:
    app.add_exception_handler(IntegrityError, _integrity_error)
    app.add_exception_handler(AppError, _app_error)
    app.add_exception_handler(StarletteHTTPException, _http_error)
    app.add_exception_handler(RequestValidationError, _validation_error)
    app.add_exception_handler(Exception, _unhandled)
