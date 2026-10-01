"""Cart rules. Pure: no database, no HTTP, no clock.

Money is integer kobo. These rules decide how many of an item a shopper may hold and what a cart
is worth; the services feed them real stock and prices.
"""
from dataclasses import dataclass

MAX_PER_LINE = 10  # a sensible ceiling for one size of one piece, whatever the stock


@dataclass(frozen=True)
class QuantityProblem:
    kind: str  # "stock" or "limit"
    allowed: int  # the most the shopper may hold of this size right now
    message: str


@dataclass(frozen=True)
class CartLine:
    unit_kobo: int  # price per item right now (after any live discount)
    base_kobo: int  # price per item before any discount
    quantity: int
    problem: str | None = None


@dataclass(frozen=True)
class CartTotals:
    subtotal_kobo: int
    savings_kobo: int
    item_count: int
    has_problems: bool


def allowed_quantity(stock: int, max_per_order: int | None, others_in_piece: int) -> int:
    """The most of one size a shopper may hold, never negative.

    `others_in_piece` is how many of the SAME piece (in other sizes) they already hold: the
    owner's per-order limit is about the piece as a whole, so a limit of 2 means two in total
    across sizes, not two of each.
    """
    cap = min(stock, MAX_PER_LINE)
    if max_per_order is not None:
        cap = min(cap, max_per_order - others_in_piece)
    return max(cap, 0)


def quantity_problem(
    requested: int, stock: int, max_per_order: int | None, others_in_piece: int
) -> QuantityProblem | None:
    """Why `requested` is not allowed, or None when it is fine. Stock is reported before limits."""
    if requested < 1:
        raise ValueError("quantity must be at least 1")  # a bug in the caller, not a user mistake
    allowed = allowed_quantity(stock, max_per_order, others_in_piece)
    if requested <= allowed:
        return None
    if requested > stock:
        message = "Sold out" if stock == 0 else f"Only {stock} left in this size"
        return QuantityProblem("stock", allowed, message)
    if max_per_order is not None and requested > max_per_order - others_in_piece:
        return QuantityProblem("limit", allowed, f"This piece is limited to {max_per_order} per order")
    return QuantityProblem("limit", allowed, f"You can buy at most {MAX_PER_LINE} of one size at a time")


def line_problem(
    is_active: bool, stock: int, quantity: int, max_per_order: int | None, others_in_piece: int
) -> str | None:
    """The state of a line ALREADY in the cart, which can go bad after it was added.

    "unavailable": the piece was hidden. "out_of_stock": nothing left. "reduced": less stock
    than the quantity held. "limit": the owner lowered the per-order limit.
    """
    if not is_active:
        return "unavailable"
    if stock <= 0:
        return "out_of_stock"
    if quantity > stock:
        return "reduced"
    if quantity > allowed_quantity(stock, max_per_order, others_in_piece):
        return "limit"
    return None


def cart_totals(lines: list[CartLine]) -> CartTotals:
    """What the cart is worth. Lines with a problem are left out of the money (they cannot be
    bought as they are) but still counted in the item badge so the shopper notices them."""
    ok = [item for item in lines if item.problem is None]
    return CartTotals(
        subtotal_kobo=sum(item.unit_kobo * item.quantity for item in ok),
        savings_kobo=sum((item.base_kobo - item.unit_kobo) * item.quantity for item in ok),
        item_count=sum(item.quantity for item in lines),
        has_problems=any(item.problem is not None for item in lines),
    )
