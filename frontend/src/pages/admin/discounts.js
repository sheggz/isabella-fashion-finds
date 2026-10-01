import { createDiscount, deleteDiscount, listAdminProducts, listDiscounts, replaceDiscount } from '../../api/admin.js';
import { el } from '../../components/dom.js';
import { emptyState, errorState, loading } from '../../components/states.js';
import {
  appliesText, describeDiscount, discountToForm, emptyDiscountForm, formToDiscountPayload, scheduleText, STATUS_LABELS,
} from '../../lib/discountForm.js';
import { zoneLabel } from '../../lib/time.js';

const fieldError = (key) => el('p', { className: 'field-error', hidden: true, dataset: { error: key } });

const KIND_TEXT = {
  percent: { label: 'Percent off (%)', placeholder: 'e.g. 10 or 12.5' },
  amount: { label: 'Amount off (₦)', placeholder: 'e.g. 2000' },
};

// ---- the form ------------------------------------------------------------------------------

const buildForm = (values, pieces) => {
  const radio = (name, value, label, checked) =>
    el('label', { className: 'check' }, el('input', { type: 'radio', name, value, checked }), ` ${label}`);

  const valueLabel = el('span', { className: 'value-label', textContent: KIND_TEXT[values.kind].label });
  const valueInput = el('input', { type: 'text', inputMode: 'decimal', name: 'value', value: values.value, placeholder: KIND_TEXT[values.kind].placeholder });

  const picker = el(
    'div',
    { className: 'product-picker', hidden: values.scope !== 'selected' },
    ...pieces.map((piece) =>
      el('label', { className: 'check' }, el('input', { type: 'checkbox', name: 'product', value: piece.id, checked: values.productIds.includes(piece.id) }), ` ${piece.name}`)),
    pieces.length === 0 && el('p', { className: 'hint', textContent: 'Add pieces first, then you can choose them here.' }),
    fieldError('products'),
  );

  const form = el(
    'form',
    { className: 'discount-form product-form', noValidate: true },
    el('div', { className: 'form-alert', hidden: true, attrs: { role: 'alert' } }),
    el('div', { className: 'field' }, el('label', {}, 'Name (customers see this)', el('input', { type: 'text', name: 'name', value: values.name, maxLength: 100 })), fieldError('name')),
    el('fieldset', { className: 'pricing-mode' }, el('legend', { textContent: 'Type' }), radio('kind', 'percent', 'Percentage off', values.kind === 'percent'), radio('kind', 'amount', 'Fixed amount off', values.kind === 'amount')),
    el('div', { className: 'field' }, el('label', {}, valueLabel, valueInput), fieldError('value')),
    el('fieldset', { className: 'pricing-mode' }, el('legend', { textContent: 'Applies to' }), radio('scope', 'all', 'Every piece', values.scope === 'all'), radio('scope', 'selected', 'Selected pieces', values.scope === 'selected'), picker),
    el('div', { className: 'field' }, el('label', {}, 'Starts', el('input', { type: 'datetime-local', name: 'startsAt', value: values.startsAt })), fieldError('startsAt')),
    el('div', { className: 'field' }, el('label', {}, 'Ends', el('input', { type: 'datetime-local', name: 'endsAt', value: values.endsAt })), fieldError('endsAt')),
    el('label', { className: 'check' }, el('input', { type: 'checkbox', name: 'isEnabled', checked: values.isEnabled }), ' Enabled (untick to pause it without deleting)'),
  );

  form.querySelectorAll('input[name="kind"]').forEach((r) => r.addEventListener('change', () => {
    const kind = form.querySelector('input[name="kind"]:checked').value;
    valueLabel.textContent = KIND_TEXT[kind].label;
    valueInput.placeholder = KIND_TEXT[kind].placeholder;
  }));
  form.querySelectorAll('input[name="scope"]').forEach((r) => r.addEventListener('change', () => {
    picker.hidden = form.querySelector('input[name="scope"]:checked').value !== 'selected';
  }));
  return form;
};

const readForm = (form) => {
  const q = (name) => form.querySelector(`[name="${name}"]`);
  return {
    name: q('name').value,
    kind: form.querySelector('input[name="kind"]:checked').value,
    value: q('value').value,
    scope: form.querySelector('input[name="scope"]:checked').value,
    productIds: [...form.querySelectorAll('input[name="product"]:checked')].map((box) => box.value),
    startsAt: q('startsAt').value,
    endsAt: q('endsAt').value,
    isEnabled: q('isEnabled').checked,
  };
};

