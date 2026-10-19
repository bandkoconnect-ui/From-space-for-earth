// Small interface building blocks: icons, toasts, modal dialogs, confirm and lightbox.
// Dialogs use the native <dialog> element, which handles focus trapping and Escape.

import { h, icon, ICONS } from '../../../packages/ui/dom.js';

/** Extra icons for the web app (24 x 24, stroked). */
const MORE_ICONS = {
  fire: ['M12 21c4 0 6.5-2.7 6.5-6.4 0-3.9-3-6.3-4.3-9.6-.4 2.3-1.6 3.6-3 4.6C11 7.8 10 6 10 3.5 6.7 6.2 5.5 10 5.5 14.6 5.5 18.3 8 21 12 21Z'],
  storm: ['M20 9a8 8 0 0 0-14.6-2.4', 'M4 15a8 8 0 0 0 14.6 2.4', 'M12 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z'],
  volcano: ['M3 20h18l-6-9h-6z', 'M9.5 11 11 7m3.5 4L13 7', 'M10 4.5c.6-.9 1.4-1 2-.4.6-.6 1.4-.5 2 .4'],
  water: ['M3 15c1.5 0 1.5-1.2 3-1.2s1.5 1.2 3 1.2 1.5-1.2 3-1.2 1.5 1.2 3 1.2 1.5-1.2 3-1.2 1.5 1.2 3 1.2', 'M3 19.5c1.5 0 1.5-1.2 3-1.2s1.5 1.2 3 1.2 1.5-1.2 3-1.2 1.5 1.2 3 1.2 1.5-1.2 3-1.2 1.5 1.2 3 1.2', 'M12 3c2.2 2.8 3.3 4.7 3.3 6.1a3.3 3.3 0 0 1-6.6 0C8.7 7.7 9.8 5.8 12 3Z'],
  ice: ['M12 3v18M4.2 7.5l15.6 9M19.8 7.5l-15.6 9', 'M9.5 4.5 12 7l2.5-2.5M9.5 19.5 12 17l2.5 2.5'],
  dust: ['M4 9h11a3 3 0 1 0-3-3', 'M3 13h15a3 3 0 1 1-3 3', 'M5 17h6'],
  quake: ['M3 12h3l2-5 3 10 3-8 2 3h5'],
  globe: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z', 'M3 12h18', 'M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3Z'],
  sidebar: ['M4 5h16v14H4z', 'M9.5 5v14'],
  share: ['M12 15V4', 'm8 8 4-4 4 4', 'M5 13v6h14v-6'],
  check: ['m5 12.5 4.5 4.5L19 7.5'],
  moon: ['M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z'],
  image: ['M4 5h16v14H4z', 'm4 16 5-5 4 4 2.5-2.5L20 17', 'M15.5 9.5h.01'],
  target: ['M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z', 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z'],
  arrowLeft: ['M19 12H5', 'm11 6-6 6 6 6']
};

/**
 * Scrolls `el` into view inside one scroll container only. (Element.scrollIntoView also scrolls
 * every ancestor, including panels with overflow: hidden, which shifts whole sheets on phones.)
 */
export function revealIn(container, el, { block = 'nearest', smooth = false, offset = 8 } = {}) {
  if (!container || !el) return;
  const c = container.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  let top = container.scrollTop;
  if (block === 'start') top += r.top - c.top - offset;
  else if (r.top < c.top) top += r.top - c.top - offset;
  else if (r.bottom > c.bottom) top += r.bottom - c.bottom + offset;
  else return;
  container.scrollTo({ top: Math.max(0, top), behavior: smooth ? 'smooth' : 'auto' });
}

export function ic(name, options) {
  return icon(MORE_ICONS[name] || ICONS[name] || ICONS.info, options);
}

const CATEGORY_ICON = {
  wildfires: 'fire', severeStorms: 'storm', volcanoes: 'volcano', floods: 'water', landslides: 'volcano',
  seaLakeIce: 'ice', snow: 'ice', dustHaze: 'dust', earthquakes: 'quake', drought: 'dust', waterColor: 'water', tempExtremes: 'fire',
  flood: 'water', fire: 'fire', storm: 'storm', volcano: 'volcano', forest: 'globe', urban: 'globe', environment: 'globe', other: 'globe'
};

export function categoryIcon(categoryId, options = { size: 14, stroke: 1.8 }) {
  return ic(CATEGORY_ICON[categoryId] || 'globe', options);
}

export function createUi(root = document.body) {
  const region = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' });
  root.append(region);

  function toast(message, { error = false, action = null, timeout = 4200 } = {}) {
    const el = h('div', { class: `toast${error ? ' toast-error' : ''}` },
      h('span', null, message),
      action ? h('button', { type: 'button', class: 'toast-action', onClick: () => { action.onClick(); el.remove(); } }, action.label) : null);
    region.append(el);
    while (region.children.length > 3) region.firstElementChild.remove();
    setTimeout(() => el.classList.add('leaving'), timeout);
    setTimeout(() => el.remove(), timeout + 300);
  }

  /**
   * A modal dialog. `body` is a node; `actions` are { label, kind, onClick } where onClick may
   * return false to keep the dialog open. Resolves with the action label, or null on dismiss.
   */
  function modal({ title, body, actions = [{ label: 'Done', kind: 'primary' }], className = '', describedBy = null }) {
    const dialog = h('dialog', { class: `modal ${className}`, 'aria-labelledby': 'modal-title' });
    const titleEl = h('h2', { id: 'modal-title', class: 'modal-title' }, title);
    const close = h('button', { type: 'button', class: 'icon-button', 'aria-label': 'Close', onClick: () => finish(null) }, ic('close', { size: 18 }));
    const form = h('form', { method: 'dialog', novalidate: true, class: 'modal-form', onSubmit: (e) => { e.preventDefault(); const primary = actions.find((a) => a.kind === 'primary'); if (primary) run(primary); } },
      h('header', { class: 'modal-head' }, titleEl, close),
      h('div', { class: 'modal-body' }, body),
      actions.length ? h('footer', { class: 'modal-foot' }, actions.map((action) => h('button', {
        type: action.kind === 'primary' ? 'submit' : 'button',
        class: `btn${action.kind === 'primary' ? ' btn-primary' : action.kind === 'danger' ? ' btn-danger' : ' btn-quiet'}`,
        onClick: action.kind === 'primary' ? null : () => run(action)
      }, action.label))) : null);
    dialog.append(form);
    if (describedBy) dialog.setAttribute('aria-describedby', describedBy);
    document.body.append(dialog);
    let resolveFn;
    const closed = new Promise((resolve) => { resolveFn = resolve; });
    const opener = document.activeElement;
    function finish(value) {
      if (!dialog.isConnected) return;
      dialog.close();
      dialog.remove();
      resolveFn(value);
      if (opener && opener.isConnected && typeof opener.focus === 'function') opener.focus({ preventScroll: true });
    }
    async function run(action) {
      const result = action.onClick ? await action.onClick() : true;
      if (result !== false) finish(action.label);
    }
    dialog.addEventListener('cancel', (e) => { e.preventDefault(); finish(null); });
    dialog.addEventListener('click', (e) => { if (e.target === dialog) finish(null); });
    dialog.showModal();
    const first = dialog.querySelector('[autofocus], .modal-body input, .modal-body textarea, .modal-body select');
    (first || close).focus();
    return { dialog, closed, close: () => finish(null) };
  }

  async function confirm({ title, message, confirmLabel = 'Confirm', danger = false }) {
    const handle = modal({ title, body: h('p', { class: 'modal-text' }, message), actions: [{ label: 'Cancel', kind: 'quiet' }, { label: confirmLabel, kind: danger ? 'danger' : 'primary' }] });
    return (await handle.closed) === confirmLabel;
  }

  async function prompt({ title, label, value = '', confirmLabel = 'Save', maxlength = 80 }) {
    const input = h('input', { class: 'input', type: 'text', value, maxlength, 'aria-label': label, autocomplete: 'off', autofocus: true });
    let result = null;
    const handle = modal({ title, body: h('label', { class: 'field' }, h('span', null, label), input), actions: [{ label: 'Cancel', kind: 'quiet' }, { label: confirmLabel, kind: 'primary', onClick: () => { result = input.value.trim(); return Boolean(result); } }] });
    input.select();
    await handle.closed;
    return result;
  }

  /** A large image with its caption and optional actions. */
  function lightbox({ src, alt, caption, actions = [] }) {
    const img = h('img', { src, alt, class: 'lightbox-img', decoding: 'async' });
    const status = h('p', { class: 'lightbox-status' }, 'Loading imagery from NASA…');
    img.addEventListener('load', () => status.remove());
    img.addEventListener('error', () => { img.remove(); status.textContent = 'NASA did not return an image for this date. The day may still be processing, or the service may be unavailable.'; });
    return modal({ title: alt, className: 'modal-wide', body: h('figure', { class: 'lightbox' }, img, status, h('figcaption', null, caption)), actions: [...actions, { label: 'Close', kind: 'primary' }] });
  }

  return { toast, modal, confirm, prompt, lightbox };
}
