// ECHO on the web: the living-planet map. This file wires the pieces together and keeps the
// map, the sidebar, the Field Report and the address bar in step.

import { createStore, createEventFeed, createFromEvent, toMarkdownReport, exportFileName, formatDateLong, addDays, todayIso, haversineKm } from '../../../packages/core/src/index.js';
import { createActions } from '../../../packages/ui/actions.js';
import { h } from '../../../packages/ui/dom.js';
import { Atlas } from './atlas.js';
import { createSidebar } from './sidebar.js';
import { createReport } from './report.js';
import { createDialogs } from './dialogs.js';
import { createSheet } from './sheet.js';
import { createPlatform } from './platform.js';
import { createUi, ic } from './ui.js';
import { parseHash, formatHash } from './router.js';
import { DEFAULT_PROVIDERS, inBounds, nearbyRadiusKm, zoomForPlace } from './geocode.js';
import { eventReport, investigationReport } from './subjects.js';
import { gibsSnapshotUrl } from './sources.js';
import { CONFIG } from './config.js';
import { browserStorage, createAuth, initials } from './auth.js';
import { showGate } from './gate.js';
import { showOnboarding } from './onboarding.js';

const MOBILE = '(max-width: 719px)';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dayMonth = (iso) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]}`;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

async function boot() {
  const root = document.getElementById('app');

  /* ---------------- account: sign up or log in before the map ---------------- */
  const authStorage = browserStorage();
  let auth;
  try { auth = createAuth(CONFIG.auth, { storage: authStorage }); } catch (error) { console.error(error); auth = createAuth({}, { storage: authStorage }); }
  let user = await auth.current();
  let isNew = false;
  if (!user) {
    root.classList.add('is-gated');
    ({ user, isNew } = await showGate(root, auth, {
      initialMode: readPref('returning', false) ? 'login' : 'signup',
      note: auth.kind === 'device' ? 'Preview: your account is saved in this browser only.' : ''
    }));
    root.classList.remove('is-gated');
  }
  writePref('returning', true);

  const platform = createPlatform();
  const store = createStore(platform.storage);
  await store.load();
  const feed = createEventFeed({ store, limit: CONFIG.eventsLimit });
  const ui = createUi(root);

  const state = {
    layout: matchMedia(MOBILE).matches ? 'mobile' : 'desktop',
    events: [],
    feed: { loading: true, stale: false, error: null, fetchedAt: null },
    category: 'all',
    area: null,
    selection: null,
    showAll: false,
    sidebarOpen: true,
    imagery: { nasa: false, compare: false, index: 0 },
    layers: { fires: false, precip: false, night: readPref('night', true) },
    settings: store.settings()
  };

  const app = { state, store, feed, ui, platform, config: { geocoders: CONFIG.geocoders || DEFAULT_PROVIDERS }, reducedMotion };
  app.user = user;
  app.authKind = auth.kind;
  app.userInitials = initials(user.name, user.email);
  app.logOut = async () => { await auth.logOut(); location.reload(); };
  app.actions = createActions({ store, platform, ui, openInvestigation: (id) => app.openInvestigation(id) });
  app.dialogs = createDialogs(app);

  /* ---------------- DOM ---------------- */
  const mapEl = h('div', { class: 'map', id: 'map', role: 'application', 'aria-label': 'Map of Earth. Event pins are buttons; use Tab to reach them.' });
  const sidebar = createSidebar(app);
  const report = createReport(app);
  const reopen = h('button', { type: 'button', class: 'reopen panel', 'aria-label': 'Show the explore panel', 'aria-controls': 'sidebar', hidden: true, onClick: () => app.setSidebar(true) },
    h('img', { src: 'assets/icons/favicon-32.png', alt: '', width: 20, height: 20 }), ic('search', { size: 17 }), h('span', null, 'Search'));
  const imageryBadge = h('div', { class: 'imagery-badge panel', role: 'status', hidden: true });
  const layersPop = h('div', { class: 'layers-pop panel', id: 'layers-pop', role: 'dialog', 'aria-label': 'Map layers', hidden: true });
  const layersBtn = h('button', { type: 'button', class: 'ctrl', 'aria-label': 'Map layers', 'aria-expanded': 'false', 'aria-controls': 'layers-pop', onClick: () => toggleLayers() }, ic('layers', { size: 19 }));
  const controls = h('div', { class: 'controls', role: 'toolbar', 'aria-label': 'Map controls' },
    h('div', { class: 'ctrl-group panel' },
      h('button', { type: 'button', class: 'ctrl', 'aria-label': 'Zoom in', onClick: () => atlas.zoomIn() }, ic('plus', { size: 19 })),
      h('button', { type: 'button', class: 'ctrl', 'aria-label': 'Zoom out', onClick: () => atlas.zoomOut() }, ic('minus', { size: 19 }))),
    h('div', { class: 'ctrl-group panel' },
      h('button', { type: 'button', class: 'ctrl', 'aria-label': 'Show the whole world', title: 'Whole world', onClick: () => atlas.goWorld() }, ic('globe', { size: 19 })),
      h('button', { type: 'button', class: 'ctrl', 'aria-label': 'Go to my location', title: 'My location', onClick: () => locateMe() }, ic('locate', { size: 19 })),
      layersBtn));
  const compareUi = h('div', { class: 'compare', hidden: true });
  const pickUi = h('div', { class: 'pick', hidden: true });
  root.append(mapEl, sidebar.el, reopen, report.el, controls, layersPop, imageryBadge, compareUi, pickUi);

  /* ---------------- map ---------------- */
  const atlas = new Atlas(mapEl, { imagery: state.settings.imagery, insets: () => insets(), coarse: matchMedia('(pointer: coarse)').matches });
  app.atlas = atlas;
  atlas.setLabels(state.settings.showLabels);
  atlas.setNight(state.layers.night);
  atlas.setInvestigations(store.list());

  /* ---------------- phone sheets ---------------- */
  const safe = () => {
    const cs = getComputedStyle(root);
    return { top: parseFloat(cs.getPropertyValue('--sat')) || 0, bottom: parseFloat(cs.getPropertyValue('--sab')) || 0, kb: parseFloat(cs.getPropertyValue('--kb')) || 0 };
  };
  const viewH = () => root.clientHeight;
  const sidebarSheet = createSheet(sidebar.el, {
    handle: '.sheet-grab, .sb-head, .sb-status',
    snaps: () => {
      const s = safe();
      const H = viewH() - s.kb;
      const search = sidebar.search.el;
      const peek = search.offsetTop + search.offsetHeight + 12 + s.bottom;
      return { peek: Math.min(peek, H * 0.4), half: Math.max(peek + 80, Math.round(H * 0.5)), full: H - s.top - 8 };
    },
    onChange: () => updateInsets()
  });
  const reportSheet = createSheet(report.el, {
    handle: '.sheet-grab, .report-head',
    initial: 'half',
    snaps: () => {
      const s = safe();
      const H = viewH() - s.kb;
      const head = report.head;
      const peek = Math.min(head.offsetTop + head.offsetHeight + 8 + s.bottom, H * 0.45);
      return { peek, half: Math.max(peek + 60, Math.round(H * 0.56)), full: H - s.top - 8 };
    },
    onChange: () => updateInsets()
  });
  app.expandReport = () => { if (state.layout === 'mobile') reportSheet.set('full'); };
  app.cycleSheet = (which) => (which === 'report' ? reportSheet : sidebarSheet).cycle();

  /* ---------------- layout and insets ---------------- */
  function insets() {
    const W = root.clientWidth;
    if (state.layout === 'mobile') {
      const s = safe();
      // The sheet's resting height (not its height mid-animation), so the camera frames the final view.
      const el = state.selection ? report.el : sidebar.el;
      const ctl = state.selection ? reportSheet : sidebarSheet;
      const visible = el.hidden ? 0 : ctl.enabled ? ctl.height() : el.getBoundingClientRect().height;
      return { top: s.top + 8, right: 0, bottom: visible + s.kb, left: 0 };
    }
    const left = state.sidebarOpen && !sidebar.el.hidden ? sidebar.el.getBoundingClientRect().right : 0;
    const right = state.selection && !report.el.hidden ? W - report.el.getBoundingClientRect().left : 0;
    return { top: 0, right, bottom: 0, left };
  }

  function updateInsets() {
    const ins = insets();
    root.style.setProperty('--inset-left', `${Math.round(ins.left)}px`);
    root.style.setProperty('--inset-right', `${Math.round(ins.right)}px`);
    root.style.setProperty('--inset-bottom', `${Math.round(ins.bottom)}px`);
    root.classList.toggle('sheet-tall', state.layout === 'mobile' && ins.bottom > viewH() * 0.62);
    if (!compareUi.hidden) positionCompare();
    if (!pickUi.hidden) positionPick();
  }

  function applyLayout() {
    state.layout = matchMedia(MOBILE).matches ? 'mobile' : 'desktop';
    root.dataset.layout = state.layout;
    const mobile = state.layout === 'mobile';
    sidebarSheet.enable(mobile);
    reportSheet.enable(mobile && Boolean(state.selection));
    if (mobile) { sidebar.el.hidden = Boolean(state.selection); reopen.hidden = true; }
    else { sidebar.el.hidden = !state.sidebarOpen; reopen.hidden = state.sidebarOpen; }
    requestAnimationFrame(() => { atlas.invalidateSize(); updateInsets(); });
  }
  matchMedia(MOBILE).addEventListener('change', applyLayout);
  // Panels change size as content loads or the window changes: keep the map's clear area current.
  new ResizeObserver(() => updateInsets()).observe(sidebar.el);
  new ResizeObserver(() => updateInsets()).observe(report.el);
  addEventListener('resize', () => { sidebarSheet.refresh(); reportSheet.refresh(); updateInsets(); });

  // The on-screen keyboard: keep the sheet (and search suggestions) above it.
  if (window.visualViewport) {
    const vv = window.visualViewport;
    const onViewport = () => {
      const kb = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
      root.style.setProperty('--kb', `${kb}px`);
      root.classList.toggle('keyboard', kb > 80);
      sidebarSheet.refresh();
      reportSheet.refresh();
      updateInsets();
    };
    vv.addEventListener('resize', onViewport);
    vv.addEventListener('scroll', onViewport);
  }

  /* ---------------- selection ---------------- */
  let opener = null;
  let autoCollapsed = false;
  let keyboardUser = false;
  addEventListener('keydown', () => { keyboardUser = true; }, true);
  addEventListener('pointerdown', () => { keyboardUser = false; }, true);

  const findEvent = (id) => state.events.find((e) => e.id === id) || null;
  app.savedFor = (eventId) => store.list().find((inv) => inv.event?.id === eventId) || null;

  function modelFor(selection) {
    if (!selection) return null;
    if (selection.kind === 'event') {
      const event = findEvent(selection.id);
      return event ? { model: eventReport(event), event } : null;
    }
    const inv = store.get(selection.id);
    return inv ? { model: investigationReport(inv, { notes: store.notes(inv.id) }), inv } : null;
  }

  app.select = (selection, { source = 'app', fly = true } = {}) => {
    const found = modelFor(selection);
    if (!found) {
      if (selection.kind === 'event') {
        const saved = app.savedFor(selection.id);
        if (saved) { app.select({ kind: 'inv', id: saved.id }, { source, fly }); return; }
        ui.toast(state.feed.loading ? 'Still loading events. Try again in a moment.' : 'That event is no longer in NASA’s list of open events.', { error: !state.feed.loading });
      } else ui.toast('That investigation is not saved in this browser.', { error: true });
      return;
    }
    const sameSubject = state.selection && state.selection.kind === selection.kind && state.selection.id === selection.id;
    if (!sameSubject && document.activeElement && document.activeElement !== document.body && !report.el.contains(document.activeElement)) opener = document.activeElement;
    state.selection = { kind: selection.kind, id: selection.id };
    const { model, event } = found;
    if (!sameSubject) {
      state.imagery = { nasa: false, compare: false, index: model.investigation.defaultIndex };
      hideCompare();
    }
    mapEl.closest('.app').classList.add('is-reporting');
    report.show(model);
    atlas.select(state.selection);
    const notes = savedNotes();
    atlas.showInvestigation(model.investigation, { notes, dateIndex: state.imagery.index, isEvent: Boolean(event) });
    if (event) atlas.showTrack(event);
    else atlas.clearTrack();
    atlas.setNasa(state.imagery.nasa);
    refreshDataLayers();

    if (state.layout === 'mobile') {
      sidebar.el.hidden = true;
      reportSheet.enable(true);
      if (!sameSubject) reportSheet.set(source === 'map' ? 'peek' : 'half', { animate: false });
    } else if (state.sidebarOpen && root.clientWidth < 1100 && !sameSubject) {
      autoCollapsed = true;
      app.setSidebar(false, { auto: true });
    }
    updateInsets();
    if (fly) requestAnimationFrame(() => app.focusSubject());
    writeHash();
    sidebar.render();
    sidebar.revealSelection();
    updateImageryBadge();
    if (keyboardUser && source !== 'link') report.focusTitle();
  };

  function savedNotes() {
    const sel = state.selection;
    if (!sel) return [];
    const inv = sel.kind === 'inv' ? store.get(sel.id) : app.savedFor(sel.id);
    return inv ? store.notes(inv.id) : [];
  }

  app.focusSubject = () => {
    const sel = state.selection;
    if (!sel) return;
    const zoom = atlas.getZoom();
    if (sel.kind === 'event') {
      const event = findEvent(sel.id);
      if (!event) return;
      const bounds = atlas.trackBounds(event);
      if (bounds) atlas.fitBounds(bounds, { maxZoom: 8 });
      else atlas.flyTo([event.lat, event.lng], Math.min(11, Math.max(zoom, 6)));
    } else {
      const inv = store.get(sel.id);
      if (inv) atlas.flyTo(inv.center, inv.zoom);
    }
  };

  app.closeReport = () => {
    if (!state.selection) return;
    const hadFocus = report.el.contains(document.activeElement);
    state.selection = null;
    report.hide();
    root.classList.remove('is-reporting');
    atlas.select(null);
    atlas.clearInvestigation();
    hideCompare();
    stopNoteMode();
    state.imagery = { nasa: false, compare: false, index: 0 };
    refreshDataLayers();
    if (state.layout === 'mobile') {
      reportSheet.enable(false);
      sidebar.el.hidden = false;
      sidebarSheet.refresh();
    } else if (autoCollapsed) {
      autoCollapsed = false;
      app.setSidebar(true, { auto: true });
    }
    updateInsets();
    writeHash();
    sidebar.render();
    updateImageryBadge();
    if (hadFocus) {
      if (opener && opener.isConnected && !opener.matches('input, textarea')) opener.focus({ preventScroll: true });
      else mapEl.focus({ preventScroll: true });
    }
    opener = null;
  };

  app.openInvestigation = (id, { asInvestigation = false } = {}) => {
    const inv = store.get(id);
    if (!inv) return;
    if (inv.kind === 'event' && !asInvestigation && findEvent(inv.event.id)) app.select({ kind: 'event', id: inv.event.id }, { source: 'list' });
    else app.select({ kind: 'inv', id }, { source: 'list' });
  };

  app.saveEvent = (id) => {
    const event = findEvent(id);
    if (!event) return;
    if (app.savedFor(id)) { ui.toast('Already saved.'); return; }
    try {
      store.add(createFromEvent(event), { activate: false });
      ui.toast('Saved to Yours. Notes you add stay with it on this device.');
    } catch (error) {
      ui.toast(error.message, { error: true });
    }
  };

  app.renameInvestigation = async (id) => {
    const inv = store.get(id);
    if (!inv) return;
    const title = await ui.prompt({ title: 'Rename investigation', label: 'Name', value: inv.title });
    if (title && title !== inv.title) { try { store.update(id, { title }); ui.toast('Renamed.'); } catch (e) { ui.toast(e.message, { error: true }); } }
  };

  app.deleteInvestigation = async (id) => {
    const inv = store.get(id);
    if (!inv) return;
    const n = store.notes(id).length;
    if (!(await ui.confirm({ title: `Delete “${inv.title}”?`, message: `${n ? `Its ${n === 1 ? 'note' : `${n} notes`} will be deleted too. ` : ''}This cannot be undone.`, confirmLabel: 'Delete', danger: true }))) return;
    if (state.selection?.kind === 'inv' && state.selection.id === id) app.closeReport();
    store.remove(id);
    ui.toast('Investigation deleted.');
  };

  /* ---------------- imagery, compare, layers ---------------- */
  app.currentImageryDate = () => report.model?.investigation.timeline[state.imagery.index]?.date || todayIso();

  app.chooseWindowItem = (item) => {
    if (Number.isFinite(item.lat)) atlas.flyTo([item.lat, item.lng], Math.max(atlas.getZoom(), 7));
    if (item.timelineIndex !== null && item.timelineIndex !== undefined) {
      state.imagery.index = item.timelineIndex;
      atlas.setImageryDate(item.timelineIndex);
      refreshDataLayers();
      if (!state.imagery.nasa && !state.imagery.compare) ui.toast(`Turn on NASA imagery to see ${formatDateLong(item.date)} on the map.`, { action: { label: 'Turn on', onClick: () => app.setNasa(true) } });
    }
    report.refresh();
    updateImageryBadge();
    if (!compareUi.hidden) renderCompareLabels();
  };

  app.setNasa = (on) => {
    state.imagery.nasa = on;
    atlas.setNasa(on);
    report.refresh();
    updateImageryBadge();
  };

  app.setCompare = (on) => {
    if (!state.selection) return;
    state.imagery.compare = on;
    atlas.setCompare(on);
    if (on) showCompare(); else hideCompare();
    report.refresh();
    updateImageryBadge();
  };

  app.setDataLayer = (name, on) => {
    state.layers[name] = on;
    atlas.setDataLayer(name, on);
    renderLayers();
    report.refresh();
    updateImageryBadge();
  };

  function refreshDataLayers() {
    for (const name of ['fires', 'precip']) if (state.layers[name]) atlas.setDataLayer(name, true);
  }

  app.setNight = (on) => {
    state.layers.night = on;
    writePref('night', on);
    atlas.setNight(on);
    renderLayers();
  };

  function updateImageryBadge() {
    const parts = [];
    const date = app.currentImageryDate();
    if (state.selection && (state.imagery.nasa || state.imagery.compare)) parts.push(state.imagery.compare ? `NASA imagery: ${formatDateLong(report.model.investigation.timeline[0].date)} | ${formatDateLong(date)}` : `NASA imagery: ${formatDateLong(date)}`);
    if (state.layers.fires) parts.push(`Thermal anomalies: ${formatDateLong(state.selection ? date : todayIso())}`);
    if (state.layers.precip) parts.push(`Rainfall estimate: ${formatDateLong(state.selection ? date : todayIso())}`);
    imageryBadge.hidden = !parts.length;
    imageryBadge.replaceChildren(...parts.map((p) => h('span', null, p)), parts.length ? h('small', null, 'Daily satellite composites, not live') : '');
  }

  /* compare handle */
  let split = 50;
  function showCompare() {
    if (state.layout === 'mobile') reportSheet.set('peek'); // the comparison needs the map
    const ins = insets();
    const W = root.clientWidth;
    split = Math.round(((ins.left + (W - ins.left - ins.right) / 2) / W) * 100);
    atlas.setSplit(split);
    compareUi.hidden = false;
    renderCompareLabels();
    positionCompare();
  }
  function hideCompare() {
    compareUi.hidden = true;
    if (state.imagery.compare) { state.imagery.compare = false; atlas.setCompare(false); }
  }
  const handle = h('div', { class: 'compare-handle', role: 'slider', tabindex: '0', 'aria-label': 'Before and after divider', 'aria-valuemin': '0', 'aria-valuemax': '100' }, ic('compare', { size: 18 }));
  const beforeLabel = h('span', { class: 'compare-label compare-before' });
  const afterLabel = h('span', { class: 'compare-label compare-after' });
  const compareClose = h('button', { type: 'button', class: 'compare-close panel', onClick: () => app.setCompare(false) }, ic('close', { size: 15 }), 'Close comparison');
  compareUi.append(h('div', { class: 'compare-line' }), handle, beforeLabel, afterLabel, compareClose);
  function renderCompareLabels() {
    const tl = report.model?.investigation.timeline || [];
    // Short labels by the handle; the badge at the top gives both full dates.
    beforeLabel.textContent = tl[0] ? dayMonth(tl[0].date) : 'Before';
    afterLabel.textContent = tl[state.imagery.index] ? dayMonth(tl[state.imagery.index].date) : 'After';
    handle.setAttribute('aria-label', `Divider between ${tl[0] ? formatDateLong(tl[0].date) : 'before'} on the left and ${tl[state.imagery.index] ? formatDateLong(tl[state.imagery.index].date) : 'after'} on the right`);
  }
  function positionCompare() {
    const W = root.clientWidth;
    const x = (split / 100) * W;
    compareUi.style.setProperty('--x', `${x}px`);
    handle.setAttribute('aria-valuenow', String(Math.round(split)));
    handle.setAttribute('aria-valuetext', `${Math.round(split)} percent before`);
  }
  function setSplitFromX(x) {
    split = Math.max(2, Math.min(98, (x / root.clientWidth) * 100));
    atlas.setSplit(split);
    positionCompare();
  }
  handle.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    handle.setPointerCapture(e.pointerId);
    const move = (ev) => setSplitFromX(ev.clientX - root.getBoundingClientRect().left);
    const up = () => { handle.removeEventListener('pointermove', move); handle.removeEventListener('pointerup', up); handle.removeEventListener('pointercancel', up); };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
    handle.addEventListener('pointercancel', up);
  });
  handle.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? 10 : 2;
    if (e.key === 'ArrowLeft') { e.preventDefault(); setSplitFromX(((split - step) / 100) * root.clientWidth); }
    if (e.key === 'ArrowRight') { e.preventDefault(); setSplitFromX(((split + step) / 100) * root.clientWidth); }
  });

  /* layers popover */
  function renderLayers() {
    const row = (label, detail, checked, onChange) => h('label', { class: 'switch-row layer-row' }, h('input', { type: 'checkbox', checked, onChange: (e) => onChange(e.target.checked) }), h('span', { class: 'switch' }), h('span', { class: 'layer-text' }, h('span', null, label), h('small', null, detail)));
    layersPop.replaceChildren(
      h('h2', { class: 'pop-title' }, 'Map layers'),
      row('Place names', 'Countries, cities and borders', state.settings.showLabels, (on) => { store.setSettings({ showLabels: on }); }),
      row('Day and night', 'Where the Sun is down now', state.layers.night, (on) => app.setNight(on)),
      row('Thermal anomalies', 'NASA MODIS fire detections, daily', state.layers.fires, (on) => app.setDataLayer('fires', on)),
      row('Rainfall estimate', 'NASA IMERG rain rate, daily', state.layers.precip, (on) => app.setDataLayer('precip', on)),
      h('p', { class: 'pop-note' }, state.selection ? 'Satellite layers show the date chosen in the Field Report.' : 'Satellite layers show today. Open a report to choose a date.'));
  }
  function toggleLayers(open = layersPop.hidden) {
    if (open) renderLayers();
    layersPop.hidden = !open;
    layersBtn.setAttribute('aria-expanded', String(open));
    if (open) layersPop.querySelector('input')?.focus({ preventScroll: true });
  }
  document.addEventListener('pointerdown', (e) => { if (!layersPop.hidden && !layersPop.contains(e.target) && !layersBtn.contains(e.target)) toggleLayers(false); });

  /* ---------------- sidebar ---------------- */
  app.setSidebar = (open, { auto = false } = {}) => {
    if (state.layout === 'mobile') return;
    if (!auto) autoCollapsed = false;
    state.sidebarOpen = open;
    sidebar.el.hidden = !open;
    reopen.hidden = open;
    sidebar.setCollapsed(!open);
    updateInsets();
    if (!auto) { if (open) sidebar.search.focus({ quiet: true }); else reopen.focus({ preventScroll: true }); }
  };

  app.onSearchFocus = () => { if (state.layout === 'mobile') sidebarSheet.set('full'); };

  app.setCategory = (id) => {
    state.category = id;
    state.showAll = false;
    atlas.setVisible(id === 'all' ? null : state.events.filter((e) => e.categoryId === id).map((e) => e.id));
    sidebar.render();
  };

  app.previewPin = (id, on) => atlas.pinElement(id)?.classList.toggle('is-preview', on);

  /* ---------------- search and areas ---------------- */
  let placePopup = null;
  app.goToPlace = (place) => {
    app.clearArea({ keepCamera: true });
    atlas.showPlace(place);
    const radius = nearbyRadiusKm(place.type) || (place.type === 'country' ? 450 : place.type === 'region' ? 200 : 60);
    const ids = state.events.filter((e) => (place.bounds && (place.type === 'country' || place.type === 'region') ? inBounds(place.bounds, e.lat, e.lng) : haversineKm([place.lat, place.lng], [e.lat, e.lng]) <= radius)).map((e) => e.id);
    const label = place.label;
    if (ids.length === 1) {
      state.area = { key: place.id, label, ids, kind: 'search' };
      atlas.setHighlight(ids);
      if (state.layout === 'mobile') sidebarSheet.set('peek', { animate: false });
      app.select({ kind: 'event', id: ids[0] }, { source: 'search' });
      return;
    }
    if (state.selection) app.closeReport();
    state.area = { key: place.id, label, ids, kind: 'search' };
    atlas.setHighlight(ids);
    sidebar.render();
    if (state.layout === 'mobile') sidebarSheet.set(ids.length ? 'half' : 'peek');
    if (place.bounds) atlas.fitBounds(place.bounds, { maxZoom: zoomForPlace(place.type) });
    else atlas.flyTo([place.lat, place.lng], zoomForPlace(place.type));
    if (!ids.length) {
      const card = h('div', { class: 'place-card' },
        h('strong', null, place.label), place.detail ? h('span', null, place.detail) : null,
        h('p', null, 'NASA EONET has no open events recorded here.'),
        h('button', { type: 'button', class: 'btn btn-small btn-primary', onClick: () => { atlas.map.closePopup(); app.dialogs.newInvestigation({ lat: place.lat, lng: place.lng, name: place.label }); } }, 'Investigate this place'));
      setTimeout(() => {
        placePopup = window.L.popup({ className: 'echo-card', closeButton: true, autoPan: false, offset: [0, -6] }).setLatLng([place.lat, atlas.map.getCenter().lng + (((place.lng - atlas.map.getCenter().lng + 540) % 360) - 180)]).setContent(card).openOn(atlas.map);
      }, reducedMotion ? 0 : 900);
    }
  };

  app.showHotspot = (spot) => {
    if (state.selection) app.closeReport();
    app.clearArea({ keepCamera: true });
    state.area = { key: spot.id, label: spot.place || 'this area', ids: spot.ids, kind: 'hotspot' };
    atlas.setHighlight(spot.ids);
    sidebar.render();
    atlas.fitBounds(spot.bounds, { maxZoom: 7 });
    if (state.layout === 'mobile') sidebarSheet.set('half');
  };

  app.clearArea = () => {
    if (!state.area && !placePopup) { atlas.clearPlace(); return; }
    state.area = null;
    atlas.setHighlight([]);
    atlas.clearPlace();
    if (placePopup) { atlas.map.closePopup(placePopup); placePopup = null; }
    sidebar.render();
  };

  /* overlapping events at one spot: let the person choose */
  atlas.on('choose', ({ ids }) => {
    const events = ids.map(findEvent).filter(Boolean);
    const first = events[0];
    const list = h('div', { class: 'chooser' }, h('strong', null, `${events.length} events at this spot`),
      h('ul', null, events.map((e) => h('li', null, h('button', { type: 'button', onClick: () => { atlas.map.closePopup(); app.select({ kind: 'event', id: e.id }, { source: 'map' }); } }, h('span', null, e.title), h('small', null, `${e.category} · updated ${formatDateLong(e.date)}`))))));
    window.L.popup({ className: 'echo-card', autoPan: true }).setLatLng([first.lat, first.lng]).setContent(list).openOn(atlas.map);
  });
  atlas.on('select', (sel) => {
    if (state.selection && sel.kind === state.selection.kind && sel.id === state.selection.id) { if (report.el.hidden) app.select(sel, { source: 'map' }); else app.focusSubject(); return; }
    app.select(sel, { source: 'map', fly: state.layout === 'mobile' || sel.kind === 'inv' });
    if (state.layout !== 'mobile' && sel.kind === 'event') { const e = findEvent(sel.id); if (e) atlas.reveal(e.lat, e.lng); }
  });

  /* ---------------- pick a place / pin a note ---------------- */
  let pickMode = null; // { kind: 'investigate' } | { kind: 'note', invId, text }
  function positionPick() {
    const ins = insets();
    const W = root.clientWidth;
    const H = root.clientHeight;
    pickUi.style.setProperty('--cx', `${ins.left + (W - ins.left - ins.right) / 2}px`);
    pickUi.style.setProperty('--cy', `${ins.top + (H - ins.top - ins.bottom) / 2}px`);
  }
  app.startPick = () => {
    stopNoteMode();
    pickMode = { kind: 'investigate' };
    if (state.layout === 'mobile') sidebarSheet.set('peek');
    pickUi.replaceChildren(
      h('div', { class: 'pick-cross', 'aria-hidden': 'true' }),
      h('div', { class: 'pick-bar panel', role: 'dialog', 'aria-label': 'Choose a place' },
        h('p', null, 'Move the map until the cross is over the place you want to investigate.'),
        h('div', { class: 'pick-actions' },
          h('button', { type: 'button', class: 'btn btn-quiet', onClick: () => stopPick() }, 'Cancel'),
          h('button', { type: 'button', class: 'btn btn-primary', onClick: () => { const c = atlas.clearCenter(); stopPick(); app.dialogs.newInvestigation({ lat: c.lat, lng: c.lng }); } }, 'Investigate here'))));
    pickUi.hidden = false;
    root.classList.add('is-picking');
    positionPick();
    pickUi.querySelector('.btn-primary').focus();
  };
  function stopPick() { pickMode = null; pickUi.hidden = true; root.classList.remove('is-picking'); }

  app.addNote = (invId, text, { pin = false } = {}) => {
    if (!pin) { finishNote(invId, text, null); return; }
    stopPick();
    pickMode = { kind: 'note', invId, text };
    if (state.layout === 'mobile') reportSheet.set('peek');
    pickUi.replaceChildren(h('div', { class: 'pick-bar panel', role: 'dialog', 'aria-label': 'Pin the note' },
      h('p', null, 'Click the map where this note belongs.'),
      h('div', { class: 'pick-actions' },
        h('button', { type: 'button', class: 'btn btn-quiet', onClick: () => stopNoteMode() }, 'Cancel'),
        h('button', { type: 'button', class: 'btn', onClick: () => { const m = pickMode; stopNoteMode(); finishNote(m.invId, m.text, null); } }, 'Save without a pin'))));
    pickUi.hidden = false;
    root.classList.add('is-pinning');
  };
  function stopNoteMode() {
    if (pickMode?.kind !== 'note') return;
    pickMode = null;
    pickUi.hidden = true;
    root.classList.remove('is-pinning');
    atlas.setDraftPin(null);
  }
  function finishNote(invId, text, point) {
    try {
      store.addNote(invId, { text, ...(point ? { lat: point.lat, lng: point.lng } : {}), dateIndex: state.imagery.index });
      ui.toast(point ? 'Note pinned.' : 'Note saved.');
    } catch (e) { ui.toast(e.message, { error: true }); }
  }
  atlas.on('mapclick', (p) => {
    if (pickMode?.kind === 'note') { const m = pickMode; stopNoteMode(); finishNote(m.invId, m.text, p); if (state.layout === 'mobile') reportSheet.set('half'); }
  });
  atlas.on('contextmenu', (p) => {
    const card = h('div', { class: 'place-card' }, h('strong', null, 'This spot'), h('span', { class: 'num' }, `${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}`),
      h('button', { type: 'button', class: 'btn btn-small btn-primary', onClick: () => { atlas.map.closePopup(); app.dialogs.newInvestigation({ lat: p.lat, lng: p.lng }); } }, 'Investigate this place'));
    window.L.popup({ className: 'echo-card', autoPan: false }).setLatLng([p.lat, atlas.map.getCenter().lng + (((p.lng - atlas.map.getCenter().lng + 540) % 360) - 180)]).setContent(card).openOn(atlas.map);
  });
  app.removeNote = (invId, noteId) => { store.removeNote(invId, noteId); ui.toast('Note deleted.'); };

  /* ---------------- report helpers ---------------- */
  app.focusPoint = (p) => atlas.flyTo([p.lat, p.lng], Math.max(atlas.getZoom(), 9));

  app.openSnapshot = (shot) => {
    const model = report.model;
    if (!model) return;
    const src = gibsSnapshotUrl({ lat: model.lat, lng: model.lng, date: shot.date, imagery: state.settings.imagery, spanKm: model.evidence.spanKm, width: 1200, height: 750 });
    ui.lightbox({
      src, alt: `${shot.role}: ${formatDateLong(shot.date)}`,
      caption: `NASA GIBS ${state.settings.imagery === 'viirs' ? 'VIIRS' : 'MODIS'} true-colour image for ${formatDateLong(shot.date)}, centred on ${model.title}. About ${model.evidence.spanKm} km across. A daily composite: clouds and gaps are normal.`,
      actions: shot.timelineIndex >= 0 ? [
        { label: 'Show on the map', kind: 'quiet', onClick: () => { app.chooseWindowItem({ date: shot.date, timelineIndex: shot.timelineIndex }); app.setNasa(true); } },
        ...(shot.timelineIndex > 0 ? [{ label: 'Compare with before', kind: 'quiet', onClick: () => { app.chooseWindowItem({ date: shot.date, timelineIndex: shot.timelineIndex }); app.setCompare(true); } }] : [])
      ] : []
    });
  };

  app.openLatestImage = () => {
    const model = report.model;
    if (!model) return;
    const date = addDays(todayIso(), -1);
    ui.lightbox({
      src: gibsSnapshotUrl({ lat: model.lat, lng: model.lng, date, imagery: state.settings.imagery, spanKm: model.evidence.spanKm, width: 1200, height: 750 }),
      alt: `Latest daily image: ${formatDateLong(date)}`,
      caption: `NASA GIBS true-colour composite for ${formatDateLong(date)} (yesterday, the most recent complete day). It is assembled from satellite passes; it is not a live picture.`
    });
  };

  app.shareSelection = async () => {
    writeHash();
    const result = await platform.share({ title: report.model?.title || 'ECHO', url: location.href });
    if (result === 'copied') ui.toast('Link copied. It opens this report.');
    else if (result === 'failed') ui.toast('Copy this page’s address to share the report.', { error: true });
  };

  app.exportSelection = async () => {
    const model = report.model;
    if (!model) return;
    const inv = model.kind === 'event' ? (app.savedFor(model.id) || model.investigation) : store.get(model.id);
    const notes = store.get(inv.id) ? store.notes(inv.id) : [];
    await platform.saveFile({ name: exportFileName(inv, 'md'), content: toMarkdownReport(inv, { notes }), mime: 'text/markdown' });
    ui.toast('Field report downloaded.');
  };

  /* ---------------- my location ---------------- */
  async function locateMe() {
    try {
      const spot = await platform.getPosition();
      atlas.setUserLocation(spot);
      atlas.flyTo([spot.lat, spot.lng], Math.max(atlas.getZoom(), 9));
    } catch (error) {
      ui.toast(error.message, { error: true });
    }
  }

  /* ---------------- events feed ---------------- */
  let firstLoad = true;
  app.refreshEvents = async ({ force = false } = {}) => {
    state.feed = { ...state.feed, loading: true };
    sidebar.renderStatus();
    const result = await feed.load({ force });
    state.events = result.items;
    state.feed = { loading: false, stale: Boolean(result.stale), error: result.error || null, fetchedAt: result.fetchedAt };
    atlas.setEvents(state.events);
    if (state.category !== 'all') app.setCategory(state.category);
    if (firstLoad) { firstLoad = false; mapEl.classList.add('pins-enter'); setTimeout(() => mapEl.classList.remove('pins-enter'), 2200); }
    if (state.selection?.kind === 'event') {
      const found = modelFor(state.selection);
      if (found) report.show(found.model);
    }
    sidebar.render();
    if (force && result.error) ui.toast(state.events.length ? 'NASA’s feed did not answer. Showing the events saved on this device.' : 'NASA’s event feed is not reachable right now.', { error: true });
    return result;
  };

  /* ---------------- address bar ---------------- */
  let hashTimer = 0;
  function writeHash() {
    clearTimeout(hashTimer);
    hashTimer = setTimeout(() => {
      const c = atlas.getCenter();
      const next = formatHash({ selection: state.selection, view: { lat: c.lat, lng: c.lng, zoom: atlas.getZoom() } });
      if (next !== location.hash) history.replaceState(null, '', next || location.pathname + location.search);
    }, 250);
  }
  atlas.on('moveend', writeHash);
  addEventListener('hashchange', () => {
    const { selection } = parseHash(location.hash);
    if (selection && !(state.selection && state.selection.id === selection.id)) app.select(selection, { source: 'link' });
  });

  /* ---------------- store changes ---------------- */
  store.subscribe((event) => {
    if (event.type === 'settings') {
      const next = store.settings();
      if (next.showLabels !== state.settings.showLabels) atlas.setLabels(next.showLabels);
      if (next.imagery !== state.settings.imagery) atlas.setImagery(next.imagery);
      state.settings = next;
      if (!layersPop.hidden) renderLayers();
      report.refresh();
      return;
    }
    atlas.setInvestigations(store.list());
    if (state.selection) {
      const found = modelFor(state.selection);
      if (!found) { if (state.selection.kind === 'inv') app.closeReport(); }
      else { report.show(found.model); atlas.drawNotes(savedNotes()); }
    }
    sidebar.render();
  });

  /* ---------------- keyboard ---------------- */
  document.addEventListener('keydown', (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
    if (e.key === '/' && !typing && !document.querySelector('dialog[open]')) { e.preventDefault(); if (state.layout === 'desktop' && !state.sidebarOpen) app.setSidebar(true); sidebar.search.focus(); return; }
    if (e.key !== 'Escape' || document.querySelector('dialog[open]')) return;
    if (!layersPop.hidden) { toggleLayers(false); layersBtn.focus(); return; }
    if (pickMode?.kind === 'note') { stopNoteMode(); return; }
    if (pickMode) { stopPick(); return; }
    if (atlas.map._popup && atlas.map.hasLayer(atlas.map._popup)) { atlas.map.closePopup(); return; }
    if (!compareUi.hidden && !typing) { app.setCompare(false); return; }
    if (state.selection && !typing) app.closeReport();
  });

  addEventListener('online', () => app.refreshEvents({ force: true }));
  setInterval(() => { if (document.visibilityState === 'visible') app.refreshEvents(); }, 10 * 60 * 1000);

  /* ---------------- start ---------------- */
  applyLayout();
  const cached = feed.cached();
  if (cached.items.length) { state.events = cached.items; state.feed = { loading: true, stale: true, error: null, fetchedAt: cached.fetchedAt }; atlas.setEvents(state.events); }
  sidebar.render();
  const initial = parseHash(location.hash);
  // Wait for the panels to be laid out, then frame the planet in the space beside them.
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  atlas.invalidateSize();
  updateInsets();
  if (initial.view) atlas.map.setView([initial.view.lat, initial.view.lng], initial.view.zoom, { animate: false });
  else atlas.goWorld({ animate: false });
  if (initial.selection?.kind === 'inv') app.select(initial.selection, { source: 'link', fly: !initial.view });
  await app.refreshEvents();
  if (initial.selection?.kind === 'event') app.select(initial.selection, { source: 'link', fly: !initial.view });

  window.__echo = { app, atlas, state }; // for tests and the browser console
  root.classList.add('is-ready');
  // New accounts get the three welcome cards once; people logging back in go straight to the map.
  if (isNew) showOnboarding({ name: user.name });
}

function readPref(key, fallback) {
  try { const v = localStorage.getItem(`echo-web-pref-${key}`); return v === null ? fallback : v === 'true'; } catch { return fallback; }
}
function writePref(key, value) {
  try { localStorage.setItem(`echo-web-pref-${key}`, String(value)); } catch { /* storage may be blocked */ }
}

boot().catch((error) => {
  console.error(error);
  const app = document.getElementById('app');
  app?.replaceChildren(h('div', { class: 'fatal' }, h('h1', null, 'ECHO could not start'), h('p', null, 'Reload the page. If this keeps happening, your browser may be blocking storage or scripts for this site.'), h('pre', null, String(error?.message || error))));
});
