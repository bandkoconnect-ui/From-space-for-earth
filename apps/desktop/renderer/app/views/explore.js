// Explore: the working screen. Investigations on the left, the map and timeline in the middle,
// the report / notes / Ask ECHO inspector on the right.

import { h, ic, mount } from '../../shared/ui/dom.js';
import { terrainArt } from '../../shared/ui/art.js';
import { EchoMap } from '../../shared/map/echo-map.js';
import {
  DATA_OVERLAYS, IMAGERY_LAYERS, SUGGESTIONS, ValidationError, describeInvestigation, formatDate, formatDateLong,
  formatDateShort, formatLatLng, pluralise, topicInfo, worldviewUrl
} from '../../shared/core/src/index.js';

const TABS = [
  { id: 'report', label: 'Report', icon: 'list' },
  { id: 'notes', label: 'Notes', icon: 'note' },
  { id: 'ask', label: 'Ask ECHO', icon: 'sparkle' }
];

const PLAY_INTERVAL_MS = 2200;

export function createExploreView(app) {
  const { store, session, ui, platform, actions } = app;
  const st = { id: null, dateIndex: 0, playTimer: null, tab: 'report', inspectorOpen: true, pinMode: false, draft: null, dirty: true, visible: false, sending: false };
  let map = null;

  const root = h('section', { class: 'view explore', 'aria-label': 'Explore', hidden: true });

  /* ------------------------------------------------------------------ */
  /* Left column: investigations and layers                              */
  /* ------------------------------------------------------------------ */

  const listEl = h('ul', { class: 'inv-list' });
  const layerList = h('div', { class: 'layer-list' });
  const imagerySelect = h('select', { class: 'select', 'aria-label': 'Satellite imagery', onChange: () => store.setSettings({ imagery: imagerySelect.value }) },
    IMAGERY_LAYERS.map((layer) => h('option', { value: layer.id }, layer.label)));

  const LAYER_DEFS = [
    { id: 'nasa', label: 'NASA imagery', hint: 'For the selected date' },
    { id: 'compare', label: 'Before / after swipe', hint: 'First date against selected' },
    { id: 'overlay', label: 'Study area and event track' },
    { id: 'points', label: 'Reference points' },
    { id: 'notes', label: 'Field notes' },
    { id: 'labels', label: 'Place names' },
    { id: 'satellite', label: 'Base imagery', hint: 'Esri · not date-specific' },
    ...DATA_OVERLAYS.map((layer) => ({ id: layer.id, label: layer.label, hint: layer.detail }))
  ];
  const layerInputs = new Map();
  for (const def of LAYER_DEFS) {
    const input = h('input', {
      type: 'checkbox',
      'data-layer': def.id,
      onChange: () => toggleLayer(def.id, input.checked)
    });
    layerInputs.set(def.id, input);
    layerList.append(h('label', { class: 'switch-row layer-row' },
      h('span', { class: 'layer-text' }, h('span', null, def.label), def.hint ? h('small', null, def.hint) : null),
      input, h('span', { class: 'switch' })));
  }

  const side = h('aside', { class: 'ex-side' },
    h('div', { class: 'panel-head' }, h('span', { class: 'section-label' }, 'Investigations'),
      h('button', { class: 'btn btn-ghost btn-icon', type: 'button', title: 'New investigation (Ctrl/Cmd+N)', 'aria-label': 'New investigation', onClick: () => app.dialogs.newInvestigation() }, ic('plus'))),
    h('div', { class: 'ex-scroll' }, listEl),
    h('div', { class: 'layers' },
      h('div', { class: 'panel-head' }, h('span', { class: 'section-label' }, 'Layers')),
      h('div', { class: 'layer-sensor' }, h('label', { class: 'field' }, 'Imagery', imagerySelect)),
      layerList));

  function renderList() {
    mount(listEl, ...store.list().map((inv) => {
      const notes = store.notes(inv.id).length;
      return h('li', null, h('button', {
        type: 'button',
        class: `inv-item${inv.id === st.id ? ' selected' : ''}`,
        'aria-current': inv.id === st.id ? 'true' : null,
        onClick: () => select(inv.id)
      },
      h('span', { class: 'inv-thumb' }, terrainArt(inv.id, inv.topic, { width: 96, height: 72 })),
      h('span', { class: 'inv-text' },
        h('strong', null, inv.title),
        h('small', null, describeInvestigation(inv))),
      notes ? h('span', { class: 'count', title: `${pluralise(notes, 'note')}` }, notes) : null));
    }));
  }

  /* ------------------------------------------------------------------ */
  /* Centre: map, compare handle, tools                                  */
  /* ------------------------------------------------------------------ */

  const mapCanvas = h('div', { class: 'map-canvas', role: 'application', 'aria-label': 'Map' });
  const cardTitle = h('h2');
  const cardSub = h('p');
  const cardPill = h('span', { class: 'pill' });
  const legendTitle = h('strong');
  const legendSub = h('small');
  const cardLegend = h('div', { class: 'card-legend' }, legendTitle, legendSub);
  const readout = h('span', { class: 'mono' }, '—');
  const banner = h('div', { class: 'map-banner', role: 'status', hidden: true },
    ic('wifiOff', { size: 16 }), h('span', null, 'NASA imagery is not loading. Check your connection; the map will recover on its own.'));
  const pinHint = h('div', { class: 'pin-hint', hidden: true }, ic('pin', { size: 16 }), h('span', null, 'Click the map to place your note · Esc to cancel'));
  const compareHint = h('div', { class: 'compare-hint', hidden: true }, 'The first and selected dates are the same. Choose a later date on the timeline to compare.');
  const beforeLabel = h('span', { class: 'compare-label before', 'aria-hidden': 'true' });
  const afterLabel = h('span', { class: 'compare-label after', 'aria-hidden': 'true' });
  const handle = h('div', {
    class: 'compare-handle', role: 'slider', tabindex: '0',
    'aria-label': 'Before and after divider', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': '50', 'aria-orientation': 'horizontal'
  }, h('span', { class: 'grip' }, ic('compare', { size: 16 })), beforeLabel, afterLabel);
  const compareLayer = h('div', { class: 'compare-layer', hidden: true }, handle);

  const toolButton = (icon, label, onClick, extra = {}) => h('button', { type: 'button', class: 'tool-btn', title: label, 'aria-label': label, onClick, ...extra }, ic(icon));
  const compareButton = toolButton('compare', 'Compare before / after (Ctrl/Cmd+B)', () => toggleCompare(), { 'aria-pressed': 'false' });
  const pinButton = toolButton('pin', 'Drop a note pin', () => setPinMode(!st.pinMode), { 'aria-pressed': 'false' });
  const tools = h('div', { class: 'map-tools' },
    toolButton('plus', 'Zoom in', () => map?.zoomIn()),
    toolButton('minus', 'Zoom out', () => map?.zoomOut()),
    toolButton('locate', 'Back to the study area', () => map?.goHome()),
    h('span', { class: 'tool-sep' }),
    compareButton,
    pinButton);

  const mapStage = h('div', { class: 'map-stage' },
    mapCanvas,
    h('div', { class: 'map-card' }, cardPill, cardTitle, cardSub, cardLegend),
    tools,
    compareLayer,
    h('div', { class: 'map-readout' }, ic('crosshair', { size: 12 }), readout),
    pinHint, compareHint, banner);

  let dragging = false;
  function setSplit(percent) {
    const value = Math.max(2, Math.min(98, percent));
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
  handle.addEventListener('pointerdown', (event) => { dragging = true; handle.setPointerCapture(event.pointerId); event.preventDefault(); });
  handle.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    const rect = mapStage.getBoundingClientRect();
    setSplit(((event.clientX - rect.left) / rect.width) * 100);
  });
  const endDrag = () => { dragging = false; };
  handle.addEventListener('pointerup', endDrag);
  handle.addEventListener('pointercancel', endDrag);
  handle.addEventListener('keydown', (event) => {
    const now = Number(handle.getAttribute('aria-valuenow'));
    const step = event.shiftKey ? 10 : 2;
    const next = { ArrowLeft: now - step, ArrowRight: now + step, Home: 2, End: 98 }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    setSplit(next);
  });

  /* ------------------------------------------------------------------ */
  /* Timeline dock                                                       */
  /* ------------------------------------------------------------------ */

  const playButton = h('button', { type: 'button', class: 'btn btn-icon dock-play', title: 'Play through the dates (Ctrl/Cmd+Shift+P)', 'aria-label': 'Play through the dates', onClick: () => togglePlay() }, ic('play'));
  const stopsEl = h('ol', { class: 'stops' });
  const dockDate = h('strong');
  const dockDesc = h('span');
  const dockEvent = h('small', { class: 'dock-event' });
  const dock = h('div', { class: 'dock' },
    h('div', { class: 'dock-controls' },
      h('button', { type: 'button', class: 'btn btn-ghost btn-icon', title: 'Previous date (Alt+Left)', 'aria-label': 'Previous date', onClick: () => step(-1) }, ic('chevronRight', { className: 'icon flip' })),
      playButton,
      h('button', { type: 'button', class: 'btn btn-ghost btn-icon', title: 'Next date (Alt+Right)', 'aria-label': 'Next date', onClick: () => step(1) }, ic('chevronRight'))),
    stopsEl,
    h('div', { class: 'dock-info', 'aria-live': 'polite' }, dockDate, dockDesc, dockEvent));

  function renderTimeline(eventStatus) {
    const inv = current();
    if (!inv) return;
    const multiYear = new Set(inv.timeline.map((stop) => stop.date.slice(0, 4))).size > 1;
    mount(stopsEl, ...inv.timeline.map((stop, i) => h('li', null, h('button', {
      type: 'button',
      class: `stop${i === st.dateIndex ? ' active' : ''}${i < st.dateIndex ? ' past' : ''}`,
      'aria-current': i === st.dateIndex ? 'step' : null,
      title: `${formatDateLong(stop.date)}${stop.desc ? ` · ${stop.desc}` : ''}`,
      'aria-label': `${formatDateLong(stop.date)}${stop.desc ? `. ${stop.desc}` : ''}`,
      onClick: () => setDate(i)
    }, h('span', { class: 'stop-dot' }), h('span', { class: 'stop-date mono' }, multiYear ? formatDate(stop.date) : formatDateShort(stop.date))))));
    const stop = inv.timeline[st.dateIndex];
    dockDate.textContent = formatDateLong(stop.date);
    dockDesc.textContent = stop.desc || '';
    dockEvent.textContent = eventStatus ? eventStatus.label : '';
    dockEvent.hidden = !eventStatus;
    playButton.replaceChildren(ic(st.playTimer ? 'pause' : 'play'));
    playButton.setAttribute('aria-label', st.playTimer ? 'Pause' : 'Play through the dates');
    renderCompareLabels();
  }

  function renderCompareLabels() {
    const inv = current();
    if (!inv) return;
    const open = Boolean(map?.layers.compare);
    compareLayer.hidden = !open;
    compareButton.setAttribute('aria-pressed', String(open));
    compareButton.classList.toggle('active', open);
    if (!open) { compareHint.hidden = true; return; }
    beforeLabel.textContent = `Before · ${formatDate(inv.timeline[0].date)}`;
    afterLabel.textContent = `After · ${formatDate(inv.timeline[st.dateIndex].date)}`;
    compareHint.hidden = st.dateIndex !== 0;
    describeSplit();
  }

  /* ------------------------------------------------------------------ */
  /* Right column: inspector                                             */
  /* ------------------------------------------------------------------ */

  const tabButtons = new Map();
  const panelEl = h('div', { class: 'tab-panel', role: 'tabpanel', tabindex: '0' });
  const tabsEl = h('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Inspector' },
    TABS.map((tab) => {
      const button = h('button', { type: 'button', role: 'tab', class: 'tab', id: `tab-${tab.id}`, onClick: () => setTab(tab.id), onKeydown: tabKeys }, ic(tab.icon, { size: 16 }), tab.label);
      tabButtons.set(tab.id, button);
      return button;
    }));
  function tabKeys(event) {
    const index = TABS.findIndex((t) => t.id === st.tab);
    const next = { ArrowRight: index + 1, ArrowLeft: index - 1 }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    const tab = TABS[(next + TABS.length) % TABS.length];
    setTab(tab.id);
    tabButtons.get(tab.id).focus();
  }
  const inspector = h('aside', { class: 'ex-inspector' },
    h('div', { class: 'inspector-head' }, tabsEl,
      h('button', { type: 'button', class: 'btn btn-ghost btn-icon', title: 'Hide side panel (Ctrl/Cmd+\\)', 'aria-label': 'Hide side panel', onClick: () => toggleInspector() }, ic('chevronRight'))),
    panelEl);

  const reopen = h('button', { type: 'button', hidden: true, class: 'inspector-reopen btn', 'aria-label': 'Show side panel', onClick: () => toggleInspector(true) }, ic('chevronRight', { className: 'icon flip' }), 'Panel');

  function setTab(id) {
    st.tab = id;
    for (const [key, button] of tabButtons) {
      button.setAttribute('aria-selected', String(key === id));
      button.tabIndex = key === id ? 0 : -1;
      button.classList.toggle('active', key === id);
    }
    panelEl.setAttribute('aria-labelledby', `tab-${id}`);
    renderPanel();
  }

  function renderPanel() {
    const inv = current();
    if (!inv) { mount(panelEl); return; }
    if (st.tab === 'report') mount(panelEl, reportPanel(inv));
    else if (st.tab === 'notes') mount(panelEl, notesPanel(inv));
    else mount(panelEl, askPanel(inv));
    if (st.tab === 'ask') scrollChat();
  }

  /* ---- report ---- */
  function reportPanel(inv) {
    const topic = topicInfo(inv.topic);
    const stop = inv.timeline[st.dateIndex];
    const kind = inv.kind === 'demo' ? 'Demo' : inv.kind === 'event' ? 'Event' : 'Yours';
    return h('div', { class: 'report' },
      h('div', { class: 'report-hero' }, terrainArt(inv.id, inv.topic, { width: 380, height: 150 }),
        h('div', { class: 'report-hero-text' }, h('span', { class: 'pill' }, topic.label), h('span', { class: 'pill pill-amber' }, kind))),
      h('div', { class: 'report-title' },
        h('h2', null, inv.title),
        h('button', { type: 'button', class: 'btn btn-ghost btn-icon', title: 'Rename', 'aria-label': 'Rename investigation', onClick: () => rename(inv) }, ic('edit', { size: 16 }))),
      h('p', { class: 'muted small' }, describeInvestigation(inv)),
      h('p', { class: 'summary' }, inv.summary || 'No summary yet.'),
      h('div', { class: 'callout' }, h('span', { class: 'mark' }, ic('sparkle', { size: 16 })),
        h('div', null, h('strong', null, inv.callout), h('p', null, `${inv.legend.title}. ${inv.legend.subtitle}.`))),
      h('div', { class: 'button-row' },
        h('button', { type: 'button', class: 'btn', onClick: () => actions.exportReport(inv.id) }, ic('download', { size: 16 }), 'Export report'),
        h('button', { type: 'button', class: 'btn', onClick: () => platform.openExternal(worldviewUrl(inv.center[0], inv.center[1], stop.date)) }, ic('external', { size: 16 }), 'Open in Worldview')),
      h('div', { class: 'section-label' }, 'Evidence trail'),
      inv.evidence.map(evidenceRow),
      h('div', { class: 'section-label' }, 'Suggested next steps'),
      inv.steps.map((s, i) => h('div', { class: 'step-row' }, h('span', { class: 'num' }, String(i + 1).padStart(2, '0')), h('div', { class: 'body' }, h('strong', null, s.title), h('small', null, s.detail)))),
      h('div', { class: 'section-label' }, 'How sure can we be?'),
      confidence('observed', 'Observed', 'What NASA’s imagery shows on the dates you select, at about 250 m per pixel.'),
      confidence('inferred', 'Inferred', 'Anything you read into the differences between dates. Treat it as a hypothesis.'),
      confidence('unknown', 'Not known', 'Causes, exact extent and impact, until independent data confirms them.'));
  }

  function evidenceRow(e) {
    const row = ui.link(e.url, h('span', { class: 'badge' }, e.badge || 'LINK'), h('span', { class: 'body' }, h('strong', null, e.title), h('small', null, e.detail)), ic('external', { size: 14 }));
    row.classList.add('evidence-row');
    return row;
  }

  function confidence(kind, title, text) {
    return h('div', { class: 'confidence' }, h('i', { class: kind }), h('div', null, h('strong', null, title), h('small', null, text)));
  }

  async function rename(inv) {
    const title = await ui.prompt({ title: 'Rename investigation', label: 'Name', value: inv.title });
    if (title && title !== inv.title) {
      try { store.update(inv.id, { title }); } catch (error) { ui.toast(error.message, { error: true }); }
    }
  }

  /* ---- notes ---- */
  const noteText = h('textarea', { class: 'textarea', rows: '3', maxlength: '2000', placeholder: 'What did you see? Which date? What would you check next?', 'aria-label': 'New note' });
  const noteLocation = h('div', { class: 'note-location', hidden: true });
  const noteList = h('div', { class: 'note-list' });

  function notesPanel(inv) {
    renderNoteLocation();
    renderNoteList(inv);
    return h('div', { class: 'notes-panel' },
      h('div', { class: 'composer' },
        noteText, noteLocation,
        h('div', { class: 'button-row' },
          h('button', { type: 'button', class: `btn${st.pinMode ? ' active' : ''}`, onClick: () => setPinMode(!st.pinMode) }, ic('pin', { size: 16 }), st.draft ? 'Move pin' : 'Pin to map'),
          h('button', { type: 'button', class: 'btn btn-primary', onClick: addNote }, 'Add note'))),
      h('div', { class: 'section-label' }, `Field notes (${store.notes(inv.id).length})`),
      noteList);
  }

  function renderNoteLocation() {
    noteLocation.hidden = !st.draft;
    if (!st.draft) return;
    mount(noteLocation, ic('pin', { size: 14 }), h('span', { class: 'mono' }, formatLatLng(st.draft.lat, st.draft.lng, 4)),
      h('button', { type: 'button', class: 'btn btn-ghost', onClick: () => setDraft(null) }, 'Remove'));
  }

  function renderNoteList(inv) {
    const notes = store.notes(inv.id);
    if (!notes.length) { mount(noteList, h('p', { class: 'empty-note muted' }, 'No notes yet. Notes stay on this computer and are included in exported reports.')); return; }
    mount(noteList, ...notes.map((note) => h('div', { class: 'note', id: `note-${note.id}` },
      h('p', null, note.text),
      h('footer', null,
        h('span', null, formatDateLong(note.createdAt.slice(0, 10))),
        note.dateIndex !== undefined && inv.timeline[note.dateIndex] ? h('span', null, `· imagery ${formatDate(inv.timeline[note.dateIndex].date)}`) : null,
        h('span', { class: 'spacer' }),
        note.lat !== undefined ? h('button', { type: 'button', class: 'btn btn-ghost btn-icon', title: `Show on map (${formatLatLng(note.lat, note.lng, 3)})`, 'aria-label': 'Show on map', onClick: () => { map.moveTo([note.lat, note.lng], Math.max(map.map.getZoom(), 8)); setTimeout(() => map.openPopupForNote(note.id), 800); } }, ic('pin', { size: 14 })) : null,
        h('button', { type: 'button', class: 'btn btn-ghost btn-icon', title: 'Delete note', 'aria-label': 'Delete note', onClick: () => deleteNote(inv, note) }, ic('trash', { size: 14 }))))));
  }

  function addNote() {
    const inv = current();
    if (!inv) return;
    try {
      store.addNote(inv.id, { text: noteText.value, lat: st.draft?.lat, lng: st.draft?.lng, dateIndex: st.dateIndex });
      noteText.value = '';
      setDraft(null);
      ui.toast('Note added.');
    } catch (error) {
      if (error instanceof ValidationError) { ui.toast(error.message, { error: true }); noteText.focus(); } else throw error;
    }
  }

  async function deleteNote(inv, note) {
    const ok = await ui.confirm({ title: 'Delete this note?', message: note.text.length > 140 ? `${note.text.slice(0, 140)}…` : note.text, confirmLabel: 'Delete', danger: true });
    if (ok) store.removeNote(inv.id, note.id);
  }

  function setPinMode(on) {
    st.pinMode = on;
    mapCanvas.classList.toggle('pin-mode', on);
    pinButton.setAttribute('aria-pressed', String(on));
    pinButton.classList.toggle('active', on);
    pinHint.hidden = !on;
    if (on && !st.inspectorOpen) toggleInspector(true);
    if (on && st.tab !== 'notes') setTab('notes');
  }

  function setDraft(point) {
    st.draft = point;
    map?.setDraftPin(point);
    renderNoteLocation();
    if (st.tab === 'notes') renderPanel();
  }

  /* ---- ask ---- */
  const chatInput = h('textarea', { class: 'textarea chat-input', rows: '2', maxlength: '1000', placeholder: 'Ask about this investigation…', 'aria-label': 'Question for ECHO' });
  const chatLog = h('div', { class: 'chat-log', 'aria-live': 'polite' });
  const modeNote = h('p', { class: 'mode-note' });

  chatInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); send(); }
  });

  function askPanel(inv) {
    const live = Boolean(store.settings().chatEndpoint);
    modeNote.className = `mode-note${live ? ' live' : ''}`;
    modeNote.textContent = live ? 'Connected to your AI service. Answers can be wrong, so check them against the sources.' : 'Using the built-in research guide. It gives method advice, not measurements. Add an AI service in Settings for live answers.';
    renderChat(inv);
    return h('div', { class: 'ask-panel' },
      chatLog,
      h('div', { class: 'chat-suggestions' }, SUGGESTIONS.map((text) => h('button', { type: 'button', class: 'chip', onClick: () => send(text) }, text))),
      h('div', { class: 'chat-compose' }, chatInput, h('button', { type: 'button', class: 'btn btn-primary btn-icon', 'aria-label': 'Send', title: 'Send (Enter)', onClick: () => send() }, ic('send'))),
      modeNote);
  }

  function renderChat(inv, thinking = false) {
    const history = session.history(inv.id);
    if (!history.length && !thinking) {
      mount(chatLog, h('div', { class: 'chat-empty' }, ic('sparkle', { size: 22 }), h('strong', null, 'Ask ECHO'), h('p', null, 'Ask what the sources support, how to map the extent, or what to check next. ECHO knows this investigation’s summary, evidence and your notes.')));
      return;
    }
    mount(chatLog, ...history.map((m) => (m.role === 'user' ? userBubble(m) : botBubble(m))),
      thinking ? h('div', { class: 'msg thinking' }, h('span', { class: 'avatar' }, ic('sparkle', { size: 14 })), h('div', { class: 'bubble' }, h('strong', null, 'ECHO'), h('p', null, 'Thinking…'))) : null);
  }

  const userBubble = (m) => h('div', { class: 'msg user' }, h('div', { class: 'bubble' }, h('p', null, m.content)));
  const botBubble = (m) => h('div', { class: 'msg' }, h('span', { class: 'avatar' }, ic('sparkle', { size: 14 })),
    h('div', { class: 'bubble' },
      h('strong', null, m.title || 'ECHO'),
      h('p', null, m.content),
      m.links?.length ? h('div', { class: 'links' }, m.links.map(([title, url]) => ui.link(url, `${title} ↗`))) : null,
      m.fallbackReason ? h('p', { class: 'mode-note' }, `${m.fallbackReason} Showing the built-in guide instead.`) : null));

  function scrollChat() { requestAnimationFrame(() => { chatLog.scrollTop = chatLog.scrollHeight; }); }

  async function send(preset) {
    const inv = current();
    const text = String(preset ?? chatInput.value).trim();
    if (!inv || !text || st.sending) return;
    st.sending = true;
    const promise = session.send(inv.id, text, { dateIso: map?.currentDate() });
    chatInput.value = '';
    renderChat(inv, true);
    scrollChat();
    try {
      await promise;
    } catch (error) {
      ui.toast(error.message, { error: true });
    } finally {
      st.sending = false;
      if (st.id === inv.id && st.tab === 'ask') { renderChat(inv); scrollChat(); }
    }
  }

  /* ------------------------------------------------------------------ */
  /* Behaviour                                                           */
  /* ------------------------------------------------------------------ */

  const empty = h('div', { class: 'empty-state', hidden: true },
    ic('explore', { size: 36 }), h('h2', null, 'Nothing to explore yet'),
    h('p', { class: 'muted' }, 'Create an investigation around any place on Earth, or start from a live event in Planet Pulse.'),
    h('div', { class: 'button-row' },
      h('button', { type: 'button', class: 'btn btn-primary', onClick: () => app.dialogs.newInvestigation() }, 'New investigation'),
      h('button', { type: 'button', class: 'btn', onClick: () => app.go('pulse') }, 'Open Planet Pulse')));

  const main = h('div', { class: 'ex-main' }, mapStage, dock, empty);
  root.append(side, main, inspector, reopen);

  const current = () => store.get(st.id);

  function ensureMap() {
    if (map) return;
    map = new EchoMap(mapCanvas, { imagery: store.settings().imagery });
    map.on('coords', ({ lat, lng }) => { readout.textContent = formatLatLng(lat, lng, 3); });
    map.on('tileerror', () => { banner.hidden = false; });
    map.on('tileok', () => { banner.hidden = true; });
    map.on('mapclick', (point) => { if (st.pinMode) { setDraft(point); setPinMode(false); setTab('notes'); noteText.focus(); } });
    map.on('noteclick', ({ id }) => {
      if (st.tab !== 'notes') setTab('notes');
      if (!st.inspectorOpen) toggleInspector(true);
      document.getElementById(`note-${id}`)?.scrollIntoView({ block: 'nearest' });
    });
    new ResizeObserver(() => map.invalidateSize()).observe(mapCanvas);
    applySettings();
    setSplit(50);
    syncSwitches();
  }

  function applySettings() {
    const settings = store.settings();
    imagerySelect.value = settings.imagery;
    if (!map) return;
    if (map.imageryId !== settings.imagery) map.setImagery(settings.imagery);
    if (map.layers.labels !== settings.showLabels) map.setLayer('labels', settings.showLabels);
    syncSwitches();
    // Attribution and the ask tab depend on settings too.
    if (st.tab === 'ask') renderPanel();
  }

  function syncSwitches() {
    if (!map) return;
    for (const [id, input] of layerInputs) input.checked = Boolean(map.layers[id]);
  }

  function toggleLayer(id, enabled) {
    if (!map) return;
    if (id === 'labels') { store.setSettings({ showLabels: enabled }); return; }
    map.setLayer(id, enabled);
    if (id === 'compare') renderCompareLabels();
    syncSwitches();
  }

  function toggleCompare(force) {
    if (!map || !current()) return;
    const next = force ?? !map.layers.compare;
    map.setLayer('compare', next);
    if (next && st.dateIndex === 0 && current().timeline.length > 1) setDate(current().timeline.length - 1);
    syncSwitches();
    renderCompareLabels();
  }

  function select(id, { force = false } = {}) {
    const inv = store.get(id);
    if (!inv) return;
    if (!force && st.id === id && map?.investigation?.id === id) return;
    stopPlay();
    st.id = id;
    store.setActive(id);
    st.dateIndex = inv.defaultIndex;
    setDraft(null);
    setPinMode(false);
    ensureMap();
    const status = map.setInvestigation(inv, { dateIndex: st.dateIndex, notes: store.notes(id) });
    cardTitle.textContent = inv.title;
    cardSub.textContent = describeInvestigation(inv);
    cardPill.textContent = topicInfo(inv.topic).label;
    legendTitle.textContent = inv.legend.title;
    legendSub.textContent = inv.legend.subtitle;
    cardLegend.classList.toggle('illustrative', Boolean(inv.overlay?.illustrative));
    empty.hidden = true;
    mapStage.hidden = false;
    dock.hidden = false;
    renderList();
    renderTimeline(status);
    renderPanel();
  }

  function setDate(index, { keepPlaying = false } = {}) {
    const inv = current();
    if (!inv || !map) return;
    if (!keepPlaying) stopPlay();
    st.dateIndex = Math.max(0, Math.min(index, inv.timeline.length - 1));
    const status = map.setDateIndex(st.dateIndex);
    renderTimeline(status);
    if (st.tab === 'report') renderPanel();
  }

  const step = (delta) => { const inv = current(); if (inv) setDate(st.dateIndex + delta); };

  function stopPlay() {
    if (!st.playTimer) return;
    clearInterval(st.playTimer);
    st.playTimer = null;
    playButton.replaceChildren(ic('play'));
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
    playButton.replaceChildren(ic('pause'));
    playButton.setAttribute('aria-label', 'Pause');
  }

  function toggleInspector(force) {
    st.inspectorOpen = force ?? !st.inspectorOpen;
    root.classList.toggle('inspector-closed', !st.inspectorOpen);
    reopen.hidden = st.inspectorOpen;
    setTimeout(() => map?.invalidateSize(), 260);
  }

  function showEmpty() {
    st.id = null;
    stopPlay();
    empty.hidden = false;
    mapStage.hidden = true;
    dock.hidden = true;
    renderList();
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
        if (!active) { showEmpty(); break; }
        if (!inv || active.id !== st.id) select(active.id); else renderList();
        break;
      }
      case 'update': {
        if (!inv) break;
        cardTitle.textContent = inv.title;
        cardSub.textContent = describeInvestigation(inv);
        renderList();
        if (st.tab === 'report') renderPanel();
        break;
      }
      case 'notes':
        if (inv) { map?.drawNotes(store.notes(inv.id)); renderList(); if (st.tab === 'notes') renderPanel(); }
        break;
      case 'settings': applySettings(); break;
      case 'active': renderList(); break;
      default: break;
    }
  }
  store.subscribe(onStoreEvent);

  function handleKey(event) {
    if (!st.visible) return false;
    if (event.key === 'Escape') {
      if (st.pinMode) { setPinMode(false); return true; }
      if (st.draft) { setDraft(null); return true; }
      return false;
    }
    const tag = event.target?.tagName;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) || event.target?.isContentEditable || event.target === handle) return false;
    if (event.ctrlKey || event.metaKey || event.altKey) return false;
    if (event.key === 'ArrowLeft') { step(-1); return true; }
    if (event.key === 'ArrowRight') { step(1); return true; }
    if (event.key === ' ' && tag !== 'BUTTON') { togglePlay(); return true; }
    return false;
  }

  setTab('report');

  return {
    el: root,
    name: 'explore',
    show() {
      st.visible = true;
      ensureMap();
      map.invalidateSize(); // the view was hidden: pick up the real size before anything moves the map
      const active = store.active();
      if (!active) showEmpty();
      else if (st.dirty || st.id !== active.id || !map.investigation) { st.dirty = false; select(active.id, { force: true }); }
      requestAnimationFrame(() => map.invalidateSize());
    },
    hide() { st.visible = false; stopPlay(); },
    open(id) { select(id); },
    toggleInspector,
    toggleCompare,
    step,
    togglePlay,
    focusAsk() { toggleInspector(true); setTab('ask'); chatInput.focus(); },
    handleKey,
    mapCenter() { return map ? map.getCenter() : null; }
  };
}
