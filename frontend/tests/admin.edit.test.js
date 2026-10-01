// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/api/admin.js', () => ({
  getAdminProduct: vi.fn(),
  createProduct: vi.fn(),
  updateProduct: vi.fn(),
  replaceVariants: vi.fn(),
  deleteProduct: vi.fn(),
  uploadImage: vi.fn(),
  deleteImage: vi.fn(),
  reorderImages: vi.fn(),
}));
vi.mock('../src/api/catalogue.js', () => ({ getCatalogueOptions: vi.fn() }));

import * as admin from '../src/api/admin.js';
import { getCatalogueOptions } from '../src/api/catalogue.js';
import { renderAdminEdit } from '../src/pages/admin/edit.js';

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
  images: { max_bytes: 5 * 1024 * 1024, max_per_product: 3, types: ['image/jpeg', 'image/png', 'image/webp'] },
};

const photo = (id, position) => ({ id, position, url: `https://cdn.test/${id}.png` });
const saved = (over = {}) => ({
  id: 'p1',
  name: 'Ankara Dress',
  description: 'Hand-sewn',
  price_kobo: 1500000,
  is_active: true,
  images: [photo('i1', 0), photo('i2', 1)],
  variants: [{ size: 'M', stock: 2, measurements: { bust: 92 } }],
  ...over,
});

let view;
let navigate;
beforeEach(() => {
  document.body.innerHTML = '<div id="view"></div>';
  view = document.querySelector('#view');
  navigate = vi.fn();
  vi.resetAllMocks();
  getCatalogueOptions.mockResolvedValue(OPTIONS);
  window.confirm = vi.fn(() => true);
});

const field = (name) => view.querySelector(`[name="${name}"]`);
const type = (name, value) => { const f = field(name); f.value = value; f.dispatchEvent(new Event('input', { bubbles: true })); };
const tick = (name, checked = true) => { const f = field(name); f.checked = checked; f.dispatchEvent(new Event('change', { bubbles: true })); };
const submit = () => view.querySelector('form.product-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
const errorOf = (key) => view.querySelector(`[data-error="${key}"]`);

const openNew = async () => {
  renderAdminEdit(view, { params: {}, navigate });
  await vi.waitFor(() => expect(view.querySelector('form.product-form')).not.toBeNull());
};
const openEdit = async (p = saved()) => {
  admin.getAdminProduct.mockResolvedValue(p);
  renderAdminEdit(view, { params: { id: p.id }, navigate });
  await vi.waitFor(() => expect(view.querySelector('form.product-form')).not.toBeNull());
};

describe('new piece', () => {
  it('offers a row for every fixed size and hints that photos come after saving', async () => {
    await openNew();
    for (const size of ['XS', 'S', 'M', 'ONE_SIZE']) expect(field(`size-${size}-enabled`)).not.toBeNull();
    expect(view.querySelector('.photos')).toBeNull();
    expect(view.textContent).toMatch(/save the piece first/i);
  });

  it('reveals stock and measurement inputs only for sizes that are switched on', async () => {
    await openNew();
    expect(field('size-M-stock').closest('.size-fields').hidden).toBe(true);
    tick('size-M-enabled');
    expect(field('size-M-stock').closest('.size-fields').hidden).toBe(false);
    expect(field('size-M-bust')).not.toBeNull();
    expect(field('size-M-waist')).not.toBeNull();
  });

  it('shows specific field errors and does NOT call the server when the form is invalid', async () => {
    await openNew();
    submit();
    expect(errorOf('name').textContent).toMatch(/name/i);
    expect(errorOf('price').textContent).toMatch(/price/i);
    expect(errorOf('sizes').textContent).toMatch(/at least one size/i);
    expect(admin.createProduct).not.toHaveBeenCalled();
  });

  it('shows a size-level error next to the offending input', async () => {
    await openNew();
    type('name', 'Dress'); type('price', '100');
    tick('size-M-enabled'); type('size-M-stock', 'many'); type('size-M-bust', '9000');
    submit();
    expect(errorOf('size.M.stock').textContent).toMatch(/whole number/i);
    expect(errorOf('size.M.bust').textContent).toMatch(/Bust/);
    expect(admin.createProduct).not.toHaveBeenCalled();
  });

  it('creates the piece with the exact API payload, then goes to its edit page for photos', async () => {
    admin.createProduct.mockResolvedValue({ id: 'new-1' });
    await openNew();
    type('name', '  Ankara Dress ');
    type('description', '');
    type('price', '15,000');
    tick('size-M-enabled'); type('size-M-stock', '3'); type('size-M-bust', '92');
    submit();

    await vi.waitFor(() => expect(admin.createProduct).toHaveBeenCalledTimes(1));
    expect(admin.createProduct).toHaveBeenCalledWith({
      name: 'Ankara Dress',
      description: null,
      price_kobo: 1500000,
      is_active: true,
      variants: [{ size: 'M', stock: 3, measurements: { bust: 92 } }],
    });
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith('/admin/products/new-1'));
  });

  it('disables the button while saving so a double click cannot create two pieces', async () => {
    let finish;
    admin.createProduct.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    await openNew();
    type('name', 'Dress'); type('price', '100'); tick('size-M-enabled'); type('size-M-stock', '1');
    submit();
    const button = view.querySelector('button[type="submit"]');
    await vi.waitFor(() => expect(button.disabled).toBe(true));
    submit();
    expect(admin.createProduct).toHaveBeenCalledTimes(1);
    finish({ id: 'x' });
  });

  it('shows the server message and its field details, and lets the owner try again', async () => {
    admin.createProduct.mockRejectedValue({
      status: 422, code: 'validation_error', message: 'Invalid request',
      details: [{ field: 'body.variants.0.measurements', message: 'unknown body part' }],
    });
    await openNew();
    type('name', 'Dress'); type('price', '100'); tick('size-M-enabled'); type('size-M-stock', '1');
    submit();
    await vi.waitFor(() => expect(view.querySelector('.form-alert').textContent).toContain('Invalid request'));
    expect(view.querySelector('.form-alert').textContent).toContain('variants.0.measurements: unknown body part');
    expect(view.querySelector('button[type="submit"]').disabled).toBe(false);
  });
});

