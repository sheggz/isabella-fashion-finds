"""PKCE (RFC 7636): proves that whoever redeems a sign-in code is the app that asked for it.

The problem it solves: after Google sign-in, the result travels back to the phone app through a
link like `isabella://auth?code=...`, and ANY other app on the phone can register to receive
that kind of link. If a malicious app grabs the code, it must not be able to turn it into a login.

How: before starting, the app invents a random secret (the "verifier") and tells the server only
its one-way fingerprint (the "challenge", a SHA-256 hash). To redeem the code the app must present
the original verifier, and the server checks that it hashes to the stored challenge. A thief with
the code but not the verifier gets nothing. Pure: no database, no network.
"""
import base64
import hashlib
import hmac
import re

# RFC 7636: a verifier is 43-128 characters from the "unreserved" set.
_VERIFIER = re.compile(r"[A-Za-z0-9\-._~]{43,128}")
# An S256 challenge is the unpadded base64url of a 32-byte hash, which is always 43 characters.
_CHALLENGE = re.compile(r"[A-Za-z0-9_\-]{43}")


def is_valid_verifier(value) -> bool:
    return isinstance(value, str) and _VERIFIER.fullmatch(value) is not None


def is_valid_challenge(value) -> bool:
    return isinstance(value, str) and _CHALLENGE.fullmatch(value) is not None


def challenge_for(verifier: str) -> str:
    """The S256 challenge for a verifier: base64url(SHA-256(verifier)) without padding."""
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")


def verifier_matches(verifier, challenge) -> bool:
    """True only for a well-formed verifier whose hash equals the stored challenge.

    Uses a constant-time comparison so the time taken does not leak how many leading characters
    of a guess were right.
    """
    if not is_valid_verifier(verifier) or not is_valid_challenge(challenge):
        return False
    return hmac.compare_digest(challenge_for(verifier), challenge)
