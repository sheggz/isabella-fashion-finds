import uuid
from datetime import datetime, timedelta, timezone

import pytest

from app.domain.pricing import (
    DiscountInfo,
    best_offer,
    check_prices,
    product_pricing,
    quote_variant,
    reduction_for,
    status_of,
    variant_base_price,
)

NOW = datetime(2026, 10, 1, 12, 0, tzinfo=timezone.utc)
HOUR = timedelta(hours=1)


def discount(**over):
    fields = {
        "id": uuid.UUID(int=1),
        "name": "Sale",
        "kind": "percent",
        "percent_bp": 1000,  # 10%
        "amount_kobo": None,
        "starts_at": NOW - HOUR,
        "ends_at": NOW + HOUR,
        "is_enabled": True,
        "applies_to_all": True,
        "product_ids": frozenset(),
        **over,
    }
    return DiscountInfo(**fields)


# --- which price applies to a size ---

def test_one_price_mode_uses_the_product_price_for_every_size():
    assert variant_base_price("single", 1500000, None) == 1500000


def test_per_size_mode_uses_the_size_own_price():
    assert variant_base_price("per_size", None, 1200000) == 1200000


@pytest.mark.parametrize(("mode", "product", "variant"), [("single", None, None), ("per_size", None, None)])
def test_a_missing_price_is_an_error_not_a_zero(mode, product, variant):
    with pytest.raises(ValueError):
        variant_base_price(mode, product, variant)


def test_unknown_mode_is_an_error():
    with pytest.raises(ValueError):
        variant_base_price("tiered", 1, 1)


def test_check_prices_accepts_consistent_input():
    check_prices("single", 1000, [None, None])
    check_prices("per_size", None, [1000, 2000])


@pytest.mark.parametrize(
    ("mode", "product", "variants", "needle"),
    [
        ("single", None, [None], "price"),
        ("single", 1000, [500, None], "per size"),
        ("per_size", 1000, [500], "per size"),
        ("per_size", None, [500, None], "every size"),
        ("per_size", None, [], "size"),
        ("other", 1, [None], "pricing"),
    ],
)
def test_check_prices_rejects_inconsistent_input_with_a_helpful_message(mode, product, variants, needle):
    with pytest.raises(ValueError, match=needle):
        check_prices(mode, product, variants)


# --- how much a discount takes off ---

def test_percent_discount_rounds_half_up_to_whole_kobo():
    assert reduction_for(1000000, "percent", 1000, None) == 100000          # 10% of N10,000
    assert reduction_for(999, "percent", 1000, None) == 100                 # 99.9 -> 100
    assert reduction_for(995, "percent", 1000, None) == 100                 # 99.5 -> 100 (half up)
    assert reduction_for(994, "percent", 1000, None) == 99                  # 99.4 -> 99


def test_fixed_amount_discount_takes_off_that_amount():
    assert reduction_for(1500000, "amount", None, 200000) == 200000


def test_a_discount_never_reduces_a_price_to_zero():
    assert reduction_for(1000, "amount", None, 5000) == 999     # leaves 1 kobo
    assert reduction_for(1000, "percent", 9999, None) == 999    # 99.99% rounds to 1000, capped at 999
    assert reduction_for(1, "amount", None, 100) == 0           # a 1-kobo price cannot go lower


# --- when a discount is live ---

@pytest.mark.parametrize(
    ("over", "expected"),
    [
        ({}, "live"),
        ({"is_enabled": False}, "disabled"),
        ({"starts_at": NOW + HOUR, "ends_at": NOW + 2 * HOUR}, "scheduled"),
        ({"starts_at": NOW - 2 * HOUR, "ends_at": NOW - HOUR}, "ended"),
        ({"starts_at": NOW}, "live"),                 # start is inclusive
        ({"ends_at": NOW}, "ended"),                  # end is exclusive
        ({"is_enabled": False, "starts_at": NOW + HOUR, "ends_at": NOW + 2 * HOUR}, "disabled"),
    ],
)
def test_status_follows_the_schedule(over, expected):
    assert status_of(discount(**over), NOW) == expected


