import { describe, it, expect } from 'vitest';
import { addToCartState, checkoutBlocked, lineNotices, maxQuantityFor, stepperState } from '../src/lib/cart.js';

const line = (over = {}) => ({
  variant_id: 'v1', name: 'Dress', size: 'M', quantity: 2, unit_price_kobo: 900000, base_price_kobo: 1000000,
  line_total_kobo: 1800000, price_changed_from_kobo: null, problem: null, problem_message: null,
  available_quantity: 5, ...over,
});

describe('lineNotices', () => {
  it('says nothing for a healthy line', () => {
    expect(lineNotices(line())).toEqual([]);
  });

  it('tells the shopper when the price changed since they last saw it', () => {
    expect(lineNotices(line({ price_changed_from_kobo: 1000000, unit_price_kobo: 900000 }))).toEqual([
      { kind: 'price', text: 'Price changed from ₦10,000 to ₦9,000 since you added it.' },
    ]);
    expect(lineNotices(line({ price_changed_from_kobo: 800000, unit_price_kobo: 900000 }))[0].text)
      .toBe('Price changed from ₦8,000 to ₦9,000 since you added it.');
  });

  it('shows the problem the server found', () => {
    expect(lineNotices(line({ problem: 'out_of_stock', problem_message: 'Sold out' }))).toEqual([{ kind: 'problem', text: 'Sold out' }]);
  });

  it('can show both, problem first', () => {
    const notices = lineNotices(line({ problem: 'reduced', problem_message: 'Only 1 left in this size', price_changed_from_kobo: 1000000 }));
    expect(notices.map((n) => n.kind)).toEqual(['problem', 'price']);
  });
});

describe('stepperState', () => {
  it('lets the shopper go up to what is available and down to 1', () => {
    expect(stepperState(line({ quantity: 2, available_quantity: 5 }))).toEqual({ canDecrease: true, canIncrease: true });
    expect(stepperState(line({ quantity: 1, available_quantity: 5 }))).toEqual({ canDecrease: false, canIncrease: true });
    expect(stepperState(line({ quantity: 5, available_quantity: 5 }))).toEqual({ canDecrease: true, canIncrease: false });
  });

  it('only lets a line that has too many go down', () => {
    expect(stepperState(line({ quantity: 4, available_quantity: 2, problem: 'reduced' }))).toEqual({ canDecrease: true, canIncrease: false });
  });

  it('allows no increase when nothing is available', () => {
    expect(stepperState(line({ available_quantity: 0, problem: 'out_of_stock' })).canIncrease).toBe(false);
  });
});

describe('checkoutBlocked', () => {
  it('blocks checkout for an empty cart, a missing cart or a cart with problems', () => {
    expect(checkoutBlocked(null)).toBe(true);
    expect(checkoutBlocked({ lines: [], has_problems: false })).toBe(true);
    expect(checkoutBlocked({ lines: [line()], has_problems: true })).toBe(true);
  });

  it('allows a healthy cart', () => {
    expect(checkoutBlocked({ lines: [line()], has_problems: false })).toBe(false);
  });
});

describe('maxQuantityFor', () => {
  const product = (max = null) => ({ max_per_order: max });

  it('is the smallest of stock, the owner limit and the line ceiling', () => {
    expect(maxQuantityFor(product(), { stock: 4 }, 10)).toBe(4);
    expect(maxQuantityFor(product(2), { stock: 4 }, 10)).toBe(2);
    expect(maxQuantityFor(product(), { stock: 40 }, 10)).toBe(10);
  });

  it('falls back to a ceiling of 10 when the options could not be loaded', () => {
    expect(maxQuantityFor(product(), { stock: 40 }, undefined)).toBe(10);
  });

  it('is 0 when sold out', () => {
    expect(maxQuantityFor(product(), { stock: 0 }, 10)).toBe(0);
  });
});

describe('addToCartState', () => {
  const variant = { id: 'v1', size: 'M', stock: 3 };
  const piece = { max_per_order: null };

  it('asks signed-out visitors to sign in', () => {
    expect(addToCartState({ signedIn: false, product: piece, variant, ceiling: 10 }).kind).toBe('signin');
  });

  it('waits while we do not yet know whether anyone is signed in', () => {
    expect(addToCartState({ signedIn: null, product: piece, variant, ceiling: 10 }).kind).toBe('wait');
  });

  it('asks for a size when none is chosen, and reports sold out when none can be', () => {
    expect(addToCartState({ signedIn: true, product: piece, variant: null, ceiling: 10, soldOut: false }).kind).toBe('choose_size');
    expect(addToCartState({ signedIn: true, product: piece, variant: null, ceiling: 10, soldOut: true }).kind).toBe('sold_out');
  });

  it('is ready with the most that can be bought', () => {
    expect(addToCartState({ signedIn: true, product: { max_per_order: 2 }, variant, ceiling: 10 })).toEqual({ kind: 'ready', max: 2 });
  });
});
