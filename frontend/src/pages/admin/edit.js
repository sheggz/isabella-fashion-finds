import {
  createProduct, deleteImage, deleteProduct, getAdminProduct,
  reorderImages, saveProduct, uploadImage,
} from '../../api/admin.js';
import { getCatalogueOptions } from '../../api/catalogue.js';
import { el, link } from '../../components/dom.js';
import { errorState, loading } from '../../components/states.js';
import { remainingSlots, validateImageFile } from '../../lib/images.js';
import { emptyForm, formToPayload, productToForm } from '../../lib/productForm.js';
import { sortedImages } from '../../lib/products.js';

const fieldError = (key) => el('p', { className: 'field-error', hidden: true, dataset: { error: key } });

/** Server validation details look like {field: "body.variants.0.size", message: "..."}. */
const detailLines = (error) =>
  Array.isArray(error?.details)
    ? error.details.map((d) => `${String(d.field).replace(/^body\./, '')}: ${d.message}`)
    : [];

const field = (label, control, key, hint) =>
  el('div', { className: 'field' }, el('label', {}, label, control), hint && el('small', { className: 'hint', textContent: hint }), fieldError(key));

// ---- the details form ------------------------------------------------------------------

const buildForm = (options, values) => {
  const sizeRow = ({ value: size, label }) => {
    const state = values.sizes[size];
    const enabled = el('input', { type: 'checkbox', name: `size-${size}-enabled`, checked: state.enabled });

    const stock = field(
      'Stock',
      el('input', { type: 'text', inputMode: 'numeric', name: `size-${size}-stock`, value: state.stock }),
      `size.${size}.stock`,
    );
    // Only shown when the piece is priced per size (see applyMode below).
    const price = el(
      'div',
      { className: 'size-price', hidden: values.pricingMode !== 'per_size' },
      field(
        'Price (₦)',
        el('input', { type: 'text', inputMode: 'decimal', name: `size-${size}-price`, value: state.price }),
        `size.${size}.price`,
      ),
    );
    const measures = options.measurement_parts.map((part) =>
      field(
        `${part.label} (${options.unit})`,
        el('input', { type: 'text', inputMode: 'decimal', name: `size-${size}-${part.value}`, value: state.measurements[part.value] ?? '' }),
        `size.${size}.${part.value}`,
      ));
    const fields = el('div', { className: 'size-fields', hidden: !state.enabled }, stock, price, ...measures);
    enabled.addEventListener('change', () => { fields.hidden = !enabled.checked; });

    return el('div', { className: 'size-row' }, el('label', { className: 'size-toggle' }, enabled, ` ${label}`), fields);
  };

  const modeRadio = (value, label) =>
    el('label', { className: 'check' }, el('input', { type: 'radio', name: 'pricingMode', value, checked: values.pricingMode === value }), ` ${label}`);
  const singlePrice = el(
    'div',
    { className: 'single-price', hidden: values.pricingMode === 'per_size' },
    field('Price (₦)', el('input', { type: 'text', inputMode: 'decimal', name: 'price', value: values.price }), 'price'),
  );

  const form = el(
    'form',
    { className: 'product-form', noValidate: true },
    el('div', { className: 'form-alert', hidden: true, attrs: { role: 'alert' } }),
    field('Name', el('input', { type: 'text', name: 'name', value: values.name, maxLength: 200 }), 'name'),
    field('Description (optional)', el('textarea', { name: 'description', value: values.description, rows: 4 }), 'description',
      'Tell customers about the piece: fabric, fit, care.'),
    el(
      'fieldset',
      { className: 'pricing-mode' },
      el('legend', { textContent: 'Pricing' }),
      modeRadio('single', 'One price for every size'),
      modeRadio('per_size', 'A different price for each size'),
    ),
    singlePrice,
    el('label', { className: 'check' }, el('input', { type: 'checkbox', name: 'isActive', checked: values.isActive }), ' Visible in the shop'),
    el(
      'fieldset',
      { className: 'sizes-editor' },
      el('legend', { textContent: 'Sizes, stock and measurements' }),
      el('p', { className: 'hint', textContent: `Switch on each size you offer. Measurements are optional lengths in ${options.unit}.` }),
      fieldError('sizes'),
      ...options.sizes.map(sizeRow),
    ),
    el('button', { type: 'submit', className: 'button primary', textContent: 'Save piece' }),
    el('p', { className: 'save-status', attrs: { role: 'status' } }),
  );

  // Show the price box that is in use: the single price, or one price on each size.
  const applyMode = () => {
    const perSize = form.querySelector('input[name="pricingMode"]:checked')?.value === 'per_size';
    singlePrice.hidden = perSize;
    form.querySelectorAll('.size-price').forEach((box) => { box.hidden = !perSize; });
  };
  form.querySelectorAll('input[name="pricingMode"]').forEach((radio) => radio.addEventListener('change', applyMode));
  return form;
};

