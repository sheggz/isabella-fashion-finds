import json

from scripts.smoke_test import Response, run_checks

BASE = "https://api.example.test"


def ok(status, body=None, headers=None, ms=40):
    text = json.dumps(body) if body is not None else ""
    return Response(status=status, headers={k.lower(): v for k, v in (headers or {}).items()}, text=text, elapsed_ms=ms)


def healthy_server(url, method="GET", headers=None):
    """Canned answers of a correctly configured server."""
    path = url.removeprefix(BASE)
    if path == "/health":
        return ok(200, {"status": "ok"})
    if path == "/health/db":
        return ok(200, {"status": "ok", "database": "up"})
    if path == "/products":
        return ok(200, [])
    if path == "/catalogue/options":
        return ok(200, {"sizes": [], "images": {}, "cart": {}})
    if path == "/auth/me":
        return ok(401, {"error": {"code": "unauthorized", "message": "x", "details": None, "request_id": "r"}}, {"X-Request-ID": "r"})
    if path.startswith("/auth/google/login") and "evil.example" in path:
        return ok(400, {"error": {"code": "bad_request", "message": "x", "details": None, "request_id": "r"}})
    if path.startswith("/auth/google/login"):
        return ok(302, None, {"Location": "https://accounts.google.com/o/oauth2/v2/auth?redirect_uri=https%3A%2F%2Fapi.example.test%2Fauth%2Fgoogle%2Fcallback"})
    if path == "/definitely-not-a-route":
        return ok(404, {"error": {"code": "not_found", "message": "x", "details": None, "request_id": "r"}})
    if method == "OPTIONS":
        return ok(200, None, {})  # no Access-Control-Allow-Origin for a stranger
    raise AssertionError(f"unexpected request: {method} {url}")


def by_name(checks):
    return {c.name: c for c in checks}


def test_a_healthy_server_passes_every_check():
    checks = run_checks(healthy_server, BASE)
    failed = [c.name for c in checks if not c.ok]
    assert failed == []
    assert len(checks) >= 8


def test_without_a_database_the_database_checks_expect_a_503_and_products_are_skipped():
    def no_db(url, method="GET", headers=None):
        path = url.removeprefix(BASE)
        if path == "/health/db":
            return ok(503, {"error": {"code": "service_unavailable", "message": "x", "details": None, "request_id": "r"}})
        if path == "/products" and method == "GET":
            raise AssertionError("the product list must not be requested without a database")
        return healthy_server(url, method, headers)

    checks = by_name(run_checks(no_db, BASE, expect_db=False))
    assert all(c.ok for c in checks.values())
    assert "products list" not in checks


def test_a_broken_health_endpoint_is_reported_by_name():
    def broken(url, method="GET", headers=None):
        return ok(500, {}) if url.endswith("/health") else healthy_server(url, method, headers)

    checks = by_name(run_checks(broken, BASE))
    assert checks["health"].ok is False
    assert checks["products list"].ok is True


def test_a_server_that_leaks_a_stack_trace_on_unknown_paths_fails_the_error_shape_check():
    def leaky(url, method="GET", headers=None):
        if url.endswith("/definitely-not-a-route"):
            return ok(404, {"detail": "Not Found"})   # the framework default, not our contract
        return healthy_server(url, method, headers)

    assert by_name(run_checks(leaky, BASE))["unknown path uses the error contract"].ok is False


def test_an_open_redirect_on_mobile_login_is_caught():
    def open_redirect(url, method="GET", headers=None):
        if "evil.example" in url:
            return ok(302, None, {"Location": "https://evil.example"})
        return healthy_server(url, method, headers)

    assert by_name(run_checks(open_redirect, BASE))["mobile login refuses a foreign redirect"].ok is False


def test_the_google_callback_address_is_checked_when_one_is_expected():
    checks = by_name(run_checks(healthy_server, BASE, expect_callback=f"{BASE}/auth/google/callback"))
    assert checks["google callback address"].ok is True
    wrong = by_name(run_checks(healthy_server, BASE, expect_callback="https://other.example/api/auth/google/callback"))
    assert wrong["google callback address"].ok is False


def test_cors_must_not_allow_a_stranger_origin():
    def too_open(url, method="GET", headers=None):
        if method == "OPTIONS":
            return ok(200, None, {"Access-Control-Allow-Origin": "https://evil.example"})
        return healthy_server(url, method, headers)

    assert by_name(run_checks(too_open, BASE))["cors refuses a stranger origin"].ok is False


def test_slow_answers_are_flagged_as_a_hint_but_do_not_fail():
    def slow(url, method="GET", headers=None):
        r = healthy_server(url, method, headers)
        return Response(r.status, r.headers, r.text, 9000) if url.endswith("/health") else r

    checks = by_name(run_checks(slow, BASE))
    assert checks["health"].ok is True
    assert "slow" in checks["health"].detail.lower()


def test_a_connection_error_is_a_failed_check_not_a_crash():
    def down(url, method="GET", headers=None):
        raise ConnectionError("refused")

    checks = run_checks(down, BASE)
    assert checks and all(not c.ok for c in checks)
