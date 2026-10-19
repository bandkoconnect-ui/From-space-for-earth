// Planet Pulse: what NASA's event tracker says is happening on Earth right now, as a list or a map.

import { h, ic, mount } from '../../shared/ui/dom.js';
import { EchoMap } from '../../shared/map/echo-map.js';
import { EVENT_CATEGORIES, formatDateLong, relativeDays, worldviewUrl } from '../../shared/core/src/index.js';

function timeLabel(iso) {
  try { return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); } catch { return ''; }
}

export function createPulseView(app) {
  const { store, feed, ui, platform, actions } = app;
  const st = {
    events: [], category: 'all', query: '', selectedId: null, mode: 'list',
    status: { loading: false, stale: false, error: null, fetchedAt: null }, visible: false, fitted: false
  };
  let map = null;

  const root = h('section', { class: 'view pulse', 'aria-label': 'Planet Pulse', hidden: true });

  /* ---- header and filters ---- */
  const statusEl = h('p', { class: 'muted small status-line', role: 'status' });
  const refreshButton = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Refresh events', onClick: () => refresh({ force: true }) }, ic('refresh'));
  const modeButtons = new Map();
  const modes = h('div', { class: 'segmented', role: 'tablist', 'aria-label': 'View' },
    [['list', 'List'], ['map', 'Map']].map(([id, label]) => {
      const button = h('button', { type: 'button', role: 'tab', class: 'seg', onClick: () => setMode(id) }, label);
      modeButtons.set(id, button);
      return button;
    }));
  const search = h('input', { class: 'input', type: 'search', placeholder: 'Search events', 'aria-label': 'Search events', enterkeyhint: 'search', onInput: () => { st.query = search.value; renderAll({ fit: true }); } });
  const chipsEl = h('div', { class: 'chip-row', role: 'group', 'aria-label': 'Filter by category' });

  root.append(h('header', { class: 'page-head' },
    h('div', { class: 'page-title' }, h('div', null, h('h1', null, 'Planet Pulse'), statusEl), refreshButton),
    modes,
    search,
    chipsEl));

  /* ---- list ---- */
  const listEl = h('ul', { class: 'event-list' });
  const listWrap = h('div', { class: 'pulse-list scroll-y' }, listEl);

  /* ---- map ---- */
  const mapCanvas = h('div', { class: 'map-canvas', role: 'application', 'aria-label': 'Map of current events' });
  const cardEl = h('div', { class: 'event-card', hidden: true });
  const mapWrap = h('div', { class: 'pulse-map', hidden: true }, mapCanvas, cardEl,
    h('div', { class: 'map-legend' }, h('strong', null, 'Open events'), h('small', null, 'NASA EONET · positions as reported')));

  root.append(h('div', { class: 'pulse-body' }, listWrap, mapWrap));

  const visibleEvents = () => {
    const query = st.query.trim().toLowerCase();
    return st.events.filter((event) => (st.category === 'all' || event.categoryId === st.category) && (!query || `${event.title} ${event.category}`.toLowerCase().includes(query)));
  };

  function renderStatus() {
    const { loading, stale, error, fetchedAt } = st.status;
    if (loading && !st.events.length) statusEl.textContent = 'Loading events from NASA…';
    else if (error && !st.events.length) statusEl.textContent = 'Could not load events. Check your connection, then refresh.';
    else if (stale) statusEl.textContent = `Offline. Showing events saved ${fetchedAt ? `on ${formatDateLong(fetchedAt.slice(0, 10))}` : 'earlier'}.`;
    else if (fetchedAt) statusEl.textContent = `Live from NASA EONET · updated ${timeLabel(fetchedAt)} · ${st.events.length} open events`;
    else statusEl.textContent = '';
    refreshButton.disabled = st.status.loading;
    refreshButton.classList.toggle('spinning', st.status.loading);
  }

  function renderChips() {
    const counts = new Map();
    for (const event of st.events) counts.set(event.categoryId, (counts.get(event.categoryId) || 0) + 1);
    const ids = [...counts.keys()].sort((a, b) => counts.get(b) - counts.get(a));
    const chip = (id, label, n, color) => h('button', {
      type: 'button', class: `chip${st.category === id ? ' active' : ''}`, 'aria-pressed': String(st.category === id),
      onClick: () => { platform.haptic(); st.category = id; renderAll({ fit: true }); }
    }, color ? h('span', { class: 'event-dot', style: { background: color } }) : null, `${label} · ${n}`);
    mount(chipsEl, chip('all', 'All', st.events.length), ids.map((id) => chip(id, EVENT_CATEGORIES[id]?.label || 'Other', counts.get(id), EVENT_CATEGORIES[id]?.color)));
  }

  function renderList() {
    const events = visibleEvents();
    if (!events.length) {
      mount(listEl, h('li', { class: 'empty-note muted' }, st.events.length ? 'No events match your filters.' : st.status.loading ? 'Loading…' : 'No events to show yet.'));
      return;
    }
    mount(listEl, ...events.map((event) => h('li', null, h('button', {
      type: 'button',
      class: `event-row${event.id === st.selectedId ? ' selected' : ''}`,
      onClick: () => { platform.haptic(); select(event.id, { details: true }); }
    }, h('span', { class: 'event-dot', style: { background: event.color } }),
    h('span', { class: 'event-text' }, h('strong', null, event.title), h('small', null, `${event.category} · ${relativeDays(event.date)}`)),
    ic('chevronRight', { size: 16 })))));
  }

  /* ---- details ---- */
  function openDetails(event) {
    const sources = event.sources.slice(0, 4);
    ui.sheet({
      title: event.title,
      body: h('div', { class: 'event-detail' },
        h('div', { class: 'button-row' }, h('span', { class: 'pill', style: { borderColor: event.color } }, event.category)),
        h('p', { class: 'muted small' }, `First recorded ${formatDateLong(event.firstDate)} · latest ${formatDateLong(event.date)}${event.closed ? ` · closed ${formatDateLong(event.closed)}` : ''}`),
        event.description ? h('p', { class: 'small' }, event.description) : null,
        sources.length ? h('div', { class: 'link-list' }, sources.map((s) => ui.link(s.url, ic('external', { size: 14 }), s.id || 'Source'))) : null,
        h('p', { class: 'muted tiny' }, 'EONET is a curated feed and can be incomplete or delayed. Open the source links to confirm.')),
      actions: [
        { label: 'Worldview', kind: 'ghost', keepOpen: true, onClick: () => platform.openExternal(worldviewUrl(event.lat, event.lng, event.date)) },
        { label: 'Investigate this event', kind: 'primary', onClick: () => { actions.investigateEvent(event); return true; } }
      ]
    });
  }

  function renderCard() {
    const event = st.events.find((e) => e.id === st.selectedId);
    cardEl.hidden = !event || st.mode !== 'map';
    if (!event) return;
    mount(cardEl,
      h('div', { class: 'card-head' },
        h('span', { class: 'pill', style: { borderColor: event.color } }, event.category),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Close', onClick: () => select(null) }, ic('close', { size: 18 }))),
      h('h2', null, event.title),
      h('p', { class: 'muted small' }, `Latest ${formatDateLong(event.date)} · ${relativeDays(event.date)}`),
      h('div', { class: 'button-row' },
        h('button', { type: 'button', class: 'btn btn-primary', onClick: () => actions.investigateEvent(event) }, ic('explore', { size: 16 }), 'Investigate'),
        h('button', { type: 'button', class: 'btn', onClick: () => openDetails(event) }, 'Details')));
  }

  function renderAll({ fit = false } = {}) {
    renderStatus();
    renderChips();
    renderList();
    renderCard();
    if (!map) return;
    const events = visibleEvents();
    map.showEvents(events);
    if (st.selectedId) map.highlightEvent(st.selectedId, { fly: false });
    if (fit && !st.selectedId) map.fitEvents(events);
  }

  function select(id, { details = false, fly = true } = {}) {
    st.selectedId = id;
    renderList();
    renderCard();
    if (id && map && st.mode === 'map') map.highlightEvent(id, { fly });
    else if (map && !id) map.showEvents(visibleEvents());
    if (id && details) openDetails(st.events.find((e) => e.id === id));
  }

  function setMode(mode) {
    st.mode = mode;
    for (const [id, button] of modeButtons) {
      button.classList.toggle('active', id === mode);
      button.setAttribute('aria-selected', String(id === mode));
    }
    listWrap.hidden = mode !== 'list';
    mapWrap.hidden = mode !== 'map';
    if (mode === 'map') {
      ensureMap();
      requestAnimationFrame(() => {
        map.invalidateSize();
        renderAll({ fit: !st.selectedId });
      });
    }
    renderCard();
  }

  function setResult(result) {
    st.events = result.items;
    st.status = { loading: false, stale: Boolean(result.stale), error: result.error || null, fetchedAt: result.fetchedAt };
  }

  async function refresh({ force = false } = {}) {
    st.status = { ...st.status, loading: true };
    renderStatus();
    try {
      setResult(await feed.load({ force }));
    } catch (error) {
      st.status = { ...st.status, loading: false, error };
    }
    if (st.selectedId && !st.events.some((e) => e.id === st.selectedId)) st.selectedId = null;
    renderAll({ fit: !st.fitted });
    st.fitted = st.events.length > 0;
    if (force && st.status.error && st.events.length) ui.toast('You appear to be offline. Showing saved events.', { error: true });
  }

  function ensureMap() {
    if (map) return;
    map = new EchoMap(mapCanvas, { compact: true, imagery: store.settings().imagery });
    map.on('eventclick', ({ id }) => select(id, { fly: false }));
    map.setLayer('labels', store.settings().showLabels);
    new ResizeObserver(() => map.invalidateSize()).observe(mapCanvas);
  }

  setMode('list');

  return {
    el: root,
    name: 'pulse',
    show() {
      st.visible = true;
      const cached = feed.cached();
      if (!st.events.length && cached.items.length) {
        setResult({ items: cached.items, fetchedAt: cached.fetchedAt, stale: true });
        renderAll({ fit: true });
      } else {
        renderAll();
      }
      if (map) requestAnimationFrame(() => map.invalidateSize());
      refresh();
    },
    hide() { st.visible = false; },
    debugMap: () => map, // for tests and dev tools
    /** The Android back button. Returns true when this screen used the press. */
    back() {
      if (st.selectedId && st.mode === 'map') { select(null); return true; }
      return false;
    }
  };
}