/** Read what the owner typed straight from the inputs (plain text, as the pure validator expects). */
const readForm = (form, options) => {
  const q = (name) => form.querySelector(`[name="${name}"]`);
  return {
    name: q('name').value,
    description: q('description').value,
    pricingMode: form.querySelector('input[name="pricingMode"]:checked')?.value ?? 'single',
    price: q('price').value,
    isActive: q('isActive').checked,
    sizes: Object.fromEntries(options.sizes.map(({ value: size }) => [size, {
      enabled: q(`size-${size}-enabled`).checked,
      stock: q(`size-${size}-stock`).value,
      price: q(`size-${size}-price`).value,
      measurements: Object.fromEntries(options.measurement_parts.map(({ value: part }) => [part, q(`size-${size}-${part}`).value])),
    }])),
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
  // Move focus to the first problem so keyboard and screen-reader users land on it.
  first?.closest('.field, fieldset')?.querySelector('input, textarea')?.focus();
};

const showAlert = (form, error) => {
  const alert = form.querySelector('.form-alert');
  const lines = detailLines(error);
  alert.replaceChildren(
    el('p', { textContent: error?.message ?? 'Something went wrong. Please try again.' }),
    lines.length > 0 && el('ul', {}, ...lines.map((line) => el('li', { textContent: line }))),
  );
  alert.hidden = false;
};

// ---- the photo manager (existing pieces only) ------------------------------------------

const photoSection = ({ options, getProduct, setProduct }) => {
  const section = el('section', { className: 'photos' });
  const rules = options.images ?? null;

  const run = async (action, message) => {
    try {
      setProduct(await action());
      draw();
    } catch (error) {
      draw(error?.message ?? message);
    }
  };

  function draw(message = '') {
    const product = getProduct();
    const images = sortedImages(product);
    const slots = remainingSlots(images.length, rules);

    const items = images.map((image, index) => {
      const cover = el('button', { type: 'button', textContent: 'Make cover', dataset: { cover: '' } });
      cover.addEventListener('click', () => run(
        () => reorderImages(product.id, [image.id, ...images.filter((i) => i.id !== image.id).map((i) => i.id)]),
        'Could not change the cover photo.',
      ));
      const remove = el('button', { type: 'button', textContent: 'Delete', className: 'danger', dataset: { deletePhoto: '' } });
      remove.addEventListener('click', () => {
        if (window.confirm('Remove this photo?')) run(() => deleteImage(product.id, image.id), 'Could not delete the photo.');
      });
      return el(
        'li',
        {},
        el('img', { src: image.url, alt: `Photo ${index + 1} of ${product.name}` }),
        index === 0 ? el('span', { className: 'badge', textContent: 'Cover' }) : cover,
        remove,
      );
    });

    const input = el('input', { type: 'file', name: 'photo', accept: (rules?.types ?? ['image/jpeg', 'image/png', 'image/webp']).join(','), disabled: slots === 0 });
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      const problem = validateImageFile(file, rules);
      if (problem) { draw(problem); return; }
      input.disabled = true;
      run(() => uploadImage(product.id, file), 'Could not upload the photo.');
    });

    const count = rules ? `${images.length} of ${rules.max_per_product} photos` : `${images.length} photos`;
    section.replaceChildren(
      el('h2', { textContent: 'Photos' }),
      el('p', { className: 'hint', textContent: 'The first photo is the cover shown in the shop.' }),
      images.length > 0 && el('ul', { className: 'photo-list' }, ...items),
      el('label', { className: 'upload' }, 'Add a photo ', input),
      fieldError('photo'),
      el('p', { className: 'hint', textContent: slots === 0 ? `${count}. Delete one to add another.` : count }),
    );
    const error = section.querySelector('[data-error="photo"]');
    error.textContent = message;
    error.hidden = !message;
  }

  draw();
  return section;
};

