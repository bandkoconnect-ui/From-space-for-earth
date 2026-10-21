// The floating discovery panel: search, new developments and places worth investigating.
// On phones the same panel is a bottom sheet (see sheet.js).

import { h, mount } from '../../../packages/ui/dom.js';
import { relativeDays } from '../../../packages/core/src/dates.js';
import { EVENT_CATEGORIES } from '../../../packages/core/src/eonet.js';
import { describeInvestigation } from '../../../packages/core/src/investigation.js';
import { pluralise } from '../../../packages/core/src/text.js';
import { terrainArt } from '../../../packages/ui/art.js';
import { createSearch } from './search.js';
import { eventSummary, findHotspots, isRecent, placeFromTitle } from './subjects.js';
import { categoryIcon, ic, revealIn } from './ui.js';
import { accountDialog } from './gate.js';

const FIRST_PAGE = 12;

function timeLabel(iso) {
  try { return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); } catch { return ''; }
}

export function createSidebar(app) {
  const { state } = app;
  const root = h('aside', { class: 'sidebar panel', id: 'sidebar', 'aria-label': 'Explore Earth' });

  const grab = h('button', { type: 'button', class: 'sheet-grab', 'aria-label': 'Resize the explore panel', onClick: () => app.cycleSheet?.('sidebar') }, h('span'));
  const collapse = h('button', { type: 'button', class: 'icon-button sb-collapse', 'aria-label': 'Hide panel', 'aria-controls': 'sidebar', 'aria-expanded': 'true', onClick: () => app.setSidebar(false) }, ic('sidebar', { size: 18 }));
  const search = createSearch(app, { onFocus: () => app.onSearchFocus() });
  const statusText = h('span', { class: 'status-text' });
  const statusDot = h('span', { class: 'status-dot', 'aria-hidden': 'true' });
  const refresh = h('button', { type: 'button', class: 'icon-button status-refresh', 'aria-label': 'Refresh events', onClick: () => app.refreshEvents({ force: true }) }, ic('refresh', { size: 15 }));
  const status = h('div', { class: 'sb-status', role: 'status' }, statusDot, statusText, refresh);

  const chips = h('div', { class: 'chips', role: 'group', 'aria-label': 'Filter developments by kind' });
  const areaChip = h('div', { class: 'area-chip-row' });
  const devList = h('ol', { class: 'dev-list', 'aria-label': 'New developments' });
  const more = h('button', { type: 'button', class: 'link-button more-button', onClick: () => { state.showAll = !state.showAll; render(); } });
  const devCount = h('span', { class: 'section-count' });

  const places = h('div', { class: 'places' });

  const body = h('div', { class: 'sb-body' },
    h('section', { class: 'sb-section', 'aria-labelledby': 'dev-title' },
      h('div', { class: 'section-head' }, h('h2', { id: 'dev-title' }, 'New developments'), devCount),
      chips, areaChip, devList, more),
    h('section', { class: 'sb-section', 'aria-labelledby': 'places-title' },
      h('div', { class: 'section-head' }, h('h2', { id: 'places-title' }, 'Places worth investigating'),
        h('button', { type: 'button', class: 'icon-button', 'aria-label': 'Investigate a place', title: 'Investigate a place', onClick: () => app.startPick() }, ic('plus', { size: 18 }))),
      places));

  const foot = h('footer', { class: 'sb-foot' },
    h('button', { type: 'button', class: 'link-button', onClick: () => app.dialogs.about() }, ic('info', { size: 15 }), 'About the data'),
    h('button', { type: 'button', class: 'link-button', onClick: () => app.dialogs.settings() }, ic('settings', { size: 15 }), 'Settings'));

  root.append(grab,
    h('header', { class: 'sb-head' },
      h('div', { class: 'brand' }, h('img', { src: 'assets/icons/favicon-32.png', alt: '', width: 22, height: 22 }), h('span', { class: 'brand-name' }, 'ECHO'), h('span', { class: 'brand-line' }, 'Earth intelligence')),
      h('div', { class: 'sb-head-actions' },
        app.user ? h('button', { type: 'button', class: 'avatar', id: 'account-button', 'aria-label': `Account: ${app.user.name || app.user.email}`, title: 'Account', onClick: () => accountDialog(app, app.user) }, app.userInitials) : null,
        collapse)),
    search.el, status, body, foot);

  /* ---------- status (is this information current?) ---------- */
  function renderStatus() {
    const { loading, stale, error, fetchedAt } = state.feed;
    const n = state.events.length;
    const recent = state.events.filter((e) => isRecent(e)).length;
    status.title = '';
    let text;
    let tone = 'live';
    if (loading && !n) { text = 'Loading events from NASA…'; tone = 'loading'; }
    else if (error && !n) { text = 'NASA’s event feed is unreachable. Showing case studies only.'; tone = 'error'; }
    else if (stale) { text = `Offline. Showing ${pluralise(n, 'event')} saved ${fetchedAt ? relativeDays(fetchedAt.slice(0, 10)) : 'earlier'}.`; tone = 'stale'; }
    else if (fetchedAt) { text = `Live from NASA EONET, checked ${timeLabel(fetchedAt)}`; status.title = `${pluralise(n, 'open event')}; ${recent} updated in the last two days (shown with a pulse).`; }
    else text = '';
    statusText.textContent = text;
    status.dataset.tone = tone;
    refresh.disabled = loading;
    refresh.classList.toggle('spinning', loading);
  }

  /* ---------- new developments ---------- */
  function filteredEvents() {
    let list = state.events;
    if (state.category !== 'all') list = list.filter((e) => e.categoryId === state.category);
    if (state.area) { const ids = new Set(state.area.ids); list = list.filter((e) => ids.has(e.id)); }
    return list;
  }

  function renderChips() {
    const counts = new Map();
    for (const e of state.events) counts.set(e.categoryId, (counts.get(e.categoryId) || 0) + 1);
    const ids = [...counts.keys()].sort((a, b) => counts.get(b) - counts.get(a));
    chips.hidden = ids.length < 2;
    const chip = (id, label, n) => h('button', {
      type: 'button', class: `chip${state.category === id ? ' is-on' : ''}`, 'aria-pressed': String(state.category === id),
      onClick: () => app.setCategory(state.category === id && id !== 'all' ? 'all' : id)
    }, id !== 'all' ? categoryIcon(id, { size: 13, stroke: 1.8 }) : null, h('span', null, label), h('span', { class: 'chip-n' }, String(n)));
    mount(chips, chip('all', 'All', state.events.length), ids.map((id) => chip(id, EVENT_CATEGORIES[id]?.label || 'Other', counts.get(id))));
  }

  function renderArea() {
    if (!state.area) { mount(areaChip); return; }
    mount(areaChip, h('div', { class: 'area-chip' },
      ic(state.area.kind === 'hotspot' ? 'target' : 'pin', { size: 14 }),
      h('span', null, state.area.ids.length ? `${pluralise(state.area.ids.length, 'development')} in ${state.area.label}` : `Nothing open in ${state.area.label}`),
      h('button', { type: 'button', class: 'icon-button', 'aria-label': `Stop filtering by ${state.area.label}`, onClick: () => app.clearArea({ keepCamera: true }) }, ic('close', { size: 14 }))));
  }

  function devItem(event) {
    const selected = state.selection?.kind === 'event' && state.selection.id === event.id;
    const place = placeFromTitle(event.title);
    return h('li', null, h('button', {
      type: 'button', class: `dev-item${selected ? ' is-selected' : ''}`, 'aria-current': selected ? 'true' : null, dataset: { id: event.id },
      onClick: () => app.select({ kind: 'event', id: event.id }, { source: 'list' }),
      onMouseenter: () => app.previewPin(event.id, true), onMouseleave: () => app.previewPin(event.id, false)
    },
    h('span', { class: `dev-mark${isRecent(event) ? ' is-recent' : ''}`, 'aria-hidden': 'true' }),
    h('span', { class: 'dev-text' },
      h('span', { class: 'dev-title' }, event.title),
      h('span', { class: 'dev-meta' }, h('span', { class: 'dev-cat' }, categoryIcon(event.categoryId, { size: 12, stroke: 1.9 }), event.category), place ? h('span', null, place) : null, h('time', { datetime: event.date }, relativeDays(event.date))),
      h('span', { class: 'dev-summary' }, eventSummary(event)))));
  }

  function renderDevelopments() {
    const list = filteredEvents();
    devCount.textContent = list.length ? String(list.length) : '';
    if (!list.length) {
      const message = state.feed.loading ? 'Loading the latest events…'
        : state.area ? `NASA EONET has no open events recorded in ${state.area.label}.`
        : state.category !== 'all' ? 'No open events of this kind right now.'
        : state.feed.error ? 'The event feed could not be reached. Check your connection, then refresh.'
        : 'No open events right now.';
      mount(devList, h('li', { class: 'empty-note' }, message));
      more.hidden = true;
      return;
    }
    const shown = state.showAll || state.area ? list : list.slice(0, FIRST_PAGE);
    mount(devList, ...shown.map(devItem));
    more.hidden = list.length <= FIRST_PAGE || Boolean(state.area);
    more.textContent = state.showAll ? 'Show fewer' : `Show all ${list.length}`;
  }

  /* ---------- places worth investigating ---------- */
  function placeItem({ key, title, detail, art, onClick, selected, tag }) {
    return h('li', null, h('button', { type: 'button', class: `place-item${selected ? ' is-selected' : ''}`, 'aria-current': selected ? 'true' : null, dataset: { key }, onClick },
      h('span', { class: 'place-art', 'aria-hidden': 'true' }, art),
      h('span', { class: 'place-text' }, h('span', { class: 'place-title' }, title), h('span', { class: 'place-detail' }, detail)),
      tag ? h('span', { class: 'tag' }, tag) : null));
  }

  function renderPlaces() {
    const groups = [];
    const spots = findHotspots(state.events).slice(0, 4);
    if (spots.length) {
      groups.push(h('div', { class: 'place-group' }, h('h3', null, 'Clusters of activity'),
        h('ul', null, spots.map((spot) => placeItem({
          key: spot.id,
          title: `${spot.count} ${spot.label.toLowerCase()}${spot.place ? ` in ${spot.place}` : ' close together'}`,
          detail: `Latest report ${relativeDays(spot.latest)}`,
          art: h('span', { class: 'spot-art' }, categoryIcon(spot.categoryId, { size: 18, stroke: 1.7 }), h('b', null, String(spot.count))),
          selected: state.area?.key === spot.id,
          onClick: () => app.showHotspot(spot)
        })))));
    }
    const invs = app.store.list();
    const cases = invs.filter((i) => i.kind === 'demo');
    const mine = invs.filter((i) => i.kind !== 'demo');
    const invItem = (inv) => placeItem({
      key: inv.id, title: inv.title.replace(/ \(workflow demo\)$/i, ''), detail: describeInvestigation(inv),
      art: terrainArt(inv.id, inv.topic, { width: 88, height: 88 }),
      selected: (state.selection?.kind === 'inv' && state.selection.id === inv.id) || (inv.event && state.selection?.kind === 'event' && state.selection.id === inv.event.id),
      tag: inv.id === 'demo-amazon' ? 'Demo' : inv.kind === 'demo' ? 'Case study' : null,
      onClick: () => app.openInvestigation(inv.id)
    });
    if (cases.length) groups.push(h('div', { class: 'place-group' }, h('h3', null, 'Case studies'), h('ul', null, cases.map(invItem))));
    groups.push(h('div', { class: 'place-group' }, h('h3', null, 'Yours'),
      mine.length ? h('ul', null, mine.map(invItem)) : null,
      h('button', { type: 'button', class: 'add-place', onClick: () => app.startPick() }, ic('plus', { size: 16 }), h('span', null, mine.length ? 'Investigate another place' : 'Investigate a place'), h('small', null, 'Pick a spot on the map and compare NASA imagery across dates'))));
    mount(places, ...groups);
  }

  function render() {
    renderStatus();
    renderChips();
    renderArea();
    renderDevelopments();
    renderPlaces();
    search.refresh();
  }

  return {
    el: root, grab, search, render,
    renderStatus,
    setCollapsed(collapsed) { collapse.setAttribute('aria-expanded', String(!collapsed)); },
    /** Scrolls the selected development or place into view inside the panel. */
    revealSelection() {
      const node = root.querySelector('.dev-item.is-selected, .place-item.is-selected');
      revealIn(body, node, { smooth: !app.reducedMotion });
    }
  };
}
