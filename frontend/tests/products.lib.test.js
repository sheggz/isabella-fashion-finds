import { describe, it, expect } from 'vitest';
import {
  coverImage,
  isSoldOut,
  sortedImages,
  sortVariants,
  sizeLabel,
  formatMeasurements,
} from '../src/lib/products.js';

const product = (over = {}) => ({
  id: 'p1',
  name: 'Dress',
  images: [],
  variants: [{ size: 'M', stock: 2, measurements: {} }],
  ...over,
});

describe('images', () => {
  const images = [
    { id: 'b', position: 1, url: 'b.png' },
    { id: 'a', position: 0, url: 'a.png' },
  ];

  it('sortedImages orders by position without mutating the input', () => {
    const input = [...images];
    expect(sortedImages(product({ images: input })).map((i) => i.id)).toEqual(['a', 'b']);
    expect(input.map((i) => i.id)).toEqual(['b', 'a']);
  });

  it('coverImage is the first photo, or null when there are none', () => {
    expect(coverImage(product({ images }))).toEqual(images[1]);
    expect(coverImage(product())).toBeNull();
  });
});

describe('isSoldOut', () => {
  it('is true only when every size has no stock', () => {
    expect(isSoldOut(product({ variants: [{ size: 'S', stock: 0 }, { size: 'M', stock: 0 }] }))).toBe(true);
    expect(isSoldOut(product({ variants: [{ size: 'S', stock: 0 }, { size: 'M', stock: 1 }] }))).toBe(false);
  });

  it('is false for a piece with no sizes yet (nothing to say it is sold out)', () => {
    expect(isSoldOut(product({ variants: [] }))).toBe(false);
  });
});

describe('sortVariants', () => {
  const options = { sizes: [{ value: 'XS' }, { value: 'S' }, { value: 'M' }, { value: 'ONE_SIZE' }] };
  const variants = [{ size: 'M' }, { size: 'XS' }, { size: 'ONE_SIZE' }, { size: 'S' }];

  it('orders sizes the way the store lists them, not the way the database returned them', () => {
    expect(sortVariants(variants, options).map((v) => v.size)).toEqual(['XS', 'S', 'M', 'ONE_SIZE']);
  });

  it('does not mutate its input', () => {
    const copy = [...variants];
    sortVariants(variants, options);
    expect(variants).toEqual(copy);
  });

  it('keeps the original order when the size list is not available', () => {
    expect(sortVariants(variants, null).map((v) => v.size)).toEqual(['M', 'XS', 'ONE_SIZE', 'S']);
  });

  it('puts unknown sizes last', () => {
    expect(sortVariants([{ size: 'HUGE' }, { size: 'S' }], options).map((v) => v.size)).toEqual(['S', 'HUGE']);
  });
});

describe('sizeLabel', () => {
  const options = { sizes: [{ value: 'ONE_SIZE', label: 'One size' }, { value: 'M', label: 'M' }] };

  it('uses the label the backend published', () => {
    expect(sizeLabel(options, 'ONE_SIZE')).toBe('One size');
  });

  it('falls back to the raw value when options are missing or unknown', () => {
    expect(sizeLabel(options, 'XL')).toBe('XL');
    expect(sizeLabel(null, 'M')).toBe('M');
  });
});

describe('formatMeasurements', () => {
  const options = {
    measurement_parts: [
      { value: 'bust', label: 'Bust' },
      { value: 'waist', label: 'Waist' },
      { value: 'length', label: 'Garment length' },
    ],
    unit: 'cm',
  };

  it('lists only the provided parts, in the store-defined order, with units', () => {
    expect(formatMeasurements({ length: 110, bust: 92 }, options)).toEqual([
      { label: 'Bust', text: '92 cm' },
      { label: 'Garment length', text: '110 cm' },
    ]);
  });

  it('keeps meaningful decimals but drops a trailing .0', () => {
    expect(formatMeasurements({ waist: 74.3 }, options)).toEqual([{ label: 'Waist', text: '74.3 cm' }]);
    expect(formatMeasurements({ waist: 74.0 }, options)).toEqual([{ label: 'Waist', text: '74 cm' }]);
  });

  it('returns an empty list when there is nothing to show', () => {
    expect(formatMeasurements({}, options)).toEqual([]);
    expect(formatMeasurements(undefined, options)).toEqual([]);
    expect(formatMeasurements({ bust: 90 }, null)).toEqual([]);
  });
});
