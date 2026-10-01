import { describe, it, expect } from 'vitest';
import { formatWhen, fromLocalInputValue, toLocalInputValue } from '../src/lib/time.js';

// The timezone offset is always passed in (minutes BEHIND UTC, like Date#getTimezoneOffset),
// so these tests give the same answer on any machine, in any country.
const UTC_PLUS_1 = -60; // Lagos

describe('toLocalInputValue', () => {
  it('formats a UTC instant as the local wall-clock value a datetime-local box expects', () => {
    expect(toLocalInputValue('2026-10-01T12:00:00Z', UTC_PLUS_1)).toBe('2026-10-01T13:00');
    expect(toLocalInputValue('2026-10-01T12:00:00Z', 0)).toBe('2026-10-01T12:00');
    expect(toLocalInputValue('2026-10-01T12:00:00Z', 300)).toBe('2026-10-01T07:00'); // UTC-5
  });

  it('can cross midnight', () => {
    expect(toLocalInputValue('2026-10-01T23:30:00Z', UTC_PLUS_1)).toBe('2026-10-02T00:30');
  });

  it('gives an empty string for nothing or garbage', () => {
    expect(toLocalInputValue(null, 0)).toBe('');
    expect(toLocalInputValue('not a date', 0)).toBe('');
  });
});

describe('fromLocalInputValue', () => {
  it('turns a local wall-clock value into a UTC ISO string the API accepts', () => {
    expect(fromLocalInputValue('2026-10-01T13:00', UTC_PLUS_1)).toBe('2026-10-01T12:00:00.000Z');
    expect(fromLocalInputValue('2026-10-02T00:30', UTC_PLUS_1)).toBe('2026-10-01T23:30:00.000Z');
  });

  it('round-trips with toLocalInputValue', () => {
    const iso = '2026-12-31T22:15:00.000Z';
    expect(fromLocalInputValue(toLocalInputValue(iso, UTC_PLUS_1), UTC_PLUS_1)).toBe(iso);
  });

  it('refuses empty or malformed values', () => {
    for (const bad of ['', 'nope', '2026-13-45T99:99', '2026-10-01', null, undefined]) {
      expect(fromLocalInputValue(bad, 0)).toBeNull();
    }
  });
});

describe('formatWhen', () => {
  it('writes a readable date and 12-hour time in the given zone', () => {
    expect(formatWhen('2026-10-01T12:00:00Z', UTC_PLUS_1)).toBe('1 Oct 2026, 1:00 pm');
    expect(formatWhen('2026-10-03T17:05:00Z', 0)).toBe('3 Oct 2026, 5:05 pm');
  });

  it('handles midnight and noon correctly (12 am / 12 pm, never 0)', () => {
    expect(formatWhen('2026-10-01T00:00:00Z', 0)).toBe('1 Oct 2026, 12:00 am');
    expect(formatWhen('2026-10-01T12:00:00Z', 0)).toBe('1 Oct 2026, 12:00 pm');
  });

  it('returns an empty string for bad input', () => {
    expect(formatWhen(null, 0)).toBe('');
    expect(formatWhen('garbage', 0)).toBe('');
  });
});
