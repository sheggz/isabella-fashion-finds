// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/api/admin.js', () => ({
  listDiscounts: vi.fn(),
  createDiscount: vi.fn(),
  replaceDiscount: vi.fn(),
  deleteDiscount: vi.fn(),
  listAdminProducts: vi.fn(),
}));

import * as admin from '../src/api/admin.js';
import { fromLocalInputValue } from '../src/lib/time.js';
import { renderAdminDiscounts } from '../src/pages/admin/discounts.js';

const TZ = new Date().getTimezoneOffset(); // whatever this machine uses; the page uses the same
const iso = (local) => fromLocalInputValue(local, TZ);

const PIECES = [
  { id: 'p1', name: 'Ankara Dress' },
  { id: 'p2', name: 'Gown' },
];

const discount = (over = {}) => ({
  id: 'd1', name: 'Weekend sale', kind: 'percent', percent: 10, amount_kobo: null, applies_to_all: true,
  product_ids: [], starts_at: '2030-01-01T10:00:00Z', ends_at: '2030-01-03T10:00:00Z', is_enabled: true,
  status: 'live', created_at: '2029-12-01T00:00:00Z', ...over,
});

let view;
beforeEach(() => {
  document.body.innerHTML = '<div id="view"></div>';
  view = document.querySelector('#view');
  vi.resetAllMocks();
  admin.listAdminProducts.mockResolvedValue(PIECES);
  admin.listDiscounts.mockResolvedValue([]);
  window.confirm = vi.fn(() => true);
});

