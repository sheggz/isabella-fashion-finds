import { describe, it, expect } from 'vitest';
import { validateImageFile, remainingSlots } from '../src/lib/images.js';

const RULES = { max_bytes: 5 * 1024 * 1024, max_per_product: 8, types: ['image/jpeg', 'image/png', 'image/webp'] };

describe('validateImageFile', () => {
  it('accepts a normal photo', () => {
    expect(validateImageFile({ type: 'image/png', size: 1000 }, RULES)).toBeNull();
    expect(validateImageFile({ type: 'image/jpeg', size: RULES.max_bytes }, RULES)).toBeNull();
  });

  it('rejects other formats with a helpful message', () => {
    expect(validateImageFile({ type: 'image/gif', size: 1000 }, RULES)).toMatch(/JPEG, PNG or WebP/);
    expect(validateImageFile({ type: 'application/pdf', size: 1000 }, RULES)).toMatch(/JPEG, PNG or WebP/);
    expect(validateImageFile({ type: '', size: 1000 }, RULES)).toMatch(/JPEG, PNG or WebP/);
  });

  it('rejects files over the size limit and says what the limit is', () => {
    expect(validateImageFile({ type: 'image/png', size: RULES.max_bytes + 1 }, RULES)).toMatch(/5 MB/);
  });

  it('rejects empty files', () => {
    expect(validateImageFile({ type: 'image/png', size: 0 }, RULES)).toMatch(/empty/i);
  });

  it('rejects when there is nothing to check against yet', () => {
    expect(validateImageFile(null, RULES)).toMatch(/choose a photo/i);
  });

  it('does not block the upload if the rules could not be loaded (the server still checks)', () => {
    expect(validateImageFile({ type: 'image/gif', size: 1000 }, null)).toBeNull();
  });
});

describe('remainingSlots', () => {
  it('counts how many more photos a piece can take', () => {
    expect(remainingSlots(0, RULES)).toBe(8);
    expect(remainingSlots(5, RULES)).toBe(3);
    expect(remainingSlots(8, RULES)).toBe(0);
    expect(remainingSlots(12, RULES)).toBe(0);
  });

  it('is unlimited-looking when the rules are unknown', () => {
    expect(remainingSlots(3, null)).toBe(Infinity);
  });
});
