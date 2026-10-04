import { describe, it, expect } from 'vitest';
import { discountNote, percentOff, priceDisplay, variantPriceDisplay } from '../src/lib/pricing.js';

const product = (over = {}) => ({
  pricing_mode: 'single',
  price_kobo: 1500000,
  price_varies: false,
  sale_price_kobo: null,
  discount: null,
  ...over,
});

describe('priceDisplay (for cards and listings)', () => {
  it('shows the plain price when there is no sale', () => {
    expect(priceDisplay(product())).toEqual({ prefix: '', current: 1500000, original: null });
  });

  it('adds "From" when sizes cost different amounts', () => {
    expect(priceDisplay(product({ pricing_mode: 'per_size', price_kobo: 1200000, price_varies: true }))).toEqual({
      prefix: 'From ', current: 1200000, original: null,
    });
  });

  it('shows the sale price with the original to strike through', () => {
    expect(priceDisplay(product({ sale_price_kobo: 1350000 }))).toEqual({ prefix: '', current: 1350000, original: 1500000 });
  });

  it('combines "From" and a sale', () => {
    expect(priceDisplay(product({ price_kobo: 1000000, price_varies: true, sale_price_kobo: 900000 }))).toEqual({
      prefix: 'From ', current: 900000, original: 1000000,
    });
  });

  it('does not invent a price when none is known', () => {
    expect(priceDisplay(product({ price_kobo: null }))).toEqual({ prefix: '', current: null, original: null });
  });
});

describe('variantPriceDisplay (for one size)', () => {
  it('shows the size price, or its sale', () => {
    expect(variantPriceDisplay({ price_kobo: 2000000, sale_price_kobo: null })).toEqual({ current: 2000000, original: null });
    expect(variantPriceDisplay({ price_kobo: 2000000, sale_price_kobo: 1800000 })).toEqual({ current: 1800000, original: 2000000 });
  });
});

describe('percentOff', () => {
  it('rounds to a whole percent', () => {
    expect(percentOff(1500000, 1350000)).toBe(10);
    expect(percentOff(3000, 2000)).toBe(33);
  });

  it('is 0 when there is nothing worth announcing or the data is odd', () => {
    expect(percentOff(1000, 1000)).toBe(0);
    expect(percentOff(1000, 999)).toBe(0);
    expect(percentOff(1000, 1500)).toBe(0);
    expect(percentOff(null, 500)).toBe(0);
    expect(percentOff(0, 0)).toBe(0);
  });
});

describe('discountNote', () => {
  it('names the sale and when it ends, in the shopper\'s time zone', () => {
    const discount = { name: 'Weekend sale', ends_at: '2026-10-03T17:00:00Z' };
    expect(discountNote(discount, -60)).toBe('Weekend sale · ends 3 Oct 2026, 6:00 pm');
  });

  it('is empty when there is no discount', () => {
    expect(discountNote(null, 0)).toBe('');
  });
});
