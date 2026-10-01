import uuid

from starlette.middleware.base import BaseHTTPMiddleware

from app.core.log import request_id_var


class RequestIdMiddleware(BaseHTTPMiddleware):
    """Tag every request with an id (reuse the caller's if given) and echo it back.

    The id is stored in two places on purpose:
    - `request.state.request_id`: for code that has the request object (error responses).
    - `request_id_var` (a ContextVar): so log lines written anywhere during this request carry
      the id automatically. It is reset in `finally`, otherwise the id would leak into
      whatever the same worker handles next.

    This must be the OUTERMOST app middleware (added last in main.py). Starlette's own
    last-resort 500 handler sits outside it, which is why that handler passes the id explicitly.
    """

    async def dispatch(self, request, call_next):
        rid = request.headers.get("X-Request-ID") or uuid.uuid4().hex
        request.state.request_id = rid
        token = request_id_var.set(rid)
        try:
            response = await call_next(request)
        finally:
            request_id_var.reset(token)
        response.headers["X-Request-ID"] = rid
        return response
