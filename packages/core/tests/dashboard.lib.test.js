import { describe, it, expect } from 'vitest';
import { barHeights, shortDayLabel } from '../src/index.js';

describe('barHeights', () => {
  it('scales the biggest value to 100 and the rest in proportion', () => {
    expect(barHeights([0, 50, 100])).toEqual([0, 50, 100]);
  });
  it('gives every bar 0 when there is nothing to show (no division by zero)', () => {
    expect(barHeights([0, 0])).toEqual([0, 0]);
    expect(barHeights([])).toEqual([]);
  });
  it('keeps a tiny non-zero value visible (at least 4)', () => {
    expect(barHeights([1, 1000])[0]).toBe(4);
  });
  it('does not change its input', () => {
    const v = [1, 2];
    barHeights(v);
    expect(v).toEqual([1, 2]);
  });
});

describe('shortDayLabel', () => {
  it('turns an ISO date into "10 Oct"', () => {
    expect(shortDayLabel('2026-10-10')).toBe('10 Oct');
    expect(shortDayLabel('2026-01-05')).toBe('5 Jan');
  });
  it('returns the input for something that is not a date', () => {
    expect(shortDayLabel('nope')).toBe('nope');
  });
});
