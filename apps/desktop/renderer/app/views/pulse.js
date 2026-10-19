// Planet Pulse: what NASA's event tracker says is happening on Earth right now, and a way to
// turn any event into an investigation.

import { h, ic, mount } from '../../shared/ui/dom.js';
import { EchoMap } from '../../shared/map/echo-map.js';
import {
  EVENT_CATEGORIES, formatDateLong, relativeDays, worldviewUrl
} from '../../shared/core/src/index.js';

function timeLabel(iso) {
  try { return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); } catch { return ''; }
}

export function createPulseView(app) {
  const { store, feed, ui, platform, actions } = app;
  const st = { events: [], category: 'all', query: '', selectedId: null, status: { loading: false, stale: false, error: null, fetchedAt: null }, visible: false, fitted: false };
  let map = null;
  let pendingSelect = null;

  const root = h('section', { class: 'view pulse', 'aria-label': 'Planet Pulse', hidden: true });

  const statusEl = h('p', { class: 'muted small', role: 'status' });
  const refreshButton = h('button', { type: 'button', class: 'btn btn-ghost btn-icon', title: 'Refresh events', 'aria-label': 'Refresh events', onClick: () => refresh({ force: true }) }, ic('refresh'));
  const search = h('input', { class: 'input', type: 'search', placeholder: 'Search events', 'aria-label': 'Search events', onInput: () => { st.query = search.value; renderAll({ fit: true }); } });
  const chipsEl = h('div', { class: 'chips', role: 'group', 'aria-label': 'Filter by category' });
  const listEl = h('ul', { class: 'event-list' });
  const mapCanvas = h('div', { class: 'map-canvas', role: 'application', 'aria-label': 'Map of current events' });
  const cardEl = h('div', { class: 'event-card', hidden: true });
  const readout = h('span', { class: 'mono' }, '—');

  root.append(
    h('aside', { class: 'ex-side pulse-side' },
      h('div', { class: 'panel-head' }, h('div', null, h('h1', null, 'Planet Pulse'), statusEl), refreshButton),
      h('div', { class: 'pulse-filters' }, search, chipsEl),
      h('div', { class: 'ex-scroll' }, listEl)),
    h('div', { class: 'ex-main' },
      h('div', { class: 'map-stage' }, mapCanvas, cardEl,
        h('div', { class: 'map-legend' }, h('strong', null, 'Open events'), h('small', null, 'Source: NASA EONET · positions as reported'), h('div', { class: 'readout' }, ic('crosshair', { size: 12 }), readout)))));

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
    refreshButton.disabled = loading;
    refreshButton.classList.toggle('spinning', loading);
  }

  function renderChips() {
    const counts = new Map();
    for (const event of st.events) counts.set(event.categoryId, (counts.get(event.categoryId) || 0) + 1);
    const ids = [...counts.keys()].sort((a, b) => counts.get(b) - counts.get(a));
    const chip = (id, label, n, color) => h('button', { type: 'button', class: `chip${st.category === id ? ' active' : ''}`, 'aria-pressed': String(st.category === id), onClick: () => { st.category = id; renderAll({ fit: true }); } },
      color ? h('span', { class: 'event-dot', style: { background: color } }) : null, `${label} · ${n}`);
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
      'aria-current': event.id === st.selectedId ? 'true' : null,
      onClick: () => select(event.id)
    }, h('span', { class: 'event-dot', style: { background: event.color } }),
    h('span', { class: 'event-text' }, h('strong', null, event.title), h('small', null, `${event.category} · ${relativeDays(event.date)}`))))));
  }

  function renderCard() {
    const event = st.events.find((e) => e.id === st.selectedId);
    cardEl.hidden = !event;
    if (!event) return;
    const sources = event.sources.slice(0, 3);
    mount(cardEl,
      h('div', { class: 'card-head' },
        h('span', { class: 'pill', style: { borderColor: event.color } }, event.category),
        h('button', { type: 'button', class: 'btn btn-ghost btn-icon', 'aria-label': 'Close details', onClick: () => select(null) }, ic('close', { size: 16 }))),
      h('h2', null, event.title),
      h('p', { class: 'muted small' }, `First recorded ${formatDateLong(event.firstDate)} · latest ${formatDateLong(event.date)}${event.closed ? ` · closed ${formatDateLong(event.closed)}` : ''}`),
      event.description ? h('p', { class: 'small' }, event.description) : null,
      sources.length ? h('div', { class: 'card-links' }, sources.map((s) => ui.link(s.url, ic('external', { size: 13 }), s.id || 'Source'))) : null,
      h('div', { class: 'button-row' },
        h('button', { type: 'button', class: 'btn btn-primary', onClick: () => actions.investigateEvent(event) }, ic('explore', { size: 16 }), 'Investigate this event'),
        h('button', { type: 'button', class: 'btn', onClick: () => platform.openExternal(worldviewUrl(event.lat, event.lng, event.date)) }, 'Worldview')),
      h('p', { class: 'muted tiny' }, 'EONET is a curated feed and can be incomplete or delayed. Open the source links to confirm.'));
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

  function select(id, { fly = true } = {}) {
    st.selectedId = id;
    renderList();
    renderCard();
    if (id && map) map.highlightEvent(id, { fly });
    else map?.showEvents(visibleEvents());
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
    if (pendingSelect) { const id = pendingSelect; pendingSelect = null; if (st.events.some((e) => e.id === id)) select(id); }
    if (force && st.status.error && st.events.length) ui.toast('You appear to be offline. Showing saved events.', { error: true });
  }

  function ensureMap() {
    if (map) return;
    map = new EchoMap(mapCanvas, { imagery: store.settings().imagery });
    map.on('coords', ({ lat, lng }) => { readout.textContent = `${lat.toFixed(3)}°, ${lng.toFixed(3)}°`; });
    map.on('eventclick', ({ id }) => select(id, { fly: false }));
    map.setLayer('labels', store.settings().showLabels);
    new ResizeObserver(() => map.invalidateSize()).observe(mapCanvas);
  }

  return {
    el: root,
    name: 'pulse',
    show({ eventId } = {}) {
      st.visible = true;
      ensureMap();
      map.invalidateSize();
      if (eventId) pendingSelect = eventId;
      const cached = feed.cached();
      if (!st.events.length && cached.items.length) {
        setResult({ items: cached.items, fetchedAt: cached.fetchedAt, stale: true });
        st.fitted = true;
        renderAll({ fit: true });
      } else {
        renderAll();
      }
      requestAnimationFrame(() => map.invalidateSize());
      refresh();
    },
    hide() { st.visible = false; }
  };
}