describe('edit piece', () => {
  it('loads the piece into the form', async () => {
    await openEdit();
    expect(view.querySelector('h1').textContent).toContain('Ankara Dress');
    expect(field('name').value).toBe('Ankara Dress');
    expect(field('description').value).toBe('Hand-sewn');
    expect(field('price').value).toBe('15000');
    expect(field('isActive').checked).toBe(true);
    expect(field('size-M-enabled').checked).toBe(true);
    expect(field('size-M-stock').value).toBe('2');
    expect(field('size-M-bust').value).toBe('92');
    expect(field('size-S-enabled').checked).toBe(false);
  });

  it('saves details and sizes, then confirms', async () => {
    admin.updateProduct.mockResolvedValue(saved());
    admin.replaceVariants.mockResolvedValue(saved({ price_kobo: 1600000 }));
    await openEdit();
    type('price', '16000');
    tick('isActive', false);
    submit();

    await vi.waitFor(() => expect(admin.updateProduct).toHaveBeenCalledWith('p1', {
      name: 'Ankara Dress', description: 'Hand-sewn', price_kobo: 1600000, is_active: false,
    }));
    expect(admin.replaceVariants).toHaveBeenCalledWith('p1', [{ size: 'M', stock: 2, measurements: { bust: 92 } }]);
    await vi.waitFor(() => expect(view.querySelector('[role="status"]').textContent).toContain('Saved'));
  });

  it('deletes the whole piece after confirmation and returns to the list', async () => {
    admin.deleteProduct.mockResolvedValue(null);
    await openEdit();
    window.confirm.mockReturnValueOnce(false);
    view.querySelector('button[data-delete-piece]').click();
    expect(admin.deleteProduct).not.toHaveBeenCalled();

    view.querySelector('button[data-delete-piece]').click();
    await vi.waitFor(() => expect(admin.deleteProduct).toHaveBeenCalledWith('p1'));
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith('/admin'));
  });

  it('shows a not-found message for a piece that does not exist', async () => {
    admin.getAdminProduct.mockRejectedValue({ status: 404, code: 'not_found', message: 'Product not found' });
    renderAdminEdit(view, { params: { id: 'nope' }, navigate });
    await vi.waitFor(() => expect(view.textContent).toContain('could not be found'));
  });

  it('shows an error state with retry when loading fails, including the size list', async () => {
    getCatalogueOptions.mockRejectedValueOnce({ status: 0, code: 'network_error', message: 'Cannot reach the server.' });
    admin.getAdminProduct.mockResolvedValue(saved());
    renderAdminEdit(view, { params: { id: 'p1' }, navigate });
    await vi.waitFor(() => expect(view.textContent).toContain('Cannot reach the server.'));
    getCatalogueOptions.mockResolvedValue(OPTIONS);
    view.querySelector('button[data-retry]').click();
    await vi.waitFor(() => expect(view.querySelector('form.product-form')).not.toBeNull());
  });
});