const showErrors = (form, errors) => {
  let first = null;
  form.querySelectorAll('[data-error]').forEach((node) => {
    const message = errors[node.dataset.error];
    node.textContent = message ?? '';
    node.hidden = !message;
    if (message && !first) first = node;
  });
  first?.closest('.field, .product-picker')?.querySelector('input')?.focus();
};

// ---- the page ------------------------------------------------------------------------------

export const renderAdminDiscounts = (view) => {
  let discounts = [];
  let pieces = [];
  let editing = null; // the discount being edited, or null for a new one
  let saving = false;
  let message = '';

  const tz = () => new Date().getTimezoneOffset();

  const table = () => {
    const offset = tz();
    const rows = discounts.map((d) => {
      const edit = el('button', { type: 'button', textContent: 'Edit', dataset: { edit: '' } });
      edit.addEventListener('click', () => { editing = d; message = ''; draw(); });
      const del = el('button', { type: 'button', textContent: 'Delete', className: 'danger', dataset: { delete: '' } });
      del.addEventListener('click', async () => {
        if (!window.confirm(`Delete the discount "${d.name}"? Prices go back to normal straight away.`)) return;
        try {
          await deleteDiscount(d.id);
          if (editing?.id === d.id) editing = null;
          await load();
        } catch (error) {
          const alert = view.querySelector('.list-alert');
          alert.textContent = error?.message ?? 'Could not delete that discount.';
          alert.hidden = false;
        }
      });
      return el(
        'tr',
        {},
        el('td', { textContent: d.name }),
        el('td', { textContent: describeDiscount(d) }),
        el('td', { textContent: appliesText(d) }),
        el('td', { textContent: scheduleText(d, offset) }),
        el('td', {}, el('span', { className: `badge status-${d.status}`, textContent: STATUS_LABELS[d.status] ?? d.status })),
        el('td', { className: 'actions' }, edit, del),
      );
    });
    return el(
      'div',
      { className: 'table-wrap' },
      el(
        'table',
        { className: 'admin-table' },
        el('thead', {}, el('tr', {}, ...['Name', 'Discount', 'Applies to', 'When', 'Status', ''].map((h) => el('th', { scope: 'col', textContent: h })))),
        el('tbody', {}, ...rows),
      ),
    );
  };

  function draw() {
    const offset = tz();
    const values = editing ? discountToForm(editing, offset) : emptyDiscountForm(Date.now(), offset);
    const form = buildForm(values, pieces);
    const submitButton = el('button', { type: 'submit', className: 'button primary', textContent: editing ? 'Save changes' : 'Create discount' });
    const status = el('p', { className: 'save-status', textContent: message, attrs: { role: 'status' } });
    form.append(submitButton, status);
    if (editing) {
      const cancel = el('button', { type: 'button', textContent: 'Cancel', dataset: { cancel: '' } });
      cancel.addEventListener('click', () => { editing = null; message = ''; draw(); });
      form.append(cancel);
    }

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (saving) return; // ignore a second click while the first save is still running
      const result = formToDiscountPayload(readForm(form), offset);
      showErrors(form, result.ok ? {} : result.errors);
      form.querySelector('.form-alert').hidden = true;
      status.textContent = '';
      if (!result.ok) return;

      saving = true;
      submitButton.disabled = true;
      try {
        await (editing ? replaceDiscount(editing.id, result.value) : createDiscount(result.value));
        editing = null;
        await load('Saved ✓');
      } catch (error) {
        const alert = form.querySelector('.form-alert');
        alert.textContent = error?.message ?? 'Something went wrong. Please try again.';
        alert.hidden = false;
      } finally {
        saving = false;
        submitButton.disabled = false;
      }
    });

    view.replaceChildren(
      el('div', { className: 'page-head' }, el('h1', { textContent: 'Discounts' })),
      el('p', { className: 'hint zone-note', textContent: `Times are in your local time zone (${zoneLabel(offset)}). Customers see a discount the moment it starts and it ends exactly on time; nothing needs to run in between.` }),
      el('div', { className: 'form-alert list-alert', hidden: true, attrs: { role: 'alert' } }),
      discounts.length ? table() : emptyState('No discounts yet', 'Create one below to run a sale.'),
      el('h2', { className: 'form-title', textContent: editing ? `Edit discount: ${editing.name}` : 'New discount' }),
      form,
    );
  }

  async function load(done = '') {
    view.replaceChildren(loading());
    try {
      [discounts, pieces] = await Promise.all([listDiscounts(), listAdminProducts()]);
      message = done;
      draw();
    } catch (error) {
      view.replaceChildren(el('h1', { textContent: 'Discounts' }), errorState(error, () => load()));
    }
  }

  load();
};
