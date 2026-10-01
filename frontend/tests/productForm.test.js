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

const form = (over = {}) => ({
  name: '  Ankara Dress ',
  description: '  Hand-sewn  ',
  price: '15,000.50',
  isActive: true,
  sizes: {
    M: { enabled: true, stock: '3', measurements: { bust: '92', waist: '' } },
    S: { enabled: false, stock: '', measurements: {} },
  },
  ...over,
});

const withSize = (size, patch) => form({ sizes: { M: { enabled: true, stock: '3', measurements: {}, ...patch } } });

describe('formToPayload: valid input', () => {
  it('produces the API payload: trimmed text, kobo price, enabled sizes only, blank measurements dropped', () => {
    expect(formToPayload(form(), OPTIONS)).toEqual({
      ok: true,
      value: {
        product: { name: 'Ankara Dress', description: 'Hand-sewn', price_kobo: 1500050, is_active: true },
        variants: [{ size: 'M', stock: 3, measurements: { bust: 92 } }],
      },
    });
  });

  it('lists sizes in the store order, whatever order the form held them', () => {
    const f = form({
      sizes: {
        M: { enabled: true, stock: '1', measurements: {} },
        XS: { enabled: true, stock: '2', measurements: {} },
        ONE_SIZE: { enabled: true, stock: '3', measurements: {} },
      },
    });
    expect(formToPayload(f, OPTIONS).value.variants.map((v) => v.size)).toEqual(['XS', 'M', 'ONE_SIZE']);
  });

  it('turns a blank description into null (the description is optional)', () => {
    expect(formToPayload(form({ description: '   ' }), OPTIONS).value.product.description).toBeNull();
  });

  it('allows zero stock and decimal measurements', () => {
    const result = formToPayload(withSize('M', { stock: '0', measurements: { bust: '92.5' } }), OPTIONS);
    expect(result.value.variants[0]).toEqual({ size: 'M', stock: 0, measurements: { bust: 92.5 } });
  });

  it('does not mutate the form it is given', () => {
    const f = form();
    const copy = JSON.parse(JSON.stringify(f));
    formToPayload(f, OPTIONS);
    expect(f).toEqual(copy);
  });
});

describe('formToPayload: problems are reported per field, all at once', () => {
  it('requires a name', () => {
    expect(formToPayload(form({ name: '   ' }), OPTIONS).errors.name).toMatch(/name/i);
  });

  it('requires a valid price', () => {
    for (const bad of ['', 'abc', '-5', '1.234']) {
      expect(formToPayload(form({ price: bad }), OPTIONS).errors.price).toMatch(/price/i);
    }
  });

  it('requires at least one size', () => {
    const f = form({ sizes: { M: { enabled: false, stock: '', measurements: {} } } });
    expect(formToPayload(f, OPTIONS).errors.sizes).toMatch(/at least one size/i);
  });

  it('requires stock to be a whole number of zero or more for each enabled size', () => {
    for (const bad of ['', '-1', '1.5', 'x']) {
      expect(formToPayload(withSize('M', { stock: bad }), OPTIONS).errors['size.M.stock']).toMatch(/whole number/i);
    }
  });

  it('rejects measurements that are not sensible lengths in cm', () => {
    for (const bad of ['abc', '0', '-3', '301']) {
      const result = formToPayload(withSize('M', { measurements: { bust: bad } }), OPTIONS);
      expect(result.errors['size.M.bust']).toMatch(/Bust/);
    }
  });

  it('ignores problems in sizes that are switched off', () => {
    const f = form({ sizes: { M: { enabled: true, stock: '1', measurements: {} }, S: { enabled: false, stock: 'garbage', measurements: { bust: 'x' } } } });
    expect(formToPayload(f, OPTIONS).ok).toBe(true);
  });

  it('reports every problem together', () => {
    const result = formToPayload(form({ name: '', price: 'x', sizes: {} }), OPTIONS);
    expect(result.ok).toBe(false);
    expect(Object.keys(result.errors).sort()).toEqual(['name', 'price', 'sizes']);
  });
});

describe('productToForm', () => {
  const product = {
    name: 'Ankara Dress',
    description: null,
    price_kobo: 1500050,
    is_active: false,
    variants: [{ size: 'M', stock: 3, measurements: { bust: 92, waist: 74.3 } }],
  };

  it('fills the form from a saved product, with one row per fixed size', () => {
    const f = productToForm(product, OPTIONS);
    expect(f.name).toBe('Ankara Dress');
    expect(f.description).toBe('');
    expect(f.price).toBe('15000.50');
    expect(f.isActive).toBe(false);
    expect(Object.keys(f.sizes)).toEqual(['XS', 'S', 'M', 'ONE_SIZE']);
    expect(f.sizes.M).toEqual({ enabled: true, stock: '3', measurements: { bust: '92', waist: '74.3' } });
    expect(f.sizes.S.enabled).toBe(false);
  });

  it('round-trips: editing and saving unchanged data gives back the same values', () => {
    const result = formToPayload(productToForm(product, OPTIONS), OPTIONS);
    expect(result.value.product).toEqual({ name: 'Ankara Dress', description: null, price_kobo: 1500050, is_active: false });
    expect(result.value.variants).toEqual([{ size: 'M', stock: 3, measurements: { bust: 92, waist: 74.3 } }]);
  });
});

describe('emptyForm', () => {
  it('starts visible, with every size switched off', () => {
    const f = emptyForm(OPTIONS);
    expect(f).toMatchObject({ name: '', description: '', price: '', isActive: true });
    expect(Object.values(f.sizes).every((s) => s.enabled === false)).toBe(true);
    expect(Object.keys(f.sizes)).toEqual(['XS', 'S', 'M', 'ONE_SIZE']);
  });
});
