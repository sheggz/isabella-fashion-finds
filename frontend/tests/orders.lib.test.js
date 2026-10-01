import { describe, it, expect } from 'vitest';
import { orderStatusLabel } from '../src/lib/orders.js';

describe('orderStatusLabel', () => {
  it('uses words a shopper understands', () => {
    expect(orderStatusLabel('pending')).toBe('Awaiting payment');
    expect(orderStatusLabel('paid')).toBe('Paid');
    expect(orderStatusLabel('failed')).toBe('Payment failed');
    expect(orderStatusLabel('cancelled')).toBe('Cancelled');
  });

  it('shows an unknown status as it is rather than hiding it', () => {
    expect(orderStatusLabel('refunded')).toBe('refunded');
  });
});
