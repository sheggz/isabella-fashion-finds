"""Where may the mobile sign-in send the user back to? Pure rules, no I/O.

The post-login redirect is the most abused part of OAuth: if an attacker can choose where the
one-time code is sent, they receive it. So the target must start with an allowlisted prefix
(our own app's link scheme), and anything odd is refused.
"""
from urllib.parse import urlencode


def is_allowed_redirect(uri, prefixes: list[str]) -> bool:
    """True only if `uri` starts with one of the allowlisted prefixes, e.g. "isabella://".

    Refused outright: non-strings, empty values, and anything containing whitespace or control
    characters (a newline in a redirect is a header-injection trick). Matching is case-insensitive
    because URL schemes are, and a blank prefix in the list never matches (a blank prefix would
    otherwise allow EVERY address).
    """
    if not isinstance(uri, str) or not uri:
        return False
    if any(ch.isspace() or ord(ch) < 32 or ord(ch) == 127 for ch in uri):
        return False
    lowered = uri.lower()
    return any(p.strip() and lowered.startswith(p.strip().lower()) for p in prefixes)


def append_query(uri: str, params: dict[str, str]) -> str:
    """Add query parameters to a URI, keeping any existing query and fragment."""
    base, hash_mark, fragment = uri.partition("#")
    joiner = "&" if "?" in base else "?"
    return f"{base}{joiner}{urlencode(params)}{hash_mark}{fragment}"
