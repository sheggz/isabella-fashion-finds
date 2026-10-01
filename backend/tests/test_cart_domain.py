import pytest

from app.domain.cart import (
    MAX_PER_LINE,
    CartLine,
    allowed_quantity,
    cart_totals,
    line_problem,
    quantity_problem,
)

# --- how many of one size a shopper may hold ---

def test_the_allowed_quantity_is_the_smallest_of_stock_and_the_line_ceiling():
    assert allowed_quantity(stock=3, max_per_order=None, others_in_piece=0) == 3
    assert allowed_quantity(stock=50, max_per_order=None, others_in_piece=0) == MAX_PER_LINE == 10


def test_the_per_order_limit_counts_every_size_of_the_same_piece():
    assert allowed_quantity(stock=9, max_per_order=2, others_in_piece=0) == 2
    assert allowed_quantity(stock=9, max_per_order=2, others_in_piece=1) == 1   # one already held in another size
    assert allowed_quantity(stock=9, max_per_order=2, others_in_piece=2) == 0
    assert allowed_quantity(stock=9, max_per_order=2, others_in_piece=5) == 0   # never negative


def test_a_sold_out_size_allows_nothing():
    assert allowed_quantity(stock=0, max_per_order=None, others_in_piece=0) == 0


# --- why a requested quantity is refused ---

def test_a_fine_quantity_has_no_problem():
    assert quantity_problem(2, stock=5, max_per_order=None, others_in_piece=0) is None


def test_asking_for_more_than_is_in_stock_is_a_stock_problem_naming_what_is_left():
    p = quantity_problem(5, stock=3, max_per_order=None, others_in_piece=0)
    assert (p.kind, p.allowed) == ("stock", 3)
    assert "3" in p.message


def test_asking_for_more_than_the_ceiling_or_the_order_limit_is_a_limit_problem():
    ceiling = quantity_problem(11, stock=50, max_per_order=None, others_in_piece=0)
    assert (ceiling.kind, ceiling.allowed) == ("limit", 10)
    owner_limit = quantity_problem(2, stock=9, max_per_order=2, others_in_piece=1)
    assert (owner_limit.kind, owner_limit.allowed) == ("limit", 1)
    assert "per order" in owner_limit.message


def test_stock_is_reported_before_limits():
    p = quantity_problem(5, stock=2, max_per_order=1, others_in_piece=0)
    assert p.kind == "stock"


@pytest.mark.parametrize("bad", [0, -1])
def test_a_quantity_below_one_is_a_programming_error_not_a_user_problem(bad):
    with pytest.raises(ValueError):
        quantity_problem(bad, stock=5, max_per_order=None, others_in_piece=0)


# --- the state of a line already in the cart ---

def test_a_healthy_line_has_no_problem():
    assert line_problem(is_active=True, stock=5, quantity=2, max_per_order=None, others_in_piece=0) is None


def test_hidden_pieces_are_unavailable():
    assert line_problem(is_active=False, stock=5, quantity=1, max_per_order=None, others_in_piece=0) == "unavailable"


def test_stock_changes_show_up_as_out_of_stock_or_reduced():
    assert line_problem(is_active=True, stock=0, quantity=1, max_per_order=None, others_in_piece=0) == "out_of_stock"
    assert line_problem(is_active=True, stock=1, quantity=3, max_per_order=None, others_in_piece=0) == "reduced"


def test_a_lowered_order_limit_shows_up_as_a_limit_problem():
    assert line_problem(is_active=True, stock=9, quantity=3, max_per_order=2, others_in_piece=0) == "limit"


# --- totals ---

def line(unit, base, qty, problem=None):
    return CartLine(unit_kobo=unit, base_kobo=base, quantity=qty, problem=problem)


def test_totals_add_up_quantity_times_the_current_price():
    t = cart_totals([line(900, 1000, 2), line(500, 500, 1)])
    assert (t.subtotal_kobo, t.savings_kobo, t.item_count) == (2300, 200, 3)


def test_lines_with_problems_are_left_out_of_the_money_but_counted_in_the_badge():
    t = cart_totals([line(900, 1000, 2), line(500, 500, 3, problem="out_of_stock")])
    assert t.subtotal_kobo == 1800 and t.savings_kobo == 200
    assert t.item_count == 5
    assert t.has_problems is True


def test_an_empty_cart_is_all_zeros():
    t = cart_totals([])
    assert (t.subtotal_kobo, t.savings_kobo, t.item_count, t.has_problems) == (0, 0, 0, False)