describe('photos', () => {
  const choose = (file) => {
    const input = field('photo');
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const png = (over = {}) => new File(['x'], 'a.png', { type: 'image/png', ...over });

  it('lists the photos in order with the first marked as the cover', async () => {
    await openEdit();
    const items = view.querySelectorAll('.photo-list li');
    expect(items).toHaveLength(2);
    expect(items[0].querySelector('img').getAttribute('src')).toBe('https://cdn.test/i1.png');
    expect(items[0].textContent).toContain('Cover');
    expect(items[0].querySelector('button[data-cover]')).toBeNull();
    expect(items[1].querySelector('button[data-cover]')).not.toBeNull();
  });

  it('"Make cover" moves that photo to the front', async () => {
    admin.reorderImages.mockResolvedValue(saved({ images: [photo('i2', 0), photo('i1', 1)] }));
    await openEdit();
    view.querySelectorAll('.photo-list li')[1].querySelector('button[data-cover]').click();
    await vi.waitFor(() => expect(admin.reorderImages).toHaveBeenCalledWith('p1', ['i2', 'i1']));
    await vi.waitFor(() => expect(view.querySelector('.photo-list li img').getAttribute('src')).toBe('https://cdn.test/i2.png'));
  });

  it('deletes a photo after confirmation', async () => {
    admin.deleteImage.mockResolvedValue(saved({ images: [photo('i1', 0)] }));
    await openEdit();
    view.querySelectorAll('.photo-list li')[1].querySelector('button[data-delete-photo]').click();
    await vi.waitFor(() => expect(admin.deleteImage).toHaveBeenCalledWith('p1', 'i2'));
    await vi.waitFor(() => expect(view.querySelectorAll('.photo-list li')).toHaveLength(1));
  });

  it('uploads a valid photo and shows it', async () => {
    const file = png();
    admin.uploadImage.mockResolvedValue(saved({ images: [photo('i1', 0), photo('i2', 1), photo('i3', 2)] }));
    await openEdit();
    choose(file);
    await vi.waitFor(() => expect(admin.uploadImage).toHaveBeenCalledWith('p1', file));
    await vi.waitFor(() => expect(view.querySelectorAll('.photo-list li')).toHaveLength(3));
  });

  it('rejects a wrong file type before contacting the server', async () => {
    await openEdit();
    choose(new File(['x'], 'a.gif', { type: 'image/gif' }));
    expect(errorOf('photo').textContent).toMatch(/JPEG, PNG or WebP/);
    expect(admin.uploadImage).not.toHaveBeenCalled();
  });

  it('shows the server message if the upload fails', async () => {
    admin.uploadImage.mockRejectedValue({ status: 415, code: 'unsupported_media_type', message: 'Only JPEG, PNG or WebP photos are accepted' });
    await openEdit();
    choose(png());
    await vi.waitFor(() => expect(errorOf('photo').textContent).toContain('Only JPEG, PNG or WebP photos are accepted'));
  });

  it('stops offering uploads once the piece has the maximum number of photos', async () => {
    await openEdit(saved({ images: [photo('i1', 0), photo('i2', 1), photo('i3', 2)] }));
    expect(field('photo').disabled).toBe(true);
    expect(view.querySelector('.photos').textContent).toContain('3 of 3');
  });
});
