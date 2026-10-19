// "Search anywhere on Earth": an accessible combobox. ECHO's own events and investigations
// match instantly as you type; places come from the geocoding services a moment later.

import { h, mount } from '../../../packages/ui/dom.js';
import { relativeDays } from '../../../packages/core/src/dates.js';
import { coordinatePlace, searchPlaces } from './geocode.js';
import { categoryIcon, ic, revealIn } from './ui.js';

const RECENT_KEY = 'echo-web-recent-searches';
const SUGGESTIONS = ['Kathmandu', 'Amazon rainforest', 'California', 'Iceland'];

function loadRecent() {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]').filter((s) => typeof s === 'string').slice(0, 4); } catch { return []; }
}
function saveRecent(text) {
  try { localStorage.setItem(RECENT_KEY, JSON.stringify([text, ...loadRecent().filter((s) => s.toLowerCase() !== text.toLowerCase())].slice(0, 4))); } catch { /* storage may be blocked */ }
}

export function createSearch(app, { onFocus = () => {}, onBlurEmpty = () => {} } = {}) {
  const st = { query: '', local: [], places: [], status: 'idle', error: null, active: -1, open: false, controller: null, timer: null, provider: null };

  const input = h('input', {
    id: 'search-input', class: 'search-input', type: 'search', role: 'combobox', autocomplete: 'off', spellcheck: 'false', enterkeyhint: 'search',
    placeholder: 'Search anywhere on Earth…', 'aria-label': 'Search places, events and investigations',
    'aria-autocomplete': 'list', 'aria-expanded': 'false', 'aria-controls': 'search-results'
  });
  const clearBtn = h('button', { type: 'button', class: 'search-clear', 'aria-label': 'Clear search', hidden: true, onClick: () => { clear(); input.focus(); } }, ic('close', { size: 16 }));
  const spinner = h('span', { class: 'spinner', hidden: true, 'aria-hidden': 'true' });
  const list = h('div', { id: 'search-results', class: 'search-results', role: 'listbox', 'aria-label': 'Search results', hidden: true });
  const el = h('div', { class: 'search', role: 'search' },
    h('div', { class: 'search-field' }, ic('search', { size: 18, className: 'icon search-icon' }), input, spinner, clearBtn),
    list);

  let options = [];

  function localMatches(q) {
    const text = q.toLowerCase();
    const out = [];
    for (const event of app.state.events) {
      if (`${event.title} ${event.category}`.toLowerCase().includes(text)) out.push({ kind: 'event', id: event.id, label: event.title, detail: `${event.category} · ${relativeDays(event.date)}`, categoryId: event.categoryId });
      if (out.length >= 4) break;
    }
    for (const inv of app.store.list()) {
      if (inv.title.toLowerCase().includes(text)) out.push({ kind: 'inv', id: inv.id, label: inv.title, detail: inv.kind === 'custom' ? 'Your investigation' : 'Case study', categoryId: inv.topic });
      if (out.length >= 6) break;
    }
    return out;
  }

  function run(q) {
    st.query = q;
    clearTimeout(st.timer);
    st.controller?.abort();
    const coords = coordinatePlace(q);
    st.local = q.length >= 2 ? localMatches(q) : [];
    st.places = coords ? [coords] : [];
    st.error = null;
    if (q.length < 2 || coords) { st.status = 'idle'; render(); return; }
    st.status = 'loading';
    render();
    st.timer = setTimeout(async () => {
      const controller = new AbortController();
      st.controller = controller;
      try {
        const zoom = app.atlas.getZoom();
        const near = zoom >= 5 ? { ...app.atlas.getCenter(), zoom } : null;
        const result = await searchPlaces(q, { signal: controller.signal, near, providers: app.config.geocoders });
        if (controller.signal.aborted || st.query !== q) return;
        st.places = result.places;
        st.provider = result.provider;
        st.status = 'done';
      } catch (error) {
        if (controller.signal.aborted) return;
        st.status = 'error';
        st.error = error;
      }
      render();
      if (st.pendingEnter) {
        st.pendingEnter = false;
        const first = options.findIndex((o) => o.kind !== 'recent');
        if (first >= 0) choose(first);
      }
    }, 260);
  }

  function option(item, index) {
    const selected = index === st.active;
    const icon = item.kind === 'event' || item.kind === 'inv' ? categoryIcon(item.categoryId) : item.kind === 'recent' ? ic('refresh', { size: 14 }) : ic(item.type === 'coords' ? 'target' : 'pin', { size: 14 });
    return h('div', {
      id: `search-opt-${index}`, role: 'option', class: `search-option${selected ? ' is-active' : ''}${item.kind === 'event' ? ' is-event' : ''}`, 'aria-selected': String(selected),
      onPointerdown: (e) => e.preventDefault(), // keep focus in the input
      onClick: () => choose(index)
    }, h('span', { class: 'opt-icon' }, icon), h('span', { class: 'opt-text' }, h('span', { class: 'opt-label' }, item.label), item.detail ? h('span', { class: 'opt-detail' }, item.detail) : null));
  }

  function render() {
    const q = st.query;
    spinner.hidden = st.status !== 'loading';
    clearBtn.hidden = !q;
    const groups = [];
    options = [];
    if (!q) {
      const recent = loadRecent();
      const items = (recent.length ? recent : SUGGESTIONS).map((text) => ({ kind: 'recent', label: text, query: text }));
      groups.push({ title: recent.length ? 'Recent searches' : 'Try', items });
    } else {
      if (st.local.length) groups.push({ title: 'On ECHO', items: st.local });
      if (st.places.length) groups.push({ title: 'Places', items: st.places.map((p) => ({ ...p, kind: 'place', place: p })) });
    }
    const nodes = [];
    for (const group of groups) {
      nodes.push(h('div', { class: 'search-group', role: 'presentation' }, group.title));
      for (const item of group.items) { nodes.push(option(item, options.length)); options.push(item); }
    }
    if (q && st.status === 'loading' && !st.places.length) nodes.push(h('div', { class: 'search-note', role: 'presentation' }, 'Looking up places…'));
    if (q && st.status === 'error') nodes.push(h('div', { class: 'search-note is-error', role: 'presentation' }, 'Place search is not reachable right now. ECHO events and typed coordinates (like 27.7, 85.3) still work.'));
    if (q && st.status === 'done' && !st.places.length && !st.local.length) nodes.push(h('div', { class: 'search-note', role: 'presentation' }, `No places match “${q}”. Try a city, a country, or coordinates like 27.7, 85.3.`));
    if (q && q.length < 2) nodes.push(h('div', { class: 'search-note', role: 'presentation' }, 'Keep typing…'));
    if (st.status === 'done' && st.places.length && st.provider?.attribution) nodes.push(h('div', { class: 'search-credit', role: 'presentation' }, st.provider.attribution));
    mount(list, ...nodes);
    st.active = Math.min(st.active, options.length - 1);
    setOpen(st.open && nodes.length > 0);
    input.setAttribute('aria-activedescendant', st.active >= 0 ? `search-opt-${st.active}` : '');
  }

  function setOpen(open) {
    list.hidden = !open;
    input.setAttribute('aria-expanded', String(open));
    el.classList.toggle('is-open', open);
  }

  function choose(index) {
    const item = options[index];
    if (!item) return;
    if (item.kind === 'recent') { input.value = item.query; run(item.query); st.active = -1; return; }
    if (st.query) saveRecent(st.query);
    st.open = false;
    render();
    input.blur();
    input.value = item.label; // show what was chosen, as a map app does
    st.query = item.label;
    clearBtn.hidden = false;
    if (item.kind === 'event' || item.kind === 'inv') app.select({ kind: item.kind, id: item.id }, { source: 'search' });
    else app.goToPlace(item.place);
  }

  function clear() {
    input.value = '';
    st.active = -1;
    run('');
    app.clearArea({ keepCamera: true });
  }

  input.addEventListener('input', () => { st.open = true; st.active = -1; st.pendingEnter = false; run(input.value.trim()); });
  let quiet = false;
  input.addEventListener('focus', () => { if (!quiet) { st.open = true; render(); } onFocus(); });
  input.addEventListener('pointerdown', () => { if (!st.open) { st.open = true; render(); } });
  input.addEventListener('blur', () => { setTimeout(() => { if (document.activeElement !== input) { st.open = false; render(); if (!input.value) onBlurEmpty(); } }, 120); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); st.open = true; st.active = Math.min(options.length - 1, st.active + 1); render(); revealIn(list, list.querySelector('.is-active'), { offset: 4 }); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); st.active = Math.max(-1, st.active - 1); render(); revealIn(list, list.querySelector('.is-active'), { offset: 4 }); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (st.active >= 0) choose(st.active);
      else {
        const first = options.findIndex((o) => o.kind !== 'recent');
        if (first >= 0) choose(first);
        else if (st.status === 'loading') st.pendingEnter = true;
      }
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      if (st.open && !list.hidden) { st.open = false; render(); } else if (input.value) clear(); else input.blur();
    }
  });

  return {
    el, input,
    /** Focuses the field. `quiet` keeps the suggestions closed until the person types or clicks. */
    focus({ quiet: q = false } = {}) { quiet = q; input.focus({ preventScroll: true }); quiet = false; },
    clear,
    setValue(text) { input.value = text; st.query = text; clearBtn.hidden = !text; },
    refresh() { if (st.query) { st.local = localMatches(st.query); render(); } }
  };
}
