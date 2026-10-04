import { describe, it, expect } from 'vitest';
import { formatNaira, koboToInput, nairaToKobo } from '../src/lib/money.js';

describe('formatNaira', () => {
  it('shows whole naira without decimals and groups thousands', () => {
    expect(formatNaira(150000)).toBe('₦1,500');
    expect(formatNaira(100)).toBe('₦1');
    expect(formatNaira(123456700)).toBe('₦1,234,567');
  });

  it('shows kobo only when there are some', () => {
    expect(formatNaira(150050)).toBe('₦1,500.50');
    expect(formatNaira(5)).toBe('₦0.05');
  });

  it('handles zero', () => {
    expect(formatNaira(0)).toBe('₦0');
  });

  it('never invents a price from bad data', () => {
    expect(formatNaira(-1)).toBe('—');
    expect(formatNaira(1.5)).toBe('—');
    expect(formatNaira(null)).toBe('—');
    expect(formatNaira(undefined)).toBe('—');
    expect(formatNaira('1500')).toBe('—');
  });
});

describe('koboToInput', () => {
  it('gives the plain text an owner would type back into a price box', () => {
    expect(koboToInput(1500000)).toBe('15000');
    expect(koboToInput(1500050)).toBe('15000.50');
    expect(koboToInput(5)).toBe('0.05');
    expect(koboToInput(0)).toBe('0');
  });

  it('round-trips with nairaToKobo', () => {
    for (const kobo of [0, 1, 99, 100, 1999, 1500050, 123456789]) {
      expect(nairaToKobo(koboToInput(kobo))).toBe(kobo);
    }
  });

  it('returns an empty string for bad data', () => {
    expect(koboToInput(null)).toBe('');
    expect(koboToInput(-1)).toBe('');
  });
});

describe('nairaToKobo', () => {
  it('converts what an owner would type, using exact integer maths', () => {
    expect(nairaToKobo('1500')).toBe(150000);
    expect(nairaToKobo('1,500')).toBe(150000);
    expect(nairaToKobo(' 1,500.5 ')).toBe(150050);
    expect(nairaToKobo('19.99')).toBe(1999); // 19.99 * 100 is 1998.9999999999998 with floats
    expect(nairaToKobo('0')).toBe(0);
  });

  it('refuses anything that is not a plain amount', () => {
    for (const bad of ['', '  ', 'abc', '-5', '1.234', '1..5', '1e3', '₦100', null, undefined, 12]) {
      expect(nairaToKobo(bad)).toBeNull();
    }
  });
});
