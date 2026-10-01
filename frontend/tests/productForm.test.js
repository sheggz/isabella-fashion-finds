import { describe, it, expect } from 'vitest';
import { formToPayload, productToForm, emptyForm } from '../src/lib/productForm.js';

const OPTIONS = {
  sizes: [
    { value: 'XS', label: 'XS' },
    { value: 'S', label: 'S' },
    { value: 'M', label: 'M' },
    { value: 'ONE_SIZE', label: 'One size' },
  ],
  measurement_parts: [
    { value: 'bust', label: 'Bust' },
    { value: 'waist', label: 'Waist' },
  ],
  unit: 'cm',
};

const row = (over = {}) => ({ enabled: true, stock: '3', price: '', measurements: {}, ...over });

const form = (over = {}) => ({
  name: '  Ankara Dress ',
  description: '  Hand-sewn  ',
  pricingMode: 'single',
  price: '15,000.50',
  maxPerOrder: '',
  isActive: true,
  sizes: {
    M: row({ measurements: { bust: '92', waist: '' } }),
    S: row({ enabled: false, stock: '' }),
  },
  ...over,
});

const perSize = (sizes, over = {}) => form({ pricingMode: 'per_size', price: '', sizes, ...over });

describe('formToPayload: one price for every size', () => {
  it('produces the API payload: trimmed text, kobo price, enabled sizes only, blank measurements dropped', () => {
    expect(formToPayload(form(), OPTIONS)).toEqual({
      ok: true,
      value: {
        name: 'Ankara Dress',
        description: 'Hand-sewn',
        pricing_mode: 'single',
        price_kobo: 1500050,
        max_per_order: null,
        is_active: true,
        variants: [{ size: 'M', stock: 3, measurements: { bust: 92 } }],
      },
    });
  });

  it('ignores whatever is typed in the per-size price boxes', () => {
    const f = form({ sizes: { M: row({ price: 'garbage' }) } });
    const result = formToPayload(f, OPTIONS);
    expect(result.ok).toBe(true);
    expect(result.value.variants[0]).not.toHaveProperty('price_kobo');
  });

  it('requires a valid piece price', () => {
    for (const bad of ['', 'abc', '-5', '1.234']) {
      expect(formToPayload(form({ price: bad }), OPTIONS).errors.price).toMatch(/price/i);
    }
  });
});

describe('formToPayload: a price for each size', () => {
  it('puts each size price on its size and leaves the piece price empty', () => {
    const f = perSize({ M: row({ price: '12,000' }), XS: row({ stock: '1', price: '9500.50' }) });
    expect(formToPayload(f, OPTIONS)).toEqual({
      ok: true,
      value: {
        name: 'Ankara Dress',
        description: 'Hand-sewn',
        pricing_mode: 'per_size',
        price_kobo: null,
        max_per_order: null,
        is_active: true,
        variants: [
          { size: 'XS', stock: 1, price_kobo: 950050, measurements: {} },
          { size: 'M', stock: 3, price_kobo: 1200000, measurements: {} },
        ],
      },
    });
  });

  it('ignores the single price box', () => {
    const f = perSize({ M: row({ price: '100' }) }, { price: 'garbage' });
    expect(formToPayload(f, OPTIONS).ok).toBe(true);
  });

  it('requires a valid price on every enabled size, and names the size', () => {
    for (const bad of ['', 'abc', '-5', '1.234']) {
      const result = formToPayload(perSize({ M: row({ price: bad }), XS: row({ price: '100' }) }), OPTIONS);
      expect(result.errors['size.M.price']).toMatch(/price/i);
      expect(result.errors['size.XS.price']).toBeUndefined();
    }
  });

  it('does not require a price on sizes that are switched off', () => {
    const f = perSize({ M: row({ price: '100' }), S: row({ enabled: false, price: '' }) });
    expect(formToPayload(f, OPTIONS).ok).toBe(true);
  });
});

describe('formToPayload: the rest of the form', () => {
  it('lists sizes in the store order, whatever order the form held them', () => {
    const f = form({ sizes: { M: row({ stock: '1' }), XS: row({ stock: '2' }), ONE_SIZE: row({ stock: '3' }) } });
    expect(formToPayload(f, OPTIONS).value.variants.map((v) => v.size)).toEqual(['XS', 'M', 'ONE_SIZE']);
  });

  it('turns a blank description into null (the description is optional)', () => {
    expect(formToPayload(form({ description: '   ' }), OPTIONS).value.description).toBeNull();
  });

  it('allows zero stock and decimal measurements', () => {
    const f = form({ sizes: { M: row({ stock: '0', measurements: { bust: '92.5' } }) } });
    expect(formToPayload(f, OPTIONS).value.variants[0]).toEqual({ size: 'M', stock: 0, measurements: { bust: 92.5 } });
  });

  it('does not mutate the form it is given', () => {
    const f = form();
    const copy = JSON.parse(JSON.stringify(f));
    formToPayload(f, OPTIONS);
    expect(f).toEqual(copy);
  });

  it('requires a name', () => {
    expect(formToPayload(form({ name: '   ' }), OPTIONS).errors.name).toMatch(/name/i);
  });

  it('requires at least one size', () => {
    expect(formToPayload(form({ sizes: { M: row({ enabled: false }) } }), OPTIONS).errors.sizes).toMatch(/at least one size/i);
  });

  it('requires stock to be a whole number of zero or more for each enabled size', () => {
    for (const bad of ['', '-1', '1.5', 'x']) {
      const result = formToPayload(form({ sizes: { M: row({ stock: bad }) } }), OPTIONS);
      expect(result.errors['size.M.stock']).toMatch(/whole number/i);
    }
  });

  it('rejects measurements that are not sensible lengths in cm', () => {
    for (const bad of ['abc', '0', '-3', '301']) {
      const result = formToPayload(form({ sizes: { M: row({ measurements: { bust: bad } }) } }), OPTIONS);
      expect(result.errors['size.M.bust']).toMatch(/Bust/);
    }
  });

  it('ignores problems in sizes that are switched off', () => {
    const f = form({ sizes: { M: row({ stock: '1' }), S: row({ enabled: false, stock: 'garbage', measurements: { bust: 'x' } }) } });
    expect(formToPayload(f, OPTIONS).ok).toBe(true);
  });

  it('reports every problem together', () => {
    const result = formToPayload(form({ name: '', price: 'x', sizes: {} }), OPTIONS);
    expect(result.ok).toBe(false);
    expect(Object.keys(result.errors).sort()).toEqual(['name', 'price', 'sizes']);
  });
});

