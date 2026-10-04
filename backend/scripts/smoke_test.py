"""Check a RUNNING server from the outside: is it up, configured correctly, and safe by default?

    python scripts/smoke_test.py https://your-api.example.com
    python scripts/smoke_test.py http://localhost:8000 --no-db          # server has no database
    python scripts/smoke_test.py https://api... --expect-callback https://site.netlify.app/api/auth/google/callback

Run it after every deploy. It needs nothing but the Python standard library. The checks are a
pure function (`run_checks`) that takes the HTTP call as a parameter, so they are unit-tested
without any network.
"""
import argparse
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from collections.abc import Callable
from dataclasses import dataclass

SLOW_MS = 5000  # a free host that was asleep takes about a minute; this only adds a hint
_CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"  # a well-formed PKCE challenge


@dataclass(frozen=True)
class Response:
    status: int
    headers: dict[str, str]  # header names lower-cased
    text: str
    elapsed_ms: int


@dataclass(frozen=True)
class Check:
    name: str
    ok: bool
    detail: str = ""


Fetch = Callable[..., Response]


def _json(response: Response):
    try:
        return json.loads(response.text)
    except ValueError:
        return None


def _error_code(response: Response):
    body = _json(response)
    return body["error"]["code"] if isinstance(body, dict) and isinstance(body.get("error"), dict) else None


def _timing(response: Response) -> str:
    note = f"{response.elapsed_ms} ms"
    return f"{note} (slow: a sleeping free host wakes up this way)" if response.elapsed_ms > SLOW_MS else note


def run_checks(fetch: Fetch, base: str, expect_db: bool = True, expect_callback: str | None = None) -> list[Check]:
    """Run every check; a check that raises is reported as failed, never allowed to crash the run."""
    base = base.rstrip("/")
    checks: list[Check] = []

    def check(name: str, fn: Callable[[], tuple[bool, str]]) -> None:
        try:
            passed, detail = fn()
        except Exception as exc:  # noqa: BLE001 (a check must never take the whole run down)
            passed, detail = False, f"{type(exc).__name__}: {exc}"
        checks.append(Check(name, passed, detail))

    def health():
        r = fetch(f"{base}/health")
        body = _json(r)
        return r.status == 200 and body == {"status": "ok"}, _timing(r)

    def database():
        r = fetch(f"{base}/health/db")
        wanted = 200 if expect_db else 503
        return r.status == wanted, f"status {r.status} (expected {wanted}); {_timing(r)}"

    def products():
        r = fetch(f"{base}/products")
        return r.status == 200 and isinstance(_json(r), list), f"status {r.status}; {_timing(r)}"

    def options():
        r = fetch(f"{base}/catalogue/options")
        body = _json(r) or {}
        return r.status == 200 and all(k in body for k in ("sizes", "images", "cart")), f"status {r.status}"

    def anonymous():
        r = fetch(f"{base}/auth/me")
        return (r.status == 401 and _error_code(r) == "unauthorized" and "x-request-id" in r.headers), f"status {r.status}"

    def error_shape():
        r = fetch(f"{base}/definitely-not-a-route")
        return r.status == 404 and _error_code(r) == "not_found", f"status {r.status}, code {_error_code(r)}"

    def google_login():
        r = fetch(f"{base}/auth/google/login")
        location = r.headers.get("location", "")
        return r.status == 302 and location.startswith("https://accounts.google.com/"), f"status {r.status}"

    def callback_address():
        location = fetch(f"{base}/auth/google/login").headers.get("location", "")
        sent = urllib.parse.parse_qs(urllib.parse.urlparse(location).query).get("redirect_uri", [""])[0]
        return sent == expect_callback, f"sent {sent!r}, expected {expect_callback!r}"

    def mobile_redirect():
        query = urllib.parse.urlencode(
            {"client": "mobile", "redirect_uri": "https://evil.example/steal", "code_challenge": _CHALLENGE, "state": "s"}
        )
        r = fetch(f"{base}/auth/google/login?{query}")
        return r.status == 400, f"status {r.status} (a foreign redirect must be refused before Google is contacted)"

    def cors():
        r = fetch(
            f"{base}/products",
            method="OPTIONS",
            headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "GET"},
        )
        allowed = r.headers.get("access-control-allow-origin")
        return allowed not in ("https://evil.example", "*"), f"allow-origin: {allowed!r}"

    check("health", health)
    check("database health", database)
    if expect_db:
        check("products list", products)
    check("catalogue options", options)
    check("unauthenticated request gets 401", anonymous)
    check("unknown path uses the error contract", error_shape)
    check("google login redirects to google", google_login)
    if expect_callback:
        check("google callback address", callback_address)
    check("mobile login refuses a foreign redirect", mobile_redirect)
    check("cors refuses a stranger origin", cors)
    return checks


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    """Report a 302 as a 302 instead of following it: where it points IS the thing we check."""

    def redirect_request(self, *args, **kwargs):
        return None


def http_fetch(url: str, method: str = "GET", headers: dict[str, str] | None = None) -> Response:
    request = urllib.request.Request(url, method=method, headers=headers or {})
    opener = urllib.request.build_opener(_NoRedirect)
    started = time.perf_counter()
    try:
        with opener.open(request, timeout=90) as reply:  # generous: a sleeping free host takes ~60 s
            status, hdrs, body = reply.status, reply.headers, reply.read()
    except urllib.error.HTTPError as err:  # 3xx/4xx/5xx arrive as exceptions in urllib
        status, hdrs, body = err.code, err.headers, err.read()
    elapsed = int((time.perf_counter() - started) * 1000)
    return Response(status, {k.lower(): v for k, v in hdrs.items()}, body.decode("utf-8", "replace"), elapsed)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("base_url")
    parser.add_argument("--no-db", action="store_true", help="the server has no database (expects /health/db = 503)")
    parser.add_argument("--expect-callback", help="the exact Google callback URL the server should send")
    args = parser.parse_args(argv)

    checks = run_checks(http_fetch, args.base_url, expect_db=not args.no_db, expect_callback=args.expect_callback)
    for c in checks:
        print(f"{'PASS' if c.ok else 'FAIL'}  {c.name:<42} {c.detail}")
    failed = [c for c in checks if not c.ok]
    print(f"\n{len(checks) - len(failed)}/{len(checks)} checks passed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
