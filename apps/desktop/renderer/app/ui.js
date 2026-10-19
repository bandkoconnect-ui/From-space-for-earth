// Small UI services shared by every view: toast messages, safe external links, and modal
// dialogs (built on the native <dialog> element, which handles focus trapping and Escape).

import { h, ic } from '../shared/ui/dom.js';

let dialogCounter = 0;

export function createUi({ platform }) {
  const toastEl = h('div', { class: 'toast', role: 'status', 'aria-live': 'polite' });
  document.body.append(toastEl);
  let toastTimer = null;

  function toast(message, { error = false, ms = 3600 } = {}) {
    toastEl.textContent = message;
    toastEl.classList.toggle('error', error);
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), error ? Math.max(ms, 6000) : ms);
  }

  /** An external link that opens in the system browser. Only http(s) URLs are ever followed. */
  function link(url, ...children) {
    return h('a', {
      href: url,
      rel: 'noopener noreferrer',
      onClick: (event) => { event.preventDefault(); platform.openExternal(url); }
    }, ...children);
  }

  /**
   * Opens a modal dialog.
   * spec: { title, body: Node, actions: [{ label, kind, onClick }], className, dismissible }
   * The primary action is the form's submit button, so Enter works in text fields. An action's
   * onClick may return false to keep the dialog open (for validation errors).
   * Returns { close(value), closed: Promise<value> }.
   */
  function modal({ title, body, actions = [], className = '', dismissible = true, onOpen }) {
    const titleId = `dialog-title-${(dialogCounter += 1)}`;
    const dialog = h('dialog', { class: `modal ${className}`.trim(), 'aria-labelledby': titleId });
    let resolveClosed;
    const closed = new Promise((resolve) => { resolveClosed = resolve; });
    let result;

    const close = (value) => {
      result = value;
      if (dialog.open) dialog.close();
    };

    const buttons = actions.map((action) => h('button', {
      type: action.kind === 'primary' || action.kind === 'danger' ? 'submit' : 'button',
      class: `btn ${action.kind === 'primary' ? 'btn-primary' : action.kind === 'danger' ? 'btn-danger' : action.kind === 'ghost' ? 'btn-ghost' : ''}`.trim(),
      onClick: action.kind === 'primary' || action.kind === 'danger' ? undefined : async () => {
        const keep = await action.onClick?.({ close });
        if (keep !== false && !action.keepOpen) close(action.value);
      }
    }, action.label));

    const submitAction = actions.find((a) => a.kind === 'primary' || a.kind === 'danger');
    const form = h('form', {
      class: 'modal-form',
      method: 'dialog',
      onSubmit: async (event) => {
        event.preventDefault();
        if (!submitAction) return;
        const keep = await submitAction.onClick?.({ close });
        if (keep !== false) close(submitAction.value);
      }
    },
    h('header', { class: 'modal-head' },
      h('h2', { id: titleId }, title),
      dismissible ? h('button', { type: 'button', class: 'btn btn-ghost btn-icon', 'aria-label': 'Close', onClick: () => close(undefined) }, ic('close')) : null),
    h('div', { class: 'modal-body' }, body),
    actions.length ? h('footer', { class: 'modal-foot' }, buttons) : null);

    dialog.append(form);
    dialog.addEventListener('close', () => { dialog.remove(); resolveClosed(result); });
    dialog.addEventListener('cancel', (event) => { if (!dismissible) event.preventDefault(); });

    // Clicking the dimmed backdrop closes the dialog, but only if the press also began there.
    let pressedBackdrop = false;
    dialog.addEventListener('mousedown', (event) => { pressedBackdrop = event.target === dialog; });
    dialog.addEventListener('click', (event) => { if (dismissible && pressedBackdrop && event.target === dialog) close(undefined); });

    document.body.append(dialog);
    dialog.showModal();
    onOpen?.(dialog);
    return { close, closed, dialog };
  }

  /** Resolves true if confirmed. */
  async function confirm({ title, message, confirmLabel = 'Confirm', danger = false }) {
    const { closed } = modal({
      title,
      className: 'modal-small',
      body: h('p', { class: 'modal-text' }, message),
      actions: [
        { label: 'Cancel', kind: 'ghost', value: false },
        { label: confirmLabel, kind: danger ? 'danger' : 'primary', value: true }
      ]
    });
    return (await closed) === true;
  }

  /** Resolves the entered text, or null if cancelled. */
  async function prompt({ title, label, value = '', maxLength = 80, confirmLabel = 'Save' }) {
    const input = h('input', { class: 'input', type: 'text', value, maxlength: maxLength, required: true, 'aria-label': label });
    const { closed } = modal({
      title,
      className: 'modal-small',
      body: h('label', { class: 'field' }, label, input),
      actions: [
        { label: 'Cancel', kind: 'ghost', value: null },
        { label: confirmLabel, kind: 'primary', onClick: ({ close }) => { const text = input.value.trim(); if (!text) { input.focus(); return false; } close(text); return false; } }
      ],
      onOpen: () => { input.focus(); input.select(); }
    });
    return (await closed) ?? null;
  }

  return { toast, link, modal, confirm, prompt };
}
