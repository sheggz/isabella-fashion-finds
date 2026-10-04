import { describe, it, expect } from 'vitest';
import {
  appliesText, describeDiscount, discountToForm, emptyDiscountForm, formToDiscountPayload,
} from '../src/lib/discountForm.js';

const TZ = -60; // UTC+1 (Lagos); the offset is passed in so results never depend on the machine
const NOW = Date.parse('2026-10-01T12:00:00Z');

const form = (over = {}) => ({
  name: '  Weekend sale ',
  kind: 'percent',
  value: '10',
  scope: 'all',
  productIds: [],
  startsAt: '2026-10-02T09:00',
  endsAt: '2026-10-04T18:00',
  isEnabled: true,
  ...over,
});

describe('emptyDiscountForm', () => {
  it('starts now and runs for a week, in the viewer\'s local time, enabled, for every piece', () => {
    expect(emptyDiscountForm(NOW, TZ)).toEqual({
      name: '', kind: 'percent', value: '', scope: 'all', productIds: [],
      startsAt: '2026-10-01T13:00', endsAt: '2026-10-08T13:00', isEnabled: true,
    });
  });
});

describe('formToDiscountPayload', () => {
  it('builds the API payload for a percentage off every piece, converting local times to UTC', () => {
    expect(formToDiscountPayload(form(), TZ)).toEqual({
      ok: true,
      value: {
        name: 'Weekend sale', kind: 'percent', percent: 10, applies_to_all: true, product_ids: [],
        starts_at: '2026-10-02T08:00:00.000Z', ends_at: '2026-10-04T17:00:00.000Z', is_enabled: true,
      },
    });
  });

  it('accepts decimals in a percentage', () => {
    expect(formToDiscountPayload(form({ value: '12.5' }), TZ).value.percent).toBe(12.5);
  });

  it('builds a fixed-amount discount in kobo and sends no percentage', () => {
    const { value } = formToDiscountPayload(form({ kind: 'amount', value: '2,500.50' }), TZ);
    expect(value.amount_kobo).toBe(250050);
    expect(value).not.toHaveProperty('percent');
  });

  it('sends the chosen pieces, and none when it applies to every piece', () => {
    const chosen = formToDiscountPayload(form({ scope: 'selected', productIds: ['a', 'b'] }), TZ).value;
    expect(chosen).toMatchObject({ applies_to_all: false, product_ids: ['a', 'b'] });
    const ignored = formToDiscountPayload(form({ scope: 'all', productIds: ['a'] }), TZ).value;
    expect(ignored).toMatchObject({ applies_to_all: true, product_ids: [] });
  });

  it('requires a name', () => {
    expect(formToDiscountPayload(form({ name: '  ' }), TZ).errors.name).toMatch(/name/i);
  });

  it('requires a percentage above 0 and below 100 with at most two decimals', () => {
    for (const bad of ['', '0', '100', '150', '-5', 'abc', '10.123']) {
      expect(formToDiscountPayload(form({ value: bad }), TZ).errors.value).toMatch(/percentage/i);
    }
  });

  it('requires an amount in naira above zero', () => {
    for (const bad of ['', '0', 'abc', '-100', '1.234']) {
      expect(formToDiscountPayload(form({ kind: 'amount', value: bad }), TZ).errors.value).toMatch(/amount/i);
    }
  });

  it('requires at least one piece when it does not apply to every piece', () => {
    expect(formToDiscountPayload(form({ scope: 'selected', productIds: [] }), TZ).errors.products).toMatch(/at least one piece/i);
  });

  it('requires valid start and end times', () => {
    const result = formToDiscountPayload(form({ startsAt: '', endsAt: 'garbage' }), TZ);
    expect(result.errors.startsAt).toMatch(/date and time/i);
    expect(result.errors.endsAt).toMatch(/date and time/i);
  });

  it('requires the end to be after the start', () => {
    for (const endsAt of ['2026-10-02T09:00', '2026-10-01T09:00']) {
      expect(formToDiscountPayload(form({ endsAt }), TZ).errors.endsAt).toMatch(/after the start/i);
    }
  });

  it('reports every problem together', () => {
    const result = formToDiscountPayload(form({ name: '', value: '', startsAt: '' }), TZ);
    expect(Object.keys(result.errors).sort()).toEqual(['name', 'startsAt', 'value']);
  });

  it('does not mutate the form it is given', () => {
    const f = form({ scope: 'selected', productIds: ['a'] });
    const copy = JSON.parse(JSON.stringify(f));
    formToDiscountPayload(f, TZ);
    expect(f).toEqual(copy);
  });
});

describe('discountToForm', () => {
  const saved = {
    name: 'Weekend sale', kind: 'percent', percent: 12.5, amount_kobo: null, applies_to_all: false,
    product_ids: ['a', 'b'], starts_at: '2026-10-02T08:00:00Z', ends_at: '2026-10-04T17:00:00Z', is_enabled: false,
  };

  it('fills the form from a saved discount, showing times in local time', () => {
    expect(discountToForm(saved, TZ)).toEqual({
      name: 'Weekend sale', kind: 'percent', value: '12.5', scope: 'selected', productIds: ['a', 'b'],
      startsAt: '2026-10-02T09:00', endsAt: '2026-10-04T18:00', isEnabled: false,
    });
  });

  it('shows an amount discount as plain naira', () => {
    const f = discountToForm({ ...saved, kind: 'amount', percent: null, amount_kobo: 250050, applies_to_all: true, product_ids: [] }, TZ);
    expect(f).toMatchObject({ kind: 'amount', value: '2500.50', scope: 'all', productIds: [] });
  });

  it('round-trips: saving unchanged data gives back the same instants', () => {
    const payload = formToDiscountPayload(discountToForm(saved, TZ), TZ).value;
    expect(payload).toMatchObject({
      percent: 12.5, starts_at: '2026-10-02T08:00:00.000Z', ends_at: '2026-10-04T17:00:00.000Z', product_ids: ['a', 'b'], is_enabled: false,
    });
  });
});

describe('describing a discount in the list', () => {
  it('writes the value as the owner would say it', () => {
    expect(describeDiscount({ kind: 'percent', percent: 10 })).toBe('10% off');
    expect(describeDiscount({ kind: 'percent', percent: 12.5 })).toBe('12.5% off');
    expect(describeDiscount({ kind: 'amount', amount_kobo: 250000 })).toBe('₦2,500 off');
  });

  it('says what it applies to', () => {
    expect(appliesText({ applies_to_all: true, product_ids: [] })).toBe('Every piece');
    expect(appliesText({ applies_to_all: false, product_ids: ['a'] })).toBe('1 piece');
    expect(appliesText({ applies_to_all: false, product_ids: ['a', 'b', 'c'] })).toBe('3 pieces');
  });
});
