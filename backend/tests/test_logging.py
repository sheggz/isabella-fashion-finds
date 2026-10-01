import asyncio
import io
import json
import logging

import pytest
from fastapi.testclient import TestClient
from starlette.requests import Request

from app.core.handlers import _unhandled
from app.core.log import (
    JsonFormatter,
    RequestIdFilter,
    configure_logging,
    redact,
    request_id_var,
)


@pytest.fixture(autouse=True)
def restore_logging():
    yield
    configure_logging()  # undo any test-specific stream/format


def record(**over):
    return logging.makeLogRecord(
        {"name": "app.test", "levelno": logging.INFO, "levelname": "INFO", "msg": "hello", **over}
    )


# --- redact (pure) ---

def test_redact_masks_sensitive_keys_at_any_depth_case_insensitively():
    data = {
        "user": "ada",
        "Password": "p",
        "nested": {"Authorization": "Bearer x", "ok": 1},
        "items": [{"api_key": "k"}, {"name": "n"}],
        "client_secret": "s",
        "Set-Cookie": "session=abc",
    }
    assert redact(data) == {
        "user": "ada",
        "Password": "***",
        "nested": {"Authorization": "***", "ok": 1},
        "items": [{"api_key": "***"}, {"name": "n"}],
        "client_secret": "***",
        "Set-Cookie": "***",
    }


def test_redact_does_not_mutate_its_input():
    data = {"password": "p", "nested": {"token": "t"}}
    redact(data)
    assert data == {"password": "p", "nested": {"token": "t"}}


def test_redact_passes_plain_values_through():
    assert redact("text") == "text"
    assert redact(5) == 5
    assert redact(None) is None


# --- formatters and filter ---

def test_filter_adds_the_current_request_id():
    token = request_id_var.set("rid-9")
    try:
        r = record()
        RequestIdFilter().filter(r)
        assert r.request_id == "rid-9"
    finally:
        request_id_var.reset(token)


def test_filter_uses_a_dash_outside_a_request_and_respects_an_explicit_id():
    r = record()
    RequestIdFilter().filter(r)
    assert r.request_id == "-"
    explicit = record(request_id="from-extra")
    RequestIdFilter().filter(explicit)
    assert explicit.request_id == "from-extra"


def test_json_formatter_emits_one_valid_json_object_with_core_fields():
    r = record(request_id="rid-1", method="GET", path="/x", status=200, duration_ms=1.5)
    out = json.loads(JsonFormatter().format(r))
    assert out["level"] == "INFO" and out["logger"] == "app.test" and out["message"] == "hello"
    assert out["request_id"] == "rid-1"
    assert (out["method"], out["path"], out["status"], out["duration_ms"]) == ("GET", "/x", 200, 1.5)
    assert "ts" in out


def test_json_formatter_includes_the_traceback_for_errors():
    try:
        raise ValueError("bad thing")
    except ValueError:
        import sys

        r = record(levelno=logging.ERROR, levelname="ERROR", exc_info=sys.exc_info())
    out = json.loads(JsonFormatter().format(r))
    assert "ValueError: bad thing" in out["exception"]


# --- configuration ---

def test_configure_logging_is_idempotent():
    configure_logging("INFO", False)
    configure_logging("INFO", False)
    ours = [h for h in logging.getLogger().handlers if getattr(h, "isabella_handler", False)]
    assert len(ours) == 1


def test_configure_logging_sets_the_level():
    configure_logging("WARNING", False)
    assert logging.getLogger().level == logging.WARNING


@pytest.mark.parametrize("name", ["uvicorn.access", "httpx", "httpcore"])
def test_libraries_that_log_full_urls_are_quietened(name):
    configure_logging("INFO", False)
    assert logging.getLogger(name).level >= logging.WARNING


# --- access log + request id context, through the real app ---

def test_every_request_produces_one_access_line_with_the_request_id(app):
    buf = io.StringIO()
    configure_logging("INFO", True, stream=buf)

    @app.get("/_t/log")
    def _log():
        logging.getLogger("app.test").info("inside the route")
        return {}

    res = TestClient(app).get("/_t/log", headers={"X-Request-ID": "rid-1"})
    lines = [json.loads(line) for line in buf.getvalue().splitlines()]

    inside = next(entry for entry in lines if entry["message"] == "inside the route")
    assert inside["request_id"] == "rid-1"  # attached automatically, nobody passed it in

    access = [entry for entry in lines if entry["logger"] == "app.access"]
    assert len(access) == 1
    assert (access[0]["method"], access[0]["path"], access[0]["status"]) == ("GET", "/_t/log", 200)
    assert access[0]["request_id"] == "rid-1" == res.headers["X-Request-ID"]
    assert access[0]["duration_ms"] >= 0


def test_the_query_string_is_never_logged(client, caplog):
    with caplog.at_level(logging.INFO):
        client.get("/health?code=SUPERSECRET&state=abc")
    assert "SUPERSECRET" not in caplog.text
    assert any("/health" in r.getMessage() for r in caplog.records if r.name == "app.access")


def test_a_crashing_request_is_still_access_logged_as_500(client, caplog):
    with caplog.at_level(logging.INFO):
        client.get("/_t/boom")
    messages = [r.getMessage() for r in caplog.records if r.name == "app.access"]
    assert any("500" in m and "/_t/boom" in m for m in messages)


# --- the unhandled-error handler ---

def test_unhandled_handler_logs_the_traceback_even_outside_an_except_block(caplog):
    try:
        raise RuntimeError("boom")
    except RuntimeError as caught:
        exc = caught
    request = Request({"type": "http", "method": "GET", "path": "/x", "headers": [], "query_string": b""})

    with caplog.at_level(logging.ERROR):
        response = asyncio.run(_unhandled(request, exc))

    assert response.status_code == 500
    errors = [r for r in caplog.records if r.levelno == logging.ERROR]
    assert errors and errors[0].exc_info[1] is exc  # explicit exc_info, not implicit sys.exc_info()
    assert errors[0].request_id  # the handler runs outside the middleware, so it passes the id itself
