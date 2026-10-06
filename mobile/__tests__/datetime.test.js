import { dateToLocalInput, localInputToDate } from '../src/lib/datetime';

describe('datetime helpers (the phone clock)', () => {
  it('writes a Date as the "YYYY-MM-DDTHH:mm" text the shared discount form uses', () => {
    expect(dateToLocalInput(new Date(2026, 9, 5, 7, 3))).toBe('2026-10-05T07:03');
  });

  it('reads that text back into a Date with the same wall-clock parts', () => {
    const d = localInputToDate('2026-10-05T07:03');
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()]).toEqual([2026, 9, 5, 7, 3]);
  });

  it('round-trips', () => {
    expect(dateToLocalInput(localInputToDate('2026-12-31T23:59'))).toBe('2026-12-31T23:59');
  });

  it('returns null for empty or invalid text, never an Invalid Date', () => {
    expect(localInputToDate('')).toBeNull();
    expect(localInputToDate('nope')).toBeNull();
    expect(localInputToDate('2026-13-45T10:00')).toBeNull();
  });
});
