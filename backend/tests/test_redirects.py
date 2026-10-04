import pytest

from app.domain.redirects import append_query, is_allowed_redirect

PREFIXES = ["isabella://", "exp://"]


@pytest.mark.parametrize(
    "uri",
    [
        "isabella://auth",
        "isabella://auth/callback?x=1",
        "exp://192.168.1.5:8081/--/auth",
        "exp://u.anonymous.exp.direct/--/auth",
        "ISABELLA://auth",  # schemes are case-insensitive
    ],
)
def test_app_links_on_the_allowlist_are_accepted(uri):
    assert is_allowed_redirect(uri, PREFIXES) is True


@pytest.mark.parametrize(
    "uri",
    [
        "https://evil.example/steal",
        "http://localhost:3000/",
        "javascript:alert(1)",
        "data:text/html,hi",
        "isabella.evil://auth",   # a different scheme that merely starts with the same letters
        "xisabella://auth",
        "isabella:/auth",         # malformed: one slash
        "isabella://auth\nLocation: https://evil.example",   # header injection attempt
        "isabella://auth beyond",  # whitespace
        "",
        None,
        42,
    ],
)
def test_everything_else_is_refused(uri):
    assert is_allowed_redirect(uri, PREFIXES) is False


def test_an_empty_allowlist_refuses_everything():
    assert is_allowed_redirect("isabella://auth", []) is False


def test_a_blank_prefix_in_the_list_never_allows_everything():
    assert is_allowed_redirect("https://evil.example", [""]) is False
    assert is_allowed_redirect("https://evil.example", ["  "]) is False


def test_append_query_adds_parameters_and_encodes_them():
    assert append_query("isabella://auth", {"code": "abc", "state": "x y"}) == "isabella://auth?code=abc&state=x+y"


def test_append_query_keeps_an_existing_query_and_a_fragment():
    assert append_query("exp://h/--/auth?x=1", {"code": "c"}) == "exp://h/--/auth?x=1&code=c"
    assert append_query("isabella://auth#frag", {"code": "c"}) == "isabella://auth?code=c#frag"
