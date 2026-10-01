# 0011. Server-side cart, per-order limits and order snapshots

Status: Accepted · Date: 2026-10-01

## Context
Shoppers need a cart that survives refreshes and devices, the owner needs to cap how many of a piece one order may contain (including one-of-a-kind finds), and order history must stay accurate when products change later. Prices already depend on live discounts (ADR 0010), and the shop must never charge a price the server did not compute.

## Decision
- **Sign in first; the cart lives on the server.** One row per shopper per size (`cart_items`, unique on user + size). No guest cart and no merge logic.
- **The cart does not reserve stock.** Stock is checked when adding or changing a line and again at checkout; it is only reduced when payment is confirmed. No holds means no expiry job and no stuck stock.
- **Always show the current price, with a notice.** Every read re-prices each line through the same pure `quote_variant` used by the storefront. The cart remembers the price the shopper last saw (`price_at_add_kobo`, refreshed when they change a quantity) and flags a difference ("Price changed from X to Y"). That stored value is a notice only; it is never what is charged.
- **Quantity rules are pure** (`app/domain/cart.py`): a line never exceeds the stock, a ceiling of 10 per size line (published through `/catalogue/options` so the browser keeps no copy), and the owner's optional **limit per order**, a per-piece number counted across all sizes in the cart (use 1 for one-of-a-kind items). Refusals are 409s: `out_of_stock` and `limit_exceeded`, with `{allowed, in_cart}` so the UI can explain.
- **Lines that go bad are visible, not silent.** If a piece is hidden, stock drops, or the limit is lowered after adding, the line shows a problem, is excluded from the subtotal, and will block checkout. If the owner removes a size, its cart lines disappear (database cascade).
- **Orders store snapshots.** `order_items` copy the product name, size, photo path, the unit price actually charged, the pre-discount price and the discount's name. Links to the product and size are `ON DELETE SET NULL`, so history survives edits and deletions. A shopper with orders cannot be deleted (`RESTRICT`). The server reports another shopper's order as "not found".
- Orders are read-only in this milestone; creating them belongs to checkout.

## Alternatives considered
- **Guest cart in the browser, merged on sign-in:** friendlier for browsing, but a second cart implementation plus merge, price and stock re-checks on login.
- **Timed stock reservations:** protects a shopper mid-checkout, but needs reservation records and a cleanup job.
- **Lock the price at add time:** shoppers keep sale prices after they end; needs explicit expiry rules and can cost the shop money.
- **Orders that reference live products:** less data, but history changes whenever a product is edited, and breaks if it is deleted.
- **A fixed per-line maximum only:** simpler, but cannot express "one per customer" or "two of this piece in total" across sizes.

## Consequences
- (+) One pricing function everywhere; the cart can never show a price the server would not charge; the owner controls scarcity per piece; order history is a faithful record.
- (-) Two shoppers can both hold the last item; the second finds out at checkout (by design). The cart re-prices on every read (a few extra queries). The "price changed" notice resets once the shopper changes a quantity.