// ---- the page --------------------------------------------------------------------------

export const renderAdminEdit = (view, { params, navigate }) => {
  const productId = params.id ?? null;
  const isNew = productId === null;

  const missing = () =>
    el('div', { className: 'state' }, el('h1', { textContent: 'Piece not found' }), el('p', { textContent: 'This piece could not be found. It may have been deleted.' }), link('/admin', 'Back to your pieces'));

  async function load() {
    view.replaceChildren(loading());
    try {
      // Here the size list is REQUIRED: without it there is no form to show.
      const [options, product] = await Promise.all([getCatalogueOptions(), isNew ? null : getAdminProduct(productId)]);
      show(options, product);
    } catch (error) {
      view.replaceChildren(error?.code === 'not_found' ? missing() : errorState(error, load));
    }
  }

  function show(options, loaded) {
    let product = loaded;
    const form = buildForm(options, isNew ? emptyForm(options) : productToForm(product, options));
    const submitButton = form.querySelector('button[type="submit"]');
    const status = form.querySelector('.save-status');
    let saving = false;

    const setSaving = (value) => {
      saving = value;
      submitButton.disabled = value;
      submitButton.textContent = value ? 'Saving…' : 'Save piece';
    };

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (saving) return; // ignore a second click while the first save is still running

      const result = formToPayload(readForm(form, options), options);
      showErrors(form, result.ok ? {} : result.errors);
      form.querySelector('.form-alert').hidden = true;
      status.textContent = '';
      if (!result.ok) return;

      setSaving(true);
      try {
        if (isNew) {
          const created = await createProduct(result.value);
          navigate(`/admin/products/${created.id}`); // photos can only be added once the piece exists
          return;
        }
        // One request saves details, pricing and sizes together, so a failure can never leave
        // the piece half-updated (for example "per size" pricing with no size prices yet).
        product = await saveProduct(productId, result.value);
        status.textContent = 'Saved ✓';
      } catch (error) {
        showAlert(form, error);
      } finally {
        setSaving(false);
      }
    });

    const parts = [
      el('div', { className: 'page-head' },
        el('h1', { textContent: isNew ? 'New piece' : `Edit: ${product.name}` }),
        link('/admin', '← All pieces')),
      form,
    ];

    if (isNew) {
      parts.push(el('p', { className: 'hint', textContent: 'Save the piece first, then you can add its photos.' }));
    } else {
      parts.push(photoSection({ options, getProduct: () => product, setProduct: (next) => { product = next; } }));

      const remove = el('button', { type: 'button', className: 'danger', textContent: 'Delete this piece', dataset: { deletePiece: '' } });
      remove.addEventListener('click', async () => {
        if (!window.confirm(`Delete "${product.name}"? This also removes its photos and cannot be undone.`)) return;
        try {
          await deleteProduct(productId);
          navigate('/admin');
        } catch (error) {
          showAlert(form, error);
        }
      });
      parts.push(el('div', { className: 'danger-zone' }, remove));
    }

    view.replaceChildren(...parts);
  }

  load();
};
