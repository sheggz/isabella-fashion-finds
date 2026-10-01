"""Order rules. Pure. (Creating orders from a cart arrives with checkout.)"""

# pending: created, waiting for payment. paid: payment confirmed. failed / cancelled: never paid.
ORDER_STATUSES = ("pending", "paid", "failed", "cancelled")
