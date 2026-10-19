// Small UI services for the phone app: toasts, external links, and modal bottom sheets
// (the phone's version of a dialog: it slides up, can be dragged down to dismiss, and is
// closed by the Android back button).

import { h, ic } from '../shared/ui/dom.js';

let sheetCounter = 0;

export function createUi({ platform }) {
  const toastEl = h('div', { class: 'toast', role: 'status', 'aria-live': 'polite' });
  const layer = h('div', { class: 'sheet-layer' });
  document.body.append(layer, toastEl);
  const stack = [];
  let toastTimer = null;

  function toast(message, { error = false, ms = 3200 } = {}) {
    toastEl.textContent = message;
    toastEl.classList.toggle('error', error);
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), error ? Math.max(ms, 5500) : ms);
  }

  function link(url, ...children) {
    return h('a', { href: url, rel: 'noopener noreferrer', onClick: (event) => { event.preventDefault(); platform.openExternal(url); } }, ...children);
  }

  /**
   * Opens a bottom sheet. spec: { title, body, actions: [{ label, kind, onClick, value }], className, dismissible, onOpen }.
   * The primary action is the form's submit button, so the keyboard's Go key works. An action's
   * onClick may return false to keep the sheet open. Returns { close(value), closed }.
   */
  function sheet({ title, body, actions = [], className = '', dismissible = true, onOpen }) {
    const titleId = `sheet-title-${(sheetCounter += 1)}`;
    let resolveClosed;
    const closed = new Promise((resolve) => { resolveClosed = resolve; });
    let result;
    let finished = false;
    const previousFocus = document.activeElement;

    const entry = { close: (value) => close(value), dismissible };

    function close(value) {
      if (finished) return;
      finished = true;
      result = value;
      stack.splice(stack.indexOf(entry), 1);
      modal.classList.add('closing');
      const done = () => {
        // Give focus back to what opened this sheet, unless another sheet has taken it meanwhile
        // (an action sheet hands over to a prompt, for example).
        const taken = document.activeElement && layer.contains(document.activeElement) && !modal.contains(document.activeElement);
        modal.remove();
        resolveClosed(result);
        if (!taken) previousFocus?.focus?.({ preventScroll: true });
      };
      setTimeout(done, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 200);
    }

    const submit = actions.find((a) => a.kind === 'primary' || a.kind === 'danger');
    const buttons = actions.map((action) => h('button', {
      type: action === submit ? 'submit' : 'button',
      class: `btn ${action.kind === 'primary' ? 'btn-primary' : action.kind === 'danger' ? 'btn-danger' : action.kind === 'ghost' ? 'btn-ghost' : ''}`.trim(),
      onClick: action === submit ? undefined : async () => {
        const keep = await action.onClick?.({ close });
        if (keep !== false && !action.keepOpen) close(action.value);
      }
    }, action.label));

    const grabber = h('div', { class: 'sheet-grabber', 'aria-hidden': 'true' }, h('span'));
    const panel = h('form', {
      class: `sheet-panel ${className}`.trim(), role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId, tabindex: '-1', method: 'dialog', novalidate: true, // our own messages, not the browser's bubbles
     
      onSubmit: async (event) => {
        event.preventDefault();
        if (!submit) return;
        const keep = await submit.onClick?.({ close });
        if (keep !== false) close(submit.value);
      }
    },
    grabber,
    h('header', { class: 'sheet-head' },
      h('h2', { id: titleId }, title),
      dismissible ? h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Close', onClick: () => close(undefined) }, ic('close')) : null),
    h('div', { class: 'sheet-scroll' }, body),
    actions.length ? h('footer', { class: 'sheet-foot' }, buttons) : null);

    const modal = h('div', { class: 'sheet-modal' }, h('div', { class: 'sheet-backdrop', onClick: () => { if (dismissible) close(undefined); } }), panel);

    // Drag the top of the sheet down to dismiss it.
    if (dismissible) {
      let startY = null;
      let dy = 0;
      let lastY = 0;
      let lastT = 0;
      let velocity = 0;
      const zone = [grabber, panel.querySelector('.sheet-head')];
      for (const el of zone) {
        el.addEventListener('pointerdown', (event) => {
          if (event.target.closest('button')) return;
          startY = event.clientY; lastY = startY; lastT = event.timeStamp; dy = 0; velocity = 0;
          el.setPointerCapture(event.pointerId);
          panel.style.transition = 'none';
        });
        el.addEventListener('pointermove', (event) => {
          if (startY === null) return;
          dy = Math.max(0, event.clientY - startY);
          const dt = Math.max(1, event.timeStamp - lastT);
          velocity = (event.clientY - lastY) / dt;
          lastY = event.clientY; lastT = event.timeStamp;
          panel.style.transform = `translateY(${dy}px)`;
        });
        const end = () => {
          if (startY === null) return;
          startY = null;
          panel.style.transition = '';
          if (dy > 110 || velocity > 0.6) close(undefined);
          else panel.style.transform = '';
        };
        el.addEventListener('pointerup', end);
        el.addEventListener('pointercancel', end);
      }
    }

    modal.addEventListener('keydown', (event) => {
      if (event.key !== 'Tab') return;
      const focusable = [...panel.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter((el) => !el.disabled && el.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });

    layer.append(modal);
    stack.push(entry);
    panel.focus({ preventScroll: true });
    onOpen?.(panel);
    return { close, closed, panel };
  }

  /** A list of large tap targets. Each action closes the sheet, then runs. */
  function actionSheet({ title, actions }) {
    const body = h('div', { class: 'action-list' }, actions.map((action) => h('button', {
      type: 'button',
      class: `action-row${action.kind === 'danger' ? ' danger' : ''}`,
      onClick: () => { handle.close(); action.onClick?.(); }
    }, action.icon ? ic(action.icon, { size: 20 }) : null, h('span', null, action.label))));
    const handle = sheet({ title, body, className: 'sheet-compact' });
    return handle;
  }

  async function confirm({ title, message, confirmLabel = 'Confirm', danger = false }) {
    const { closed } = sheet({
      title,
      className: 'sheet-compact',
      body: h('p', { class: 'sheet-text' }, message),
      actions: [
        { label: 'Cancel', kind: 'ghost', value: false },
        { label: confirmLabel, kind: danger ? 'danger' : 'primary', value: true }
      ]
    });
    return (await closed) === true;
  }

  async function prompt({ title, label, value = '', maxLength = 80, confirmLabel = 'Save' }) {
    const input = h('input', { class: 'input', type: 'text', value, maxlength: maxLength, required: true, enterkeyhint: 'done', 'aria-label': label });
    const { closed } = sheet({
      title,
      className: 'sheet-compact',
      body: h('label', { class: 'field' }, label, input),
      actions: [
        { label: 'Cancel', kind: 'ghost', value: null },
        { label: confirmLabel, kind: 'primary', onClick: ({ close }) => { const text = input.value.trim(); if (!text) { input.focus(); return false; } close(text); return false; } }
      ],
      onOpen: () => { input.focus(); input.select(); }
    });
    return (await closed) ?? null;
  }

  // Escape closes the top sheet from anywhere (a button that was disabled drops focus to the page).
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && closeTop()) event.preventDefault();
  });

  /** Closes the top sheet if there is one (for the Android back button). Returns true if it did. */
  function closeTop() {
    const top = stack[stack.length - 1];
    if (!top) return false;
    if (top.dismissible) top.close(undefined);
    return true;
  }

  return { toast, link, sheet, actionSheet, confirm, prompt, closeTop, hasSheet: () => stack.length > 0 };
}
