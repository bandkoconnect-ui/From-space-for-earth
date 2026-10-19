// Explore: the phone's main screen. A full-screen map, a floating title chip and map buttons,
// and a bottom sheet with three heights: peek (the timeline), half and full (report and notes).

import { h, ic, mount } from '../../shared/ui/dom.js';
import { terrainArt } from '../../shared/ui/art.js';
import { EchoMap } from '../../shared/map/echo-map.js';
import {
  DATA_OVERLAYS, IMAGERY_LAYERS, MAX_LAT, ValidationError, clamp, describeInvestigation, formatDate, formatDateLong,
  formatDateShort, formatLatLng, topicInfo, worldviewUrl, wrapLng
} from '../../shared/core/src/index.js';

const SNAPS = ['peek', 'half', 'full'];
const PLAY_INTERVAL_MS = 2200;
const DRAG_THRESHOLD = 8;
const INSET_DELAY_MS = 260;

const LAYER_DEFS = [
  { id: 'nasa', label: 'NASA imagery', hint: 'For the selected date' },
  { id: 'compare', label: 'Before / after swipe', hint: 'First date against the selected one' },
  { id: 'overlay', label: 'Study area and event track' },
  { id: 'points', label: 'Reference points' },
  { id: 'notes', label: 'Field notes' },
  { id: 'labels', label: 'Place names' },
  { id: 'satellite', label: 'Base imagery', hint: 'Esri · not date-specific' },
  ...DATA_OVERLAYS.map((layer) => ({ id: layer.id, label: layer.label, hint: layer.detail }))
];

