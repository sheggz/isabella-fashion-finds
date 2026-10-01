import uuid
from datetime import datetime, timedelta, timezone

import pytest
from pydantic import ValidationError

from app.schemas.discount import DiscountIn

START = datetime(2026, 10, 1, 12, 0, tzinfo=timezone.utc)


def make(**over):
    return DiscountIn(
        **{
            "name": "  Weekend sale ",
            "kind": "percent",
            "percent": 10,
            "applies_to_all": True,
            "starts_at": START,
            "ends_at": START + timedelta(days=2),
            **over,
        }
    )


def test_a_percentage_discount_for_every_piece():
    d = make()
    assert d.name == "Weekend sale"
    assert d.percent_bp == 1000 and d.amount_kobo is None and d.is_enabled is True


def test_a_fixed_amount_discount_for_selected_pieces():
    pid = uuid.uuid4()
    d = make(kind="amount", percent=None, amount_kobo=250000, applies_to_all=False, product_ids=[pid])
    assert d.percent_bp is None and d.amount_kobo == 250000 and d.product_ids == [pid]


@pytest.mark.parametrize("percent", [0, 100, -1, 10.001, None])
def test_percent_must_be_a_real_percentage(percent):
    with pytest.raises(ValidationError):
        make(percent=percent)


def test_decimals_in_a_percentage_are_kept_exactly():
    assert make(percent=12.5).percent_bp == 1250


@pytest.mark.parametrize("amount", [0, -100, None])
def test_amount_must_be_positive(amount):
    with pytest.raises(ValidationError):
        make(kind="amount", percent=None, amount_kobo=amount)


def test_the_value_must_match_the_kind():
    with pytest.raises(ValidationError, match="percentage"):
        make(kind="percent", amount_kobo=500)
    with pytest.raises(ValidationError, match="amount"):
        make(kind="amount", percent=10, amount_kobo=500)


def test_every_piece_and_selected_pieces_are_mutually_exclusive():
    with pytest.raises(ValidationError, match="selected"):
        make(applies_to_all=True, product_ids=[uuid.uuid4()])
    with pytest.raises(ValidationError, match="at least one piece"):
        make(applies_to_all=False, product_ids=[])


def test_the_same_piece_cannot_be_listed_twice():
    pid = uuid.uuid4()
    with pytest.raises(ValidationError, match="more than once"):
        make(applies_to_all=False, product_ids=[pid, pid])


def test_the_end_must_come_after_the_start():
    with pytest.raises(ValidationError, match="after"):
        make(ends_at=START)
    with pytest.raises(ValidationError, match="after"):
        make(ends_at=START - timedelta(hours=1))


def test_times_without_a_timezone_are_rejected_not_guessed():
    with pytest.raises(ValidationError, match="time zone"):
        make(starts_at=datetime(2026, 10, 1, 12, 0))  # noqa: DTZ001 (naive on purpose: that is what is being refused)


def test_times_are_converted_to_utc():
    plus_one = timezone(timedelta(hours=1))
    d = make(starts_at=datetime(2026, 10, 1, 13, 0, tzinfo=plus_one), ends_at=datetime(2026, 10, 2, 13, 0, tzinfo=plus_one))
    assert d.starts_at == START and d.starts_at.utcoffset() == timedelta(0)


def test_the_name_is_required_and_bounded():
    with pytest.raises(ValidationError):
        make(name="   ")
    with pytest.raises(ValidationError):
        make(name="x" * 101)