# --- choosing the offer ---

def test_no_discounts_means_no_offer():
    assert best_offer(1000, uuid.uuid4(), [], NOW) is None


def test_only_live_and_applicable_discounts_count():
    pid = uuid.uuid4()
    candidates = [
        discount(id=uuid.UUID(int=1), is_enabled=False),
        discount(id=uuid.UUID(int=2), starts_at=NOW + HOUR, ends_at=NOW + 2 * HOUR),
        discount(id=uuid.UUID(int=3), applies_to_all=False, product_ids=frozenset({uuid.uuid4()})),
    ]
    assert best_offer(10000, pid, candidates, NOW) is None


def test_selected_piece_discounts_apply_to_those_pieces_only():
    mine, other = uuid.uuid4(), uuid.uuid4()
    d = discount(applies_to_all=False, product_ids=frozenset({mine}))
    assert best_offer(10000, mine, [d], NOW).final_kobo == 9000
    assert best_offer(10000, other, [d], NOW) is None


def test_the_best_single_discount_wins_and_they_do_not_stack():
    ten_percent = discount(id=uuid.UUID(int=1))                                    # takes 1,000
    fixed = discount(id=uuid.UUID(int=2), kind="amount", percent_bp=None, amount_kobo=2500)  # takes 2,500
    offer = best_offer(10000, uuid.uuid4(), [ten_percent, fixed], NOW)
    assert offer.discount.id == fixed.id
    assert offer.reduction_kobo == 2500 and offer.final_kobo == 7500


def test_ties_are_broken_deterministically():
    a = discount(id=uuid.UUID(int=1), ends_at=NOW + 2 * HOUR)
    b = discount(id=uuid.UUID(int=2), ends_at=NOW + HOUR)
    assert best_offer(10000, uuid.uuid4(), [a, b], NOW).discount.id == b.id      # ends sooner
    assert best_offer(10000, uuid.uuid4(), [b, a], NOW).discount.id == b.id      # order of input irrelevant


# --- quoting one size and summarising a piece ---

def test_quote_for_a_size_without_a_discount():
    q = quote_variant("single", 1500000, None, uuid.uuid4(), [], NOW)
    assert (q.base_kobo, q.final_kobo, q.discount) == (1500000, 1500000, None)


def test_quote_applies_the_live_discount_to_that_sizes_own_price():
    pid = uuid.uuid4()
    q = quote_variant("per_size", None, 2000000, pid, [discount()], NOW)
    assert (q.base_kobo, q.final_kobo) == (2000000, 1800000)
    assert q.discount.name == "Sale"


def test_product_summary_for_one_price_without_sale():
    quotes = [quote_variant("single", 1000, None, uuid.uuid4(), [], NOW)] * 2
    s = product_pricing(quotes)
    assert (s.from_price_kobo, s.price_varies, s.sale_price_kobo, s.discount) == (1000, False, None, None)


def test_product_summary_shows_the_from_price_when_sizes_differ():
    pid = uuid.uuid4()
    quotes = [
        quote_variant("per_size", None, 1500000, pid, [], NOW),
        quote_variant("per_size", None, 1200000, pid, [], NOW),
    ]
    s = product_pricing(quotes)
    assert s.from_price_kobo == 1200000 and s.price_varies is True


def test_product_summary_reports_the_lowest_sale_price_and_its_discount():
    pid = uuid.uuid4()
    quotes = [
        quote_variant("per_size", None, 1500000, pid, [discount()], NOW),
        quote_variant("per_size", None, 1000000, pid, [discount()], NOW),
    ]
    s = product_pricing(quotes)
    assert s.from_price_kobo == 1000000
    assert s.sale_price_kobo == 900000
    assert s.discount.name == "Sale"


def test_product_summary_of_nothing_is_empty_not_a_crash():
    s = product_pricing([])
    assert s.from_price_kobo is None and s.sale_price_kobo is None