describe('the limit per order', () => {
  it('is optional: blank means no limit', () => {
    expect(formToPayload(form({ maxPerOrder: '' }), OPTIONS).value.max_per_order).toBeNull();
    expect(formToPayload(form({ maxPerOrder: '   ' }), OPTIONS).value.max_per_order).toBeNull();
  });

  it('accepts a whole number from 1 to 100', () => {
    expect(formToPayload(form({ maxPerOrder: '2' }), OPTIONS).value.max_per_order).toBe(2);
    expect(formToPayload(form({ maxPerOrder: ' 100 ' }), OPTIONS).value.max_per_order).toBe(100);
  });

  it('rejects anything else, naming the field', () => {
    for (const bad of ['0', '-1', '1.5', 'two', '101']) {
      expect(formToPayload(form({ maxPerOrder: bad }), OPTIONS).errors.maxPerOrder).toMatch(/limit/i);
    }
  });

  it('is filled in when editing a piece that has one, and blank when it has none', () => {
    const base = { name: 'x', description: null, pricing_mode: 'single', price_kobo: 100, is_active: true, variants: [{ size: 'M', stock: 1, price_kobo: 100, measurements: {} }] };
    expect(productToForm({ ...base, max_per_order: 3 }, OPTIONS).maxPerOrder).toBe('3');
    expect(productToForm({ ...base, max_per_order: null }, OPTIONS).maxPerOrder).toBe('');
  });
});

describe('productToForm', () => {
  const single = {
    name: 'Ankara Dress', description: null, pricing_mode: 'single', price_kobo: 1500050, is_active: false,
    variants: [{ size: 'M', stock: 3, price_kobo: 1500050, measurements: { bust: 92, waist: 74.3 } }],
  };
  const sized = {
    ...single, pricing_mode: 'per_size', price_kobo: 1200000,
    variants: [
      { size: 'S', stock: 1, price_kobo: 1500000, measurements: {} },
      { size: 'M', stock: 3, price_kobo: 1200000, measurements: {} },
    ],
  };

  it('fills a one-price piece: the shared price, one row per fixed size', () => {
    const f = productToForm(single, OPTIONS);
    expect(f).toMatchObject({ name: 'Ankara Dress', description: '', pricingMode: 'single', price: '15000.50', isActive: false });
    expect(Object.keys(f.sizes)).toEqual(['XS', 'S', 'M', 'ONE_SIZE']);
    expect(f.sizes.M).toEqual({ enabled: true, stock: '3', price: '', measurements: { bust: '92', waist: '74.3' } });
    expect(f.sizes.S.enabled).toBe(false);
  });

  it('fills a per-size piece from each size price and leaves the single price empty', () => {
    const f = productToForm(sized, OPTIONS);
    expect(f.pricingMode).toBe('per_size');
    expect(f.price).toBe('');
    expect(f.sizes.S.price).toBe('15000');
    expect(f.sizes.M.price).toBe('12000');
  });

  it('round-trips both modes: saving unchanged data gives back the same values', () => {
    const a = formToPayload(productToForm(single, OPTIONS), OPTIONS).value;
    expect(a).toMatchObject({ pricing_mode: 'single', price_kobo: 1500050, description: null, is_active: false });
    expect(a.variants).toEqual([{ size: 'M', stock: 3, measurements: { bust: 92, waist: 74.3 } }]);

    const b = formToPayload(productToForm(sized, OPTIONS), OPTIONS).value;
    expect(b).toMatchObject({ pricing_mode: 'per_size', price_kobo: null });
    expect(b.variants.map((v) => [v.size, v.price_kobo])).toEqual([['S', 1500000], ['M', 1200000]]);
  });
});

describe('emptyForm', () => {
  it('starts visible, with one price for every size and every size switched off', () => {
    const f = emptyForm(OPTIONS);
    expect(f).toMatchObject({ name: '', description: '', pricingMode: 'single', price: '', maxPerOrder: '', isActive: true });
    expect(Object.values(f.sizes).every((s) => s.enabled === false)).toBe(true);
    expect(Object.keys(f.sizes)).toEqual(['XS', 'S', 'M', 'ONE_SIZE']);
  });
});
