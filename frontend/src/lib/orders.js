// Pure display rules for order history.

const LABELS = {
  pending: 'Awaiting payment',
  paid: 'Paid',
  failed: 'Payment failed',
  cancelled: 'Cancelled',
};

/** A status in words a shopper understands; an unknown one is shown as it is, not hidden. */
export const orderStatusLabel = (status) => LABELS[status] ?? status;
