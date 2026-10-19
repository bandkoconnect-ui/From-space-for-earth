// The phone's sheets: new investigation, settings, about the data, and the investigation switcher.

import {
  IMAGERY_LAYERS, TOPICS, TOPIC_ORDER, ValidationError, askLive, createInvestigation, describeInvestigation,
  normalizeEndpoint, parseCoordinates
} from '../shared/core/src/index.js';
import { h, ic } from '../shared/ui/dom.js';
import { terrainArt } from '../shared/ui/art.js';
import { aboutDataContent } from '../shared/ui/about-data.js';

const RADIUS_CHOICES = [5, 10, 25, 50, 100, 200];

export function createSheets(app) {
  const { store, ui, platform, actions } = app;

  /** A horizontally scrolling row of single-choice chips. */
  function choiceChips(options, selected, onChange, label) {
    const row = h('div', { class: 'chip-row', role: 'radiogroup', 'aria-label': label });
    const render = (value) => {
      row.replaceChildren(...options.map((option) => h('button', {
        type: 'button', role: 'radio', class: `chip${option.value === value ? ' active' : ''}`, 'aria-checked': String(option.value === value),
        onClick: () => { platform.haptic(); onChange(option.value); render(option.value); }
      }, option.label)));
    };
    render(selected);
    return row;
  }

  /* ---------- new investigation ---------- */
  function newInvestigation(draft = {}) {
    const state = { topic: draft.topic || 'environment', radius: draft.radius || 25 };
    const titleInput = h('input', { class: 'input', type: 'text', maxlength: 80, required: true, value: draft.title || '', placeholder: 'e.g. Lake shrinkage near my village', enterkeyhint: 'next', autocomplete: 'off', 'aria-label': 'Name' });
    const locationInput = h('input', { class: 'input mono', type: 'text', inputmode: 'text', autocomplete: 'off', spellcheck: 'false', placeholder: '27.7172, 85.3240', value: draft.location || '', enterkeyhint: 'done', 'aria-label': 'Location as latitude, longitude' });
    const error = h('div', { class: 'field-error', role: 'alert' });
    const locateButton = h('button', { type: 'button', class: 'btn btn-block', onClick: async () => {
      locateButton.disabled = true;
      const label = locateButton.lastChild;
      label.textContent = 'Locating…';
      try {
        const spot = await platform.getPosition();
        locationInput.value = `${spot.lat.toFixed(4)}, ${spot.lng.toFixed(4)}`;
        error.textContent = '';
      } catch (e) {
        error.textContent = e.message;
      } finally {
        locateButton.disabled = false;
        label.textContent = 'My location';
      }
    } }, ic('locate', { size: 18 }), h('span', null, 'My location'));

    const pick = async () => {
      const keep = { title: titleInput.value, topic: state.topic, radius: state.radius, location: locationInput.value };
      handle.close('pick');
      await handle.closed;
      const spot = await app.pickLocation();
      newInvestigation({ ...keep, location: spot ? `${spot.lat.toFixed(4)}, ${spot.lng.toFixed(4)}` : keep.location });
    };

    const body = h('div', { class: 'form-stack' },
      h('label', { class: 'field' }, 'Name', titleInput),
      h('div', { class: 'field' }, h('span', null, 'What are you looking into?'),
        choiceChips(TOPIC_ORDER.map((key) => ({ value: key, label: TOPICS[key].label })), state.topic, (v) => { state.topic = v; }, 'Topic')),
      h('div', { class: 'field' }, h('span', null, 'Where?'),
        h('div', { class: 'two-up' }, locateButton, h('button', { type: 'button', class: 'btn btn-block', onClick: pick }, ic('crosshair', { size: 18 }), h('span', null, 'Pick on map'))),
        locationInput,
        h('small', { class: 'muted' }, 'Or type coordinates: 27.7172, 85.3240 or 27.7172° N, 85.3240° E.')),
      h('div', { class: 'field' }, h('span', null, 'Area to watch (radius)'),
        choiceChips(RADIUS_CHOICES.map((km) => ({ value: km, label: `${km} km` })), state.radius, (v) => { state.radius = v; }, 'Radius')),
      error);

    const handle = ui.sheet({
      title: 'New investigation',
      className: 'sheet-tall',
      body,
      actions: [{
        label: 'Create investigation',
        kind: 'primary',
        onClick: () => {
          error.textContent = '';
          const coords = parseCoordinates(locationInput.value);
          if (!coords) { error.textContent = 'Choose a place first: use your location, pick on the map, or type latitude and longitude.'; return false; }
          try {
            const investigation = store.add(createInvestigation({ title: titleInput.value, topic: state.topic, lat: coords.lat, lng: coords.lng, radiusKm: state.radius }));
            platform.haptic('medium');
            app.openInvestigation(investigation.id);
            ui.toast('Investigation created.');
          } catch (e) {
            if (e instanceof ValidationError) { error.textContent = e.message; return false; }
            throw e;
          }
          return true;
        }
      }]
    });
    return handle;
  }

  /* ---------- settings ---------- */
  async function settings() {
    const current = store.settings();
    const info = await platform.info();
    const state = { imagery: current.imagery };
    const labels = h('input', { type: 'checkbox', checked: current.showLabels });
    const endpoint = h('input', { class: 'input mono', type: 'url', inputmode: 'url', value: current.chatEndpoint, placeholder: 'https://your-site.netlify.app/.netlify/functions/echo-chat', autocomplete: 'off', autocapitalize: 'none', spellcheck: 'false', 'aria-label': 'AI service address' });
    const status = h('div', { class: 'mode-note', role: 'status' });
    const error = h('div', { class: 'field-error', role: 'alert' });

    const test = async () => {
      status.className = 'mode-note';
      error.textContent = '';
      let url;
      try { url = normalizeEndpoint(endpoint.value); } catch (e) { error.textContent = e.message; return; }
      if (!url) { status.textContent = 'No address set. Ask ECHO uses the built-in research guide.'; return; }
      status.textContent = 'Testing…';
      try {
        const result = await askLive({ endpoint: url, timeoutMs: 15000, payload: { investigation: { title: 'Connection test', topic: 'other', date: '', sourceText: '', evidence: [], notes: [] }, messages: [{ role: 'user', content: 'Reply with the single word: ready' }] } });
        status.className = 'mode-note live';
        status.textContent = `Connected. The service replied: “${result.text.slice(0, 80)}”`;
      } catch (e) {
        status.textContent = '';
        error.textContent = `Could not use that address (${e.name === 'AbortError' ? 'it took too long' : e.message}).`;
      }
    };

    const body = h('div', { class: 'form-stack settings' },
      h('section', null,
        h('h3', null, 'Map'),
        h('div', { class: 'field' }, h('span', null, 'Satellite imagery'),
          choiceChips(IMAGERY_LAYERS.map((layer) => ({ value: layer.id, label: layer.label })), state.imagery, (v) => { state.imagery = v; }, 'Satellite imagery')),
        h('label', { class: 'switch-row' }, h('span', null, 'Show place names'), labels, h('span', { class: 'switch' }))),
      h('section', null,
        h('h3', null, 'Ask ECHO'),
        h('p', { class: 'muted small' }, 'Without an AI service, Ask ECHO gives built-in research guidance. For live answers, enter the address of your own server (see docs/ARCHITECTURE.md). Questions and the investigation’s summary are sent there and nowhere else. Never put an API key in this app.'),
        h('label', { class: 'field' }, 'AI service address (optional)', endpoint),
        h('button', { type: 'button', class: 'btn', onClick: test }, 'Test connection'),
        status),
      h('section', null,
        h('h3', null, 'Your data'),
        h('p', { class: 'muted small' }, `Investigations and notes are stored on this phone only (${info.dataFile}).`),
        h('div', { class: 'stack-buttons' },
          h('button', { type: 'button', class: 'btn', onClick: () => actions.exportWorkspace() }, ic('download', { size: 18 }), 'Export a backup'),
          h('button', { type: 'button', class: 'btn', onClick: () => actions.importWorkspace() }, ic('upload', { size: 18 }), 'Import a backup'),
          h('button', { type: 'button', class: 'btn', onClick: () => { const n = store.restoreDemos(); ui.toast(n ? `Restored ${n} demo investigation${n === 1 ? '' : 's'}.` : 'Both demo investigations are already there.'); } }, 'Restore demo investigations'),
          h('button', {
            type: 'button', class: 'btn btn-danger',
            onClick: async () => {
              const ok = await ui.confirm({ title: 'Erase all data?', message: 'This deletes every investigation and note on this phone and restores the two demos. Export a backup first if you might want them back.', confirmLabel: 'Erase everything', danger: true });
              if (ok) { store.reset(); ui.toast('All data erased. Demos restored.'); }
            }
          }, ic('trash', { size: 18 }), 'Erase all data'))),
      h('section', null,
        h('h3', null, 'About'),
        h('button', { type: 'button', class: 'btn', onClick: aboutData }, ic('info', { size: 18 }), 'About the data'),
        h('p', { class: 'muted small' }, `ECHO ${info.version} · ${info.platform}. Imagery © NASA GIBS and Esri and its data providers. Event data © NASA EONET. Map engine: Leaflet.`)),
      error);

    ui.sheet({
      title: 'Settings',
      className: 'sheet-tall',
      body,
      actions: [{
        label: 'Save settings',
        kind: 'primary',
        onClick: () => {
          try {
            store.setSettings({ imagery: state.imagery, showLabels: labels.checked, chatEndpoint: endpoint.value });
            ui.toast('Settings saved.');
            return true;
          } catch (e) {
            if (e instanceof ValidationError) { error.textContent = e.message; endpoint.focus(); return false; }
            throw e;
          }
        }
      }]
    });
  }

  /* ---------- about the data ---------- */
  function aboutData() {
    const content = aboutDataContent('phone');
    ui.sheet({
      title: 'About the data',
      className: 'sheet-tall',
      body: h('div', { class: 'about' },
        h('p', { class: 'lead' }, content.lead),
        content.items.map((item) => h('div', { class: 'about-item' }, h('strong', null, item.title), h('p', null, item.text))),
        h('div', { class: 'link-list' }, content.links.map((l) => ui.link(l.url, ic('external', { size: 16 }), l.label)))),
      actions: [{ label: 'Done', kind: 'primary' }]
    });
  }

  /* ---------- investigation switcher ---------- */
  function switcher() {
    const active = store.active();
    const list = store.list();
    const body = h('div', { class: 'switcher' }, list.length
      ? list.map((inv) => h('button', { type: 'button', class: `switch-item${inv.id === active?.id ? ' selected' : ''}`, onClick: () => { platform.haptic(); handle.close(); app.openInvestigation(inv.id); } },
        h('span', { class: 'thumb' }, terrainArt(inv.id, inv.topic, { width: 112, height: 112 })),
        h('span', { class: 'text' }, h('strong', null, inv.title), h('small', null, describeInvestigation(inv))),
        inv.id === active?.id ? ic('chevronRight', { size: 18 }) : null))
      : h('p', { class: 'muted' }, 'You have no investigations yet.'));
    const handle = ui.sheet({
      title: 'Investigations',
      className: 'sheet-tall',
      body,
      actions: [{ label: 'New investigation', kind: 'primary', onClick: () => { handle.close(); newInvestigation(); return false; } }]
    });
  }

  return { newInvestigation, settings, aboutData, switcher, choiceChips };
}