export function createExploreView(app) {
  const { store, ui, platform, actions } = app;
  const st = {
    id: null, dateIndex: 0, playTimer: null, tab: 'report', snap: 'peek', snapBeforePin: null,
    pinMode: false, draft: null, dirty: true, visible: false, picking: null,
    inset: 0, insetTimer: null, locating: false
  };
  let map = null;

  const root = h('section', { class: 'view explore', 'aria-label': 'Explore', hidden: true });
  const current = () => store.get(st.id);

  /* ------------------------------------------------------------------ */
  /* Map area                                                            */
  /* ------------------------------------------------------------------ */

  const mapCanvas = h('div', { class: 'map-canvas', role: 'application', 'aria-label': 'Map' });
  const crosshair = h('div', { class: 'pick-crosshair', 'aria-hidden': 'true', hidden: true }, ic('crosshair', { size: 44, stroke: 1.5 }), h('span', { class: 'pick-dot' }));

  const beforeLabel = h('span', { class: 'compare-label before' });
  const afterLabel = h('span', { class: 'compare-label after' });
  const compareLabels = h('div', { class: 'compare-labels', 'aria-hidden': 'true', hidden: true }, beforeLabel, afterLabel);
  const compareHint = h('div', { class: 'map-note', hidden: true }, 'The first and selected dates are the same. Pick a later date on the timeline to compare.');
  const banner = h('div', { class: 'map-note warn', role: 'status', hidden: true }, ic('wifiOff', { size: 16 }), h('span', null, 'NASA imagery is not loading. Check your connection; the map will recover on its own.'));
  const mapBottom = h('div', { class: 'map-bottom' }, banner, compareHint, compareLabels);

  const handle = h('div', {
    class: 'compare-handle', role: 'slider', tabindex: '0',
    'aria-label': 'Before and after divider', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': '50', 'aria-orientation': 'horizontal'
  }, h('span', { class: 'grip' }, ic('compare', { size: 20 })));
  const compareLayer = h('div', { class: 'compare-layer', hidden: true }, handle);

  const mapArea = h('div', { class: 'map-area' }, mapCanvas, compareLayer, mapBottom, crosshair);

  let dragging = false;
  function setSplit(percent) {
    const value = clamp(percent, 2, 98);
    map?.setSplit(value);
    handle.style.left = `${value}%`;
    handle.setAttribute('aria-valuenow', String(Math.round(value)));
    describeSplit();
  }
  function describeSplit() {
    const inv = current();
    if (!inv) return;
    const percent = Math.round(Number(handle.getAttribute('aria-valuenow')));
    handle.setAttribute('aria-valuetext', `${percent} percent. Earlier date ${formatDateLong(inv.timeline[0].date)} on the left, ${formatDateLong(inv.timeline[st.dateIndex].date)} on the right`);
  }
  handle.addEventListener('pointerdown', (event) => { dragging = true; handle.setPointerCapture(event.pointerId); handle.classList.add('dragging'); event.preventDefault(); });
  handle.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    const rect = mapArea.getBoundingClientRect();
    setSplit(((event.clientX - rect.left) / rect.width) * 100);
  });
  const endHandleDrag = () => { if (dragging) platform.haptic(); dragging = false; handle.classList.remove('dragging'); };
  handle.addEventListener('pointerup', endHandleDrag);
  handle.addEventListener('pointercancel', endHandleDrag);
  handle.addEventListener('keydown', (event) => {
    const now = Number(handle.getAttribute('aria-valuenow'));
    const step = event.shiftKey ? 10 : 2;
    const next = { ArrowLeft: now - step, ArrowRight: now + step, Home: 2, End: 98 }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    setSplit(next);
  });

  /* ------------------------------------------------------------------ */
  /* Floating controls                                                   */
  /* ------------------------------------------------------------------ */

  const chipTitle = h('strong');
  const legendTitle = h('span', { class: 'legend-title' });
  const legendSub = h('span', { class: 'legend-sub' });
  const chip = h('button', { type: 'button', class: 'title-chip', 'aria-label': 'Switch investigation', onClick: () => app.sheets.switcher() },
    h('span', { class: 'chip-main' }, chipTitle, ic('chevronDown', { size: 16 })),
    h('span', { class: 'chip-legend' }, legendTitle, legendSub));
  const layersButton = h('button', { type: 'button', class: 'fab fab-lg', 'aria-label': 'Map layers', onClick: () => openLayers() }, ic('layers', { size: 22 }));
  const topBar = h('div', { class: 'top-bar' }, chip, layersButton);

  const modeText = h('span');
  const modeBar = h('div', { class: 'mode-bar', role: 'status', hidden: true }, ic('pin', { size: 18 }), modeText,
    h('button', { type: 'button', class: 'btn btn-ghost', onClick: () => (st.picking ? finishPick(false) : setPinMode(false)) }, 'Cancel'));

  const fab = (icon, label, onClick, extra = {}) => h('button', { type: 'button', class: 'fab', 'aria-label': label, onClick, ...extra }, ic(icon, { size: 20 }));
  const compareButton = fab('compare', 'Compare before and after', () => toggleCompare(), { 'aria-pressed': 'false' });
  const pinButton = fab('pin', 'Add a note pin', () => setPinMode(!st.pinMode), { 'aria-pressed': 'false' });
  const locateButton = fab('locate', 'Show my location', () => locate());
  const homeButton = fab('home', 'Back to the study area', () => map?.goHome());
  const fabs = h('div', { class: 'fabs' }, compareButton, pinButton, locateButton, homeButton);

  const overlayCol = h('div', { class: 'overlay-col' }, topBar, modeBar, fabs);

  async function locate() {
    if (st.locating || !map) return;
    st.locating = true;
    locateButton.classList.add('busy');
    try {
      const spot = await platform.getPosition();
      map.setUserLocation(spot);
      map.moveTo([spot.lat, spot.lng], Math.max(map.map.getZoom(), 11));
      platform.haptic();
    } catch (error) {
      ui.toast(error.message, { error: true });
    } finally {
      st.locating = false;
      locateButton.classList.remove('busy');
    }
  }

  /* ---- layers sheet ---- */
  function openLayers() {
    if (!map) return;
    const settings = store.settings();
    const rows = LAYER_DEFS.map((def) => {
      const input = h('input', { type: 'checkbox', 'data-layer': def.id, checked: Boolean(def.id === 'labels' ? settings.showLabels : map.layers[def.id]), onChange: () => toggleLayer(def.id, input.checked) });
      return h('label', { class: 'switch-row layer-row' },
        h('span', { class: 'layer-text' }, h('span', null, def.label), def.hint ? h('small', null, def.hint) : null),
        input, h('span', { class: 'switch' }));
    });
    ui.sheet({
      title: 'Map layers',
      className: 'sheet-tall',
      body: h('div', { class: 'form-stack' },
        h('div', { class: 'field' }, h('span', null, 'Satellite imagery'),
          app.sheets.choiceChips(IMAGERY_LAYERS.map((layer) => ({ value: layer.id, label: layer.label })), settings.imagery, (value) => store.setSettings({ imagery: value }), 'Satellite imagery')),
        h('div', { class: 'layer-list' }, rows),
        h('p', { class: 'muted small' }, 'NASA imagery shows the date selected on the timeline. The base imagery from Esri is not tied to a date.')),
      actions: [{ label: 'Done', kind: 'primary' }]
    });
  }

  function toggleLayer(id, enabled) {
    if (!map) return;
    if (id === 'labels') { store.setSettings({ showLabels: enabled }); return; }
    map.setLayer(id, enabled);
    if (id === 'compare') renderCompareState();
  }

  function toggleCompare(force) {
    if (!map || !current()) return;
    const next = force ?? !map.layers.compare;
    map.setLayer('compare', next);
    if (next && st.dateIndex === 0 && current().timeline.length > 1) setDate(current().timeline.length - 1);
    renderCompareState();
    platform.haptic();
  }

  /* ------------------------------------------------------------------ */
  /* Bottom sheet: grabber and timeline (always visible) plus a body     */
  /* ------------------------------------------------------------------ */

  const grabber = h('button', {
    type: 'button', class: 'bsheet-grab', 'aria-label': 'Resize the panel. Up arrow for more, down arrow for less',
    onClick: () => cycleSnap(),
    onKeydown: (event) => {
      if (event.key === 'ArrowUp') { event.preventDefault(); setSnap(SNAPS[Math.min(SNAPS.length - 1, SNAPS.indexOf(st.snap) + 1)]); }
      if (event.key === 'ArrowDown') { event.preventDefault(); setSnap(SNAPS[Math.max(0, SNAPS.indexOf(st.snap) - 1)]); }
    }
  }, h('span'));

  const playButton = h('button', { type: 'button', class: 'play-btn', 'aria-label': 'Play through the dates', onClick: () => togglePlay() }, ic('play', { size: 20 }));
  const stopsEl = h('div', { class: 'stops', role: 'group', 'aria-label': 'Imagery dates' });
  const dockDate = h('strong');
  const dockDesc = h('span');
  const dockEvent = h('small', { class: 'dock-event' });
  const expandButton = h('button', { type: 'button', class: 'expand-btn', onClick: () => setSnap(st.snap === 'peek' ? 'half' : 'peek') });
  const dock = h('div', { class: 'dock' },
    h('div', { class: 'dock-row' }, playButton, stopsEl),
    h('div', { class: 'dock-info' },
      h('div', { class: 'dock-text', 'aria-live': 'polite' }, dockDate, dockDesc, dockEvent),
      expandButton));
  const head = h('div', { class: 'bsheet-head' }, grabber, dock);

  const tabButtons = new Map();
  const TABS = [{ id: 'report', label: 'Report' }, { id: 'notes', label: 'Notes' }];
  const segmented = h('div', { class: 'segmented', role: 'tablist', 'aria-label': 'Panel' }, TABS.map((tab) => {
    const button = h('button', { type: 'button', role: 'tab', class: 'seg', id: `m-tab-${tab.id}`, onClick: () => setTab(tab.id) });
    tabButtons.set(tab.id, button);
    return button;
  }));
  const panelEl = h('div', { class: 'bsheet-panel', role: 'tabpanel', tabindex: '-1' });
  const bodyEl = h('div', { class: 'bsheet-body' }, segmented, panelEl);
  const sheet = h('div', { class: 'bsheet', 'data-snap': 'peek' }, head, bodyEl);

  // Typing needs room: lift the sheet to full height while a field has focus.
  bodyEl.addEventListener('focusin', (event) => { if (event.target.matches?.('input, textarea')) setSnap('full'); });

  function sizes() {
    const stageH = root.clientHeight;
    const H = sheet.offsetHeight;
    const peekH = Math.min(head.offsetHeight, H);
    // Half height: about half the screen, but never so tall that less than 160px of map remains.
    const halfH = Math.min(H, Math.max(peekH + 60, Math.min(Math.max(peekH + 150, Math.round(stageH * 0.52)), stageH - 160)));
    return { stageH, H, peekH, halfH, peek: H - peekH, half: Math.max(0, H - halfH), full: 0 };
  }

  function commitInset(px) {
    st.inset = px;
    root.style.setProperty('--map-inset', `${px}px`); // read by the map area and by the floating controls
    map?.invalidateSize();
  }

  function setInset(px, animate) {
    clearTimeout(st.insetTimer);
    if (px === st.inset) return;
    // A map that is about to shrink waits for the sheet to cover its edge, so no gap shows.
    if (animate && px > st.inset) st.insetTimer = setTimeout(() => commitInset(px), INSET_DELAY_MS);
    else commitInset(px);
  }

  function applySnap({ animate = true } = {}) {
    const s = sizes();
    if (!s.stageH) return;
    sheet.classList.toggle('no-anim', !animate);
    sheet.style.transform = `translateY(${st.picking ? s.H + 24 : s[st.snap]}px)`;
    sheet.dataset.snap = st.snap;
    bodyEl.inert = st.snap === 'peek' || Boolean(st.picking);
    // The part of the sheet that is below the screen must not be part of the scrolling area,
    // or the end of the report would sit off-screen. (Applied at the end of a move, like the map inset.)
    bodyEl.style.marginBottom = st.picking ? '0px' : `${s[st.snap]}px`;
    expandButton.replaceChildren(ic(st.snap === 'peek' ? 'chevronUp' : 'chevronDown', { size: 16 }), st.snap === 'peek' ? 'Report' : 'Map');
    expandButton.setAttribute('aria-label', st.snap === 'peek' ? 'Show the report and notes' : 'Show more of the map');
    expandButton.setAttribute('aria-expanded', String(st.snap !== 'peek'));
    setInset(st.picking ? 0 : st.snap === 'peek' ? s.peekH : s.halfH, animate);
  }

  function setSnap(snap, { animate = true } = {}) {
    if (!SNAPS.includes(snap)) return;
    if (st.pinMode && snap !== 'peek') return; // the map must stay visible while placing a pin
    st.snap = snap;
    applySnap({ animate });
  }

  function cycleSnap() {
    setSnap(SNAPS[(SNAPS.indexOf(st.snap) + 1) % SNAPS.length]);
    platform.haptic();
  }

  // Drag the grabber or the timeline area to move the sheet between its three heights.
  // The move/up listeners live on the document: a mouse pointer is not captured by the sheet, and a
  // finger drifting off it (or a fast flick) must not lose the gesture.
  let drag = null;
  let suppressClick = false;
  const onDragMove = (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    const dy = event.clientY - drag.startY;
    if (!drag.captured) {
      if (Math.abs(dy) < DRAG_THRESHOLD) return;
      drag.captured = true;
      sheet.classList.add('dragging');
      clearTimeout(st.insetTimer);
    }
    const s = sizes();
    const dt = Math.max(1, event.timeStamp - drag.lastT);
    drag.velocity = (event.clientY - drag.lastY) / dt;
    drag.lastY = event.clientY;
    drag.lastT = event.timeStamp;
    drag.offset = clamp(drag.base + dy, s.full, s.peek);
    sheet.style.transform = `translateY(${drag.offset}px)`;
  };
  const onDragEnd = (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    const finished = drag;
    drag = null;
    document.removeEventListener('pointermove', onDragMove);
    document.removeEventListener('pointerup', onDragEnd);
    document.removeEventListener('pointercancel', onDragEnd);
    if (!finished.captured) return;
    suppressClick = true;
    setTimeout(() => { suppressClick = false; }, 0);
    sheet.classList.remove('dragging');
    const s = sizes();
    const projected = finished.offset + finished.velocity * 220;
    const target = SNAPS.reduce((best, name) => (Math.abs(s[name] - projected) < Math.abs(s[best] - projected) ? name : best), 'peek');
    if (target !== st.snap) platform.haptic();
    if (st.pinMode) st.snap = 'peek'; else st.snap = target;
    applySnap();
  };
  head.addEventListener('pointerdown', (event) => {
    if (drag || (event.pointerType === 'mouse' && event.button !== 0)) return;
    const s = sizes();
    drag = { id: event.pointerId, startY: event.clientY, lastY: event.clientY, lastT: event.timeStamp, velocity: 0, base: s[st.snap], captured: false, offset: s[st.snap] };
    document.addEventListener('pointermove', onDragMove);
    document.addEventListener('pointerup', onDragEnd);
    document.addEventListener('pointercancel', onDragEnd);
  });
  head.addEventListener('click', (event) => { if (suppressClick) { event.stopPropagation(); event.preventDefault(); } }, true);

  /* ------------------------------------------------------------------ */
  /* Timeline                                                            */
  /* ------------------------------------------------------------------ */

  function renderTimeline(eventStatus) {
    const inv = current();
    if (!inv) return;
    const multiYear = new Set(inv.timeline.map((stop) => stop.date.slice(0, 4))).size > 1;
    mount(stopsEl, ...inv.timeline.map((stop, i) => h('button', {
      type: 'button',
      class: `stop${i === st.dateIndex ? ' active' : ''}${i < st.dateIndex ? ' past' : ''}`,
      'aria-current': i === st.dateIndex ? 'step' : null,
      'aria-label': `${formatDateLong(stop.date)}${stop.desc ? `. ${stop.desc}` : ''}`,
      onClick: () => { platform.haptic(); setDate(i); }
    }, h('span', { class: 'stop-dot' }), h('span', { class: 'stop-date mono' }, multiYear ? formatDate(stop.date) : formatDateShort(stop.date)))));
    const stop = inv.timeline[st.dateIndex];
    dockDate.textContent = formatDateLong(stop.date);
    dockDesc.textContent = stop.desc ? ` · ${stop.desc}` : '';
    dockEvent.textContent = eventStatus ? eventStatus.label : '';
    dockEvent.hidden = !eventStatus;
    playButton.replaceChildren(ic(st.playTimer ? 'pause' : 'play', { size: 20 }));
    playButton.setAttribute('aria-label', st.playTimer ? 'Pause' : 'Play through the dates');
    renderCompareState();
    // Centre the active date in the scrolling row (scrollIntoView could scroll the whole screen).
    const active = stopsEl.querySelector('.stop.active');
    if (active) stopsEl.scrollTo({ left: Math.max(0, active.offsetLeft - (stopsEl.clientWidth - active.offsetWidth) / 2), behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }

  function renderCompareState() {
    const inv = current();
    const open = Boolean(map?.layers.compare && inv);
    compareLayer.hidden = !open;
    compareLabels.hidden = !open;
    compareButton.setAttribute('aria-pressed', String(open));
    compareButton.classList.toggle('active', open);
    if (!open || !inv) { compareHint.hidden = true; return; }
    beforeLabel.textContent = `Before · ${formatDate(inv.timeline[0].date)}`;
    afterLabel.textContent = `After · ${formatDate(inv.timeline[st.dateIndex].date)}`;
    compareHint.hidden = st.dateIndex !== 0 || inv.timeline.length < 2;
    describeSplit();
  }

  function setDate(index, { keepPlaying = false } = {}) {
    const inv = current();
    if (!inv || !map) return;
    if (!keepPlaying) stopPlay();
    st.dateIndex = clamp(index, 0, inv.timeline.length - 1);
    renderTimeline(map.setDateIndex(st.dateIndex));
    if (st.tab === 'report') renderPanel();
  }

  function stopPlay() {
    if (!st.playTimer) return;
    clearInterval(st.playTimer);
    st.playTimer = null;
    playButton.replaceChildren(ic('play', { size: 20 }));
    playButton.setAttribute('aria-label', 'Play through the dates');
  }

  function togglePlay() {
    const inv = current();
    if (!inv || inv.timeline.length < 2) return;
    if (st.playTimer) { stopPlay(); return; }
    if (st.dateIndex >= inv.timeline.length - 1) setDate(0);
    st.playTimer = setInterval(() => {
      if (st.dateIndex >= inv.timeline.length - 1) { stopPlay(); return; }
      setDate(st.dateIndex + 1, { keepPlaying: true });
    }, PLAY_INTERVAL_MS);
    playButton.replaceChildren(ic('pause', { size: 20 }));
    playButton.setAttribute('aria-label', 'Pause');
    platform.haptic();
  }

  /* ------------------------------------------------------------------ */
  /* Report and notes                                                    */
  /* ------------------------------------------------------------------ */

  function setTab(id) {
    st.tab = id;
    renderSegmented();
    panelEl.setAttribute('aria-labelledby', `m-tab-${id}`);
    renderPanel();
  }

  function renderSegmented() {
    const inv = current();
    const noteCount = inv ? store.notes(inv.id).length : 0;
    for (const [key, button] of tabButtons) {
      button.textContent = key === 'notes' && noteCount ? `Notes · ${noteCount}` : TABS.find((t) => t.id === key).label;
      button.setAttribute('aria-selected', String(key === st.tab));
      button.classList.toggle('active', key === st.tab);
    }
  }

  function renderPanel() {
    const inv = current();
    if (!inv) { mount(panelEl); return; }
    mount(panelEl, st.tab === 'report' ? reportPanel(inv) : notesPanel(inv));
  }

  function reportPanel(inv) {
    const topic = topicInfo(inv.topic);
    const stop = inv.timeline[st.dateIndex];
    const kind = inv.kind === 'demo' ? 'Demo' : inv.kind === 'event' ? 'Event' : 'Yours';
    const confidence = (kindName, title, text) => h('div', { class: 'confidence' }, h('i', { class: kindName }), h('div', null, h('strong', null, title), h('small', null, text)));
    return h('div', { class: 'report' },
      h('div', { class: 'report-top' },
        h('span', { class: 'pill' }, topic.label), h('span', { class: 'pill pill-amber' }, kind),
        h('span', { class: 'spacer' }),
        h('button', { type: 'button', class: 'btn btn-ghost', 'aria-label': 'Rename investigation', onClick: () => rename(inv) }, ic('edit', { size: 16 }), 'Rename')),
      h('p', { class: 'muted small' }, describeInvestigation(inv)),
      h('p', { class: 'summary' }, inv.summary || 'No summary yet.'),
      h('div', { class: 'callout' }, h('span', { class: 'mark' }, ic('sparkle', { size: 16 })),
        h('div', null, h('strong', null, inv.callout), h('p', null, `${inv.legend.title}. ${inv.legend.subtitle}.`))),
      h('div', { class: 'button-row' },
        h('button', { type: 'button', class: 'btn', onClick: () => actions.exportReport(inv.id) }, ic('download', { size: 16 }), 'Export report'),
        h('button', { type: 'button', class: 'btn', onClick: () => platform.openExternal(worldviewUrl(inv.center[0], inv.center[1], stop.date)) }, ic('external', { size: 16 }), 'Worldview')),
      h('div', { class: 'section-label' }, 'Evidence trail'),
      inv.evidence.map((e) => {
        const row = ui.link(e.url, h('span', { class: 'badge' }, e.badge || 'LINK'), h('span', { class: 'body' }, h('strong', null, e.title), h('small', null, e.detail)), ic('external', { size: 14 }));
        row.classList.add('evidence-row');
        return row;
      }),
      h('div', { class: 'section-label' }, 'Suggested next steps'),
      inv.steps.map((s, i) => h('div', { class: 'step-row' }, h('span', { class: 'num' }, String(i + 1).padStart(2, '0')), h('div', { class: 'body' }, h('strong', null, s.title), h('small', null, s.detail)))),
      h('div', { class: 'section-label' }, 'How sure can we be?'),
      confidence('observed', 'Observed', 'What NASA’s imagery shows on the dates you select, at about 250 m per pixel.'),
      confidence('inferred', 'Inferred', 'Anything you read into the differences between dates. Treat it as a hypothesis.'),
      confidence('unknown', 'Not known', 'Causes, exact extent and impact, until independent data confirms them.'));
  }

  async function rename(inv) {
    const title = await ui.prompt({ title: 'Rename investigation', label: 'Name', value: inv.title });
    if (title && title !== inv.title) {
      try { store.update(inv.id, { title }); } catch (error) { ui.toast(error.message, { error: true }); }
    }
  }

  /* ---- notes ---- */
  const noteText = h('textarea', { class: 'textarea', rows: '3', maxlength: '2000', placeholder: 'What did you see? Which date? What would you check next?', 'aria-label': 'New note', enterkeyhint: 'enter' });

  function notesPanel(inv) {
    const notes = store.notes(inv.id);
    const location = st.draft
      ? h('div', { class: 'note-location' }, ic('pin', { size: 14 }), h('span', { class: 'mono' }, formatLatLng(st.draft.lat, st.draft.lng, 4)),
        h('button', { type: 'button', class: 'btn btn-ghost', onClick: () => setDraft(null) }, 'Remove'))
      : null;
    return h('div', { class: 'notes-panel' },
      h('div', { class: 'composer' },
        noteText, location,
        h('div', { class: 'button-row' },
          h('button', { type: 'button', class: `btn${st.pinMode ? ' active' : ''}`, onClick: () => setPinMode(true) }, ic('pin', { size: 16 }), st.draft ? 'Move pin' : 'Pin to map'),
          h('button', { type: 'button', class: 'btn btn-primary', onClick: addNote }, 'Add note'))),
      h('div', { class: 'section-label' }, `Field notes (${notes.length})`),
      notes.length
        ? h('div', { class: 'note-list' }, notes.map((note) => noteCard(inv, note)))
        : h('p', { class: 'empty-note muted' }, 'No notes yet. Notes stay on this phone and are included in exported reports.'));
  }

  function noteCard(inv, note) {
    return h('div', { class: 'note', id: `m-note-${note.id}` },
      h('p', null, note.text),
      h('footer', null,
        h('span', null, formatDateLong(note.createdAt.slice(0, 10))),
        note.dateIndex !== undefined && inv.timeline[note.dateIndex] ? h('span', null, `· imagery ${formatDate(inv.timeline[note.dateIndex].date)}`) : null,
        h('span', { class: 'spacer' }),
        note.lat !== undefined ? h('button', { type: 'button', class: 'btn btn-ghost btn-icon', 'aria-label': 'Show on map', onClick: () => showNote(note) }, ic('pin', { size: 16 })) : null,
        h('button', { type: 'button', class: 'btn btn-ghost btn-icon', 'aria-label': 'Delete note', onClick: () => deleteNote(inv, note) }, ic('trash', { size: 16 }))));
  }

  function showNote(note) {
    if (!map) return;
    setSnap('peek');
    map.moveTo([note.lat, note.lng], Math.max(map.map.getZoom(), 8));
    setTimeout(() => map.openPopupForNote(note.id), 900);
  }

  function addNote() {
    const inv = current();
    if (!inv) return;
    try {
      store.addNote(inv.id, { text: noteText.value, lat: st.draft?.lat, lng: st.draft?.lng, dateIndex: st.dateIndex });
      noteText.value = '';
      noteText.blur();
      setDraft(null);
      platform.haptic('medium');
      ui.toast('Note added.');
    } catch (error) {
      if (error instanceof ValidationError) { ui.toast(error.message, { error: true }); noteText.focus(); } else throw error;
    }
  }

  async function deleteNote(inv, note) {
    const ok = await ui.confirm({ title: 'Delete this note?', message: note.text.length > 140 ? `${note.text.slice(0, 140)}…` : note.text, confirmLabel: 'Delete', danger: true });
    if (ok) store.removeNote(inv.id, note.id);
  }

  function setDraft(point) {
    st.draft = point;
    map?.setDraftPin(point);
    if (st.tab === 'notes') {
      const keep = noteText.value; // re-rendering must not throw away what was typed
      renderPanel();
      noteText.value = keep;
    }
  }

  /* ---- pin mode: tap the map to attach a note ---- */
  function setPinMode(on, { restore } = {}) {
    if (on === st.pinMode) return;
    if (st.picking) return;
    st.pinMode = on;
    pinButton.setAttribute('aria-pressed', String(on));
    pinButton.classList.toggle('active', on);
    root.classList.toggle('pinning', on);
    modeBar.hidden = !on;
    modeText.textContent = 'Tap the map to place your note';
    if (on) {
      st.snapBeforePin = st.snap;
      st.snap = 'peek';
      if (st.tab !== 'notes') { st.tab = 'notes'; renderSegmented(); }
    } else {
      st.snap = restore || st.snapBeforePin || st.snap;
      st.snapBeforePin = null;
    }
    applySnap();
    if (!on && st.tab === 'notes') { const keep = noteText.value; renderPanel(); noteText.value = keep; }
  }

  /* ------------------------------------------------------------------ */
  /* Pick a location (used by "New investigation")                       */
  /* ------------------------------------------------------------------ */

  const pickCoords = h('span', { class: 'mono pick-coords' }, '—');
  const pickBar = h('div', { class: 'pick-bar', hidden: true },
    h('div', { class: 'pick-row' }, ic('crosshair', { size: 16 }), pickCoords,
      h('button', { type: 'button', class: 'btn btn-ghost', onClick: async () => {
        try {
          const spot = await platform.getPosition();
          map.moveTo([spot.lat, spot.lng], 12, { animate: false });
        } catch (error) { ui.toast(error.message, { error: true }); }
      } }, ic('locate', { size: 16 }), 'My location')),
    h('div', { class: 'pick-actions' },
      h('button', { type: 'button', class: 'btn', onClick: () => finishPick(false) }, 'Cancel'),
      h('button', { type: 'button', class: 'btn btn-primary', onClick: () => finishPick(true) }, 'Use this location')));

  function updatePickReadout() {
    if (!st.picking || !map) return;
    const c = map.getCenter();
    pickCoords.textContent = formatLatLng(clamp(c.lat, -MAX_LAT, MAX_LAT), wrapLng(c.lng), 4);
  }

  function pickLocation() {
    if (st.picking) return Promise.resolve(null);
    return new Promise((resolve) => {
      ensureMap();
      stopPlay();
      setPinMode(false);
      st.picking = { resolve };
      root.classList.add('picking');
      document.body.classList.add('picking');
      crosshair.hidden = false;
      pickBar.hidden = false;
      modeBar.hidden = false;
      modeText.textContent = 'Move the map to put the cross on the place';
      applySnap({ animate: false });
      map.invalidateSize();
      requestAnimationFrame(() => { map.invalidateSize(); updatePickReadout(); });
    });
  }

  function finishPick(confirmed) {
    const picking = st.picking;
    if (!picking) return;
    const c = map.getCenter();
    const spot = confirmed ? { lat: clamp(c.lat, -MAX_LAT, MAX_LAT), lng: wrapLng(c.lng) } : null;
    st.picking = null;
    root.classList.remove('picking');
    document.body.classList.remove('picking');
    crosshair.hidden = true;
    pickBar.hidden = true;
    modeBar.hidden = true;
    applySnap({ animate: false });
    map.invalidateSize();
    picking.resolve(spot);
  }

  /* ------------------------------------------------------------------ */
  /* Empty state, map, selection                                         */
  /* ------------------------------------------------------------------ */

  const empty = h('div', { class: 'empty-card', hidden: true },
    ic('explore', { size: 32 }), h('h2', null, 'Nothing to explore yet'),
    h('p', { class: 'muted' }, 'Create an investigation around any place on Earth, or start from a live event in Planet Pulse.'),
    h('div', { class: 'stack-buttons' },
      h('button', { type: 'button', class: 'btn btn-primary btn-block', onClick: () => app.sheets.newInvestigation() }, 'New investigation'),
      h('button', { type: 'button', class: 'btn btn-block', onClick: () => app.go('pulse') }, 'Open Planet Pulse')));

  root.append(mapArea, overlayCol, sheet, pickBar, empty);

  function ensureMap() {
    if (map) return;
    map = new EchoMap(mapCanvas, { compact: true, imagery: store.settings().imagery });
    map.on('tileerror', () => { banner.hidden = false; });
    map.on('tileok', () => { banner.hidden = true; });
    map.on('mapclick', (point) => {
      if (!st.pinMode) return;
      setDraft(point);
      platform.haptic('medium');
      setPinMode(false, { restore: 'half' });
    });
    map.on('noteclick', ({ id }) => {
      if (st.tab !== 'notes') { st.tab = 'notes'; renderSegmented(); renderPanel(); }
      setSnap('half');
      setTimeout(() => document.getElementById(`m-note-${id}`)?.scrollIntoView({ block: 'nearest' }), 320);
    });
    map.map.on('move', updatePickReadout);
    new ResizeObserver(() => map.invalidateSize()).observe(mapCanvas);
    applySettings();
    setSplit(50);
  }

  function applySettings() {
    const settings = store.settings();
    if (!map) return;
    if (map.imageryId !== settings.imagery) map.setImagery(settings.imagery);
    if (map.layers.labels !== settings.showLabels) map.setLayer('labels', settings.showLabels);
  }

  function select(id) {
    const inv = store.get(id);
    if (!inv) return;
    stopPlay();
    st.id = id;
    store.setActive(id);
    st.dateIndex = inv.defaultIndex;
    setDraft(null);
    if (st.pinMode) setPinMode(false);
    ensureMap();
    const status = map.setInvestigation(inv, { dateIndex: st.dateIndex, notes: store.notes(id) });
    chipTitle.textContent = inv.title;
    legendTitle.textContent = inv.legend.title;
    legendSub.textContent = inv.legend.subtitle;
    chip.classList.toggle('illustrative', Boolean(inv.overlay?.illustrative));
    root.classList.remove('is-empty');
    empty.hidden = true;
    renderTimeline(status);
    renderSegmented();
    renderPanel();
    applySnap({ animate: false });
  }

  function showEmpty() {
    st.id = null;
    stopPlay();
    if (st.pinMode) setPinMode(false);
    ensureMap();
    map.clearInvestigation();
    root.classList.add('is-empty');
    empty.hidden = false;
    compareLayer.hidden = true;
    compareLabels.hidden = true;
    compareHint.hidden = true;
    renderSegmented();
    renderPanel();
  }

  function onStoreEvent(event) {
    if (!st.visible) { st.dirty = true; return; }
    const inv = current();
    switch (event.type) {
      case 'load':
      case 'remove':
      case 'add': {
        const active = store.active();
        if (!active) showEmpty();
        else if (!inv || active.id !== st.id) select(active.id);
        else { renderSegmented(); }
        break;
      }
      case 'update':
        if (inv) {
          chipTitle.textContent = inv.title;
          if (st.tab === 'report') renderPanel();
        }
        break;
      case 'notes':
        if (inv) {
          map?.drawNotes(store.notes(inv.id));
          renderSegmented();
          if (st.tab === 'notes') { const keep = noteText.value; renderPanel(); noteText.value = keep; }
        }
        break;
      case 'settings': applySettings(); break;
      default: break;
    }
  }
  store.subscribe(onStoreEvent);

  new ResizeObserver(() => { if (st.visible) applySnap({ animate: false }); }).observe(root);
  // The timeline text can change height (a longer description); keep the peek height in step with it.
  new ResizeObserver(() => { if (st.visible && !drag) applySnap({ animate: false }); }).observe(head);

  setTab('report');

  return {
    el: root,
    name: 'explore',
    show() {
      st.visible = true;
      ensureMap();
      applySnap({ animate: false });
      map.invalidateSize();
      const active = store.active();
      if (!active) showEmpty();
      else if (st.dirty || st.id !== active.id || !map.investigation) { st.dirty = false; select(active.id); }
      requestAnimationFrame(() => { map.invalidateSize(); applySnap({ animate: false }); });
    },
    hide() {
      st.visible = false;
      stopPlay();
      if (st.picking) finishPick(false);
      if (st.pinMode) setPinMode(false);
    },
    pickLocation,
    /** The Android back button. Returns true when this screen used the press. */
    back() {
      if (st.picking) { finishPick(false); return true; }
      if (st.pinMode) { setPinMode(false); return true; }
      if (st.snap === 'full') { setSnap('half'); return true; }
      if (st.snap === 'half') { setSnap('peek'); return true; }
      return false;
    },
    setSnap,
    toggleCompare,
    snap: () => st.snap,
    currentDate: () => map?.currentDate(),
    debugMap: () => map // for tests and dev tools
  };
}
