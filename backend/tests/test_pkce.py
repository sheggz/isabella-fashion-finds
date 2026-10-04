import pytest

from app.domain.pkce import challenge_for, is_valid_challenge, is_valid_verifier, verifier_matches

# The official test vector from RFC 7636 (the PKCE specification), appendix B.
RFC_VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
RFC_CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"


def test_the_challenge_matches_the_published_test_vector():
    assert challenge_for(RFC_VERIFIER) == RFC_CHALLENGE


def test_a_challenge_is_url_safe_and_unpadded():
    challenge = challenge_for("a" * 43)
    assert len(challenge) == 43
    assert not set(challenge) & set("+/=")


def test_the_right_verifier_matches_its_challenge():
    assert verifier_matches(RFC_VERIFIER, RFC_CHALLENGE) is True


def test_any_other_verifier_does_not():
    assert verifier_matches("b" * 43, RFC_CHALLENGE) is False
    assert verifier_matches(RFC_VERIFIER[:-1] + "A", RFC_CHALLENGE) is False


@pytest.mark.parametrize("bad", ["", "short", "x" * 42, "x" * 129, "has space" + "a" * 40, "plus+" + "a" * 40, "slash/" + "a" * 40, "pad=" + "a" * 40, None, 123])
def test_verifiers_must_be_43_to_128_unreserved_characters(bad):
    assert is_valid_verifier(bad) is False


@pytest.mark.parametrize("good", [RFC_VERIFIER, "A" * 43, "a-._~" * 9, "z" * 128])
def test_well_formed_verifiers_are_accepted(good):
    assert is_valid_verifier(good) is True


@pytest.mark.parametrize("bad", ["", "x" * 42, "x" * 44, RFC_CHALLENGE + "=", "+" * 43, "/" * 43, " " * 43, None, 5])
def test_challenges_must_be_exactly_43_url_safe_characters(bad):
    assert is_valid_challenge(bad) is False


def test_the_published_challenge_is_well_formed():
    assert is_valid_challenge(RFC_CHALLENGE) is True


def test_a_malformed_verifier_never_matches_even_if_its_hash_would():
    assert verifier_matches("short", challenge_for("short")) is False