const field = (name) => view.querySelector(`[name="${name}"]`);
const type = (name, value) => { const f = field(name); f.value = value; f.dispatchEvent(new Event('input', { bubbles: true })); };
const pick = (name, value) => {
  const radio = view.querySelector(`input[name="${name}"][value="${value}"]`);
  radio.checked = true;
  radio.dispatchEvent(new Event('change', { bubbles: true }));
};
const checkPiece = (id, checked = true) => {
  const box = view.querySelector(`input[name="product"][value="${id}"]`);
  box.checked = checked;
  box.dispatchEvent(new Event('change', { bubbles: true }));
};
const submit = () => view.querySelector('form.discount-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
const errorOf = (key) => view.querySelector(`[data-error="${key}"]`);
const open = async () => {
  renderAdminDiscounts(view, {});
  await vi.waitFor(() => expect(view.querySelector('form.discount-form')).not.toBeNull());
};
const fillBasics = () => {
  type('name', 'Weekend sale'); type('value', '10');
  type('startsAt', '2030-01-01T10:00'); type('endsAt', '2030-01-03T10:00');
};

describe('discount list', () => {
  it('shows each discount with its value, scope, schedule in local time and status', async () => {
    admin.listDiscounts.mockResolvedValue([
      discount(),
      discount({ id: 'd2', name: 'Old sale', status: 'ended', kind: 'amount', percent: null, amount_kobo: 250000, applies_to_all: false, product_ids: ['p1'] }),
    ]);
    await open();
    const rows = view.querySelectorAll('tbody tr');
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('Weekend sale');
    expect(rows[0].textContent).toContain('10% off');
    expect(rows[0].textContent).toContain('Every piece');
    expect(rows[0].textContent).toContain('Live');
    expect(rows[0].textContent).toMatch(/Jan 2030/);
    expect(rows[1].textContent).toContain('₦2,500 off');
    expect(rows[1].textContent).toContain('1 piece');
    expect(rows[1].textContent).toContain('Ended');
  });

  it('marks the status with a class so live ones stand out', async () => {
    admin.listDiscounts.mockResolvedValue([discount({ status: 'scheduled' })]);
    await open();
    expect(view.querySelector('tbody .badge.status-scheduled')).not.toBeNull();
  });

  it('says so when there are no discounts yet, and still offers the form', async () => {
    await open();
    expect(view.textContent).toContain('No discounts yet');
    expect(view.querySelector('table')).toBeNull();
  });

  it('tells the owner which time zone times are in', async () => {
    await open();
    expect(view.querySelector('.zone-note').textContent).toMatch(/UTC/);
  });

  it('shows an error state with retry when loading fails', async () => {
    admin.listDiscounts.mockRejectedValueOnce({ status: 0, code: 'network_error', message: 'Cannot reach the server.' });
    renderAdminDiscounts(view, {});
    await vi.waitFor(() => expect(view.textContent).toContain('Cannot reach the server.'));
    admin.listDiscounts.mockResolvedValue([]);
    view.querySelector('button[data-retry]').click();
    await vi.waitFor(() => expect(view.querySelector('form.discount-form')).not.toBeNull());
  });

  it('renders hostile names as text', async () => {
    admin.listDiscounts.mockResolvedValue([discount({ name: '<img src=x onerror=1>' })]);
    await open();
    expect(view.querySelector('tbody img')).toBeNull();
  });
});

describe('creating a discount', () => {
  it('starts the form on sensible defaults: percentage, every piece, enabled', async () => {
    await open();
    expect(view.querySelector('input[name="kind"][value="percent"]').checked).toBe(true);
    expect(view.querySelector('input[name="scope"][value="all"]').checked).toBe(true);
    expect(field('isEnabled').checked).toBe(true);
    expect(field('startsAt').value).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    expect(view.querySelector('.product-picker').hidden).toBe(true);
  });

  it('shows what is wrong and sends nothing when the form is invalid', async () => {
    await open();
    submit();
    expect(errorOf('name').textContent).toMatch(/name/i);
    expect(errorOf('value').textContent).toMatch(/percentage/i);
    expect(admin.createDiscount).not.toHaveBeenCalled();
  });

  it('creates a percentage discount for every piece with the exact payload', async () => {
    admin.createDiscount.mockResolvedValue(discount());
    await open();
    fillBasics();
    submit();
    await vi.waitFor(() => expect(admin.createDiscount).toHaveBeenCalledTimes(1));
    expect(admin.createDiscount).toHaveBeenCalledWith({
      name: 'Weekend sale', kind: 'percent', percent: 10, applies_to_all: true, product_ids: [],
      starts_at: iso('2030-01-01T10:00'), ends_at: iso('2030-01-03T10:00'), is_enabled: true,
    });
  });

  it('switching to a fixed amount changes what is asked for and what is sent', async () => {
    admin.createDiscount.mockResolvedValue(discount());
    await open();
    pick('kind', 'amount');
    expect(view.querySelector('label[for-value], .value-label').textContent).toMatch(/₦/);
    fillBasics(); type('value', '2,500');
    submit();
    await vi.waitFor(() => expect(admin.createDiscount).toHaveBeenCalled());
    const sent = admin.createDiscount.mock.calls[0][0];
    expect(sent.kind).toBe('amount');
    expect(sent.amount_kobo).toBe(250000);
    expect(sent).not.toHaveProperty('percent');
  });

  it('lets the owner pick specific pieces, shown only when that option is chosen', async () => {
    admin.createDiscount.mockResolvedValue(discount());
    await open();
    pick('scope', 'selected');
    expect(view.querySelector('.product-picker').hidden).toBe(false);
    expect(view.querySelectorAll('input[name="product"]')).toHaveLength(2);
    fillBasics();
    submit();
    expect(errorOf('products').textContent).toMatch(/at least one piece/i);
    expect(admin.createDiscount).not.toHaveBeenCalled();

    checkPiece('p2');
    submit();
    await vi.waitFor(() => expect(admin.createDiscount).toHaveBeenCalled());
    expect(admin.createDiscount.mock.calls[0][0]).toMatchObject({ applies_to_all: false, product_ids: ['p2'] });
  });

  it('rejects an end that is not after the start before contacting the server', async () => {
    await open();
    fillBasics(); type('endsAt', '2030-01-01T10:00');
    submit();
    expect(errorOf('endsAt').textContent).toMatch(/after the start/i);
    expect(admin.createDiscount).not.toHaveBeenCalled();
  });

  it('shows the new discount in the list after saving and resets the form', async () => {
    admin.createDiscount.mockResolvedValue(discount());
    admin.listDiscounts.mockResolvedValueOnce([]).mockResolvedValueOnce([discount()]);
    await open();
    fillBasics();
    submit();
    await vi.waitFor(() => expect(view.querySelectorAll('tbody tr')).toHaveLength(1));
    expect(field('name').value).toBe('');
    expect(view.querySelector('[role="status"]').textContent).toContain('Saved');
  });

  it('shows the server message and details when saving fails, and keeps what was typed', async () => {
    admin.createDiscount.mockRejectedValue({
      status: 400, code: 'bad_request', message: 'Unknown piece(s): abc', details: null,
    });
    await open();
    fillBasics();
    submit();
    await vi.waitFor(() => expect(view.querySelector('form.discount-form .form-alert').textContent).toContain('Unknown piece(s): abc'));
    expect(field('name').value).toBe('Weekend sale');
  });

  it('prevents a double submit while saving', async () => {
    let finish;
    admin.createDiscount.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    await open();
    fillBasics();
    submit();
    await vi.waitFor(() => expect(view.querySelector('button[type="submit"]').disabled).toBe(true));
    submit();
    expect(admin.createDiscount).toHaveBeenCalledTimes(1);
    finish(discount());
  });
});

describe('editing and deleting', () => {
  it('Edit fills the form, and saving replaces that discount', async () => {
    admin.listDiscounts.mockResolvedValue([discount({ applies_to_all: false, product_ids: ['p1'], percent: 12.5 })]);
    admin.replaceDiscount.mockResolvedValue(discount());
    await open();
    view.querySelector('button[data-edit]').click();
    expect(view.querySelector('h2.form-title').textContent).toMatch(/Edit/);
    expect(field('name').value).toBe('Weekend sale');
    expect(field('value').value).toBe('12.5');
    expect(view.querySelector('input[name="scope"][value="selected"]').checked).toBe(true);
    expect(view.querySelector('input[name="product"][value="p1"]').checked).toBe(true);

    type('name', 'Renamed');
    submit();
    await vi.waitFor(() => expect(admin.replaceDiscount).toHaveBeenCalledTimes(1));
    expect(admin.replaceDiscount.mock.calls[0][0]).toBe('d1');
    expect(admin.replaceDiscount.mock.calls[0][1]).toMatchObject({ name: 'Renamed', percent: 12.5, applies_to_all: false, product_ids: ['p1'] });
    expect(admin.createDiscount).not.toHaveBeenCalled();
  });

  it('Cancel returns to a blank "new discount" form', async () => {
    admin.listDiscounts.mockResolvedValue([discount()]);
    await open();
    view.querySelector('button[data-edit]').click();
    view.querySelector('button[data-cancel]').click();
    expect(view.querySelector('h2.form-title').textContent).toMatch(/New/);
    expect(field('name').value).toBe('');
  });

  it('deletes only after confirmation, naming the discount, then refreshes', async () => {
    admin.listDiscounts.mockResolvedValueOnce([discount()]).mockResolvedValueOnce([]);
    admin.deleteDiscount.mockResolvedValue(null);
    await open();

    window.confirm.mockReturnValueOnce(false);
    view.querySelector('button[data-delete]').click();
    expect(admin.deleteDiscount).not.toHaveBeenCalled();
    expect(window.confirm.mock.calls[0][0]).toContain('Weekend sale');

    view.querySelector('button[data-delete]').click();
    await vi.waitFor(() => expect(admin.deleteDiscount).toHaveBeenCalledWith('d1'));
    await vi.waitFor(() => expect(view.textContent).toContain('No discounts yet'));
  });

  it('shows a failed delete and keeps the list', async () => {
    admin.listDiscounts.mockResolvedValue([discount()]);
    admin.deleteDiscount.mockRejectedValue({ status: 503, code: 'service_unavailable', message: 'Database is unavailable' });
    await open();
    view.querySelector('button[data-delete]').click();
    await vi.waitFor(() => expect(view.querySelector('.list-alert').textContent).toContain('Database is unavailable'));
    expect(view.querySelectorAll('tbody tr')).toHaveLength(1);
  });
});
