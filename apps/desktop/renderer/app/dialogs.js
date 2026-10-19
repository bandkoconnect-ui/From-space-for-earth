// Modal dialogs: new investigation, settings, about the data, about ECHO.

import {
  IMAGERY_LAYERS, TOPICS, TOPIC_ORDER, ValidationError, askLive, createInvestigation,
  normalizeEndpoint, parseCoordinates
} from '../shared/core/src/index.js';
import { h, ic } from '../shared/ui/dom.js';
import { aboutDataContent } from '../shared/ui/about-data.js';

const RADIUS_CHOICES = [5, 10, 25, 50, 100, 200];

export function createDialogs(app) {
  const { store, ui, platform, actions } = app;

  /* ---------- new investigation ---------- */
  function newInvestigation({ title = '', topic = 'environment', lat, lng } = {}) {
    const titleInput = h('input', { class: 'input', type: 'text', maxlength: 80, required: true, value: title, placeholder: 'e.g. Lake shrinkage near my village', 'aria-describedby': 'new-title-help' });
    const topicSelect = h('select', { class: 'select' }, TOPIC_ORDER.map((key) => h('option', { value: key, selected: key === topic }, TOPICS[key].label)));
    const locationInput = h('input', {
      class: 'input mono', type: 'text', required: true, autocomplete: 'off', spellcheck: 'false',
      placeholder: '27.7172, 85.3240', value: Number.isFinite(lat) && Number.isFinite(lng) ? `${lat.toFixed(4)}, ${lng.toFixed(4)}` : '',
      'aria-describedby': 'new-location-help'
    });
    const radiusSelect = h('select', { class: 'select' }, RADIUS_CHOICES.map((km) => h('option', { value: km, selected: km === 25 }, `${km} km`)));
    const error = h('div', { class: 'field-error', role: 'alert' });

    const useMap = app.mapCenter
      ? h('button', {
        type: 'button', class: 'btn btn-ghost',
        onClick: () => {
          const center = app.mapCenter();
          if (!center) { ui.toast('Open the Explore map first.', { error: true }); return; }
          locationInput.value = `${center.lat.toFixed(4)}, ${center.lng.toFixed(4)}`;
          locationInput.focus();
        }
      }, ic('crosshair', { size: 16 }), 'Use map centre')
      : null;

    const body = h('div', { class: 'form-grid' },
      h('label', { class: 'field' }, 'Name', titleInput, h('small', { id: 'new-title-help', class: 'muted' }, 'Up to 80 characters.')),
      h('label', { class: 'field' }, 'What are you looking into?', topicSelect),
      h('div', { class: 'field' },
        h('label', { class: 'field' }, 'Location (latitude, longitude)', locationInput),
        h('div', { class: 'field-row' }, h('small', { id: 'new-location-help', class: 'muted' }, 'Paste coordinates from any map, for example 27.7172, 85.3240 or 27.7172° N, 85.3240° E.'), useMap)),
      h('label', { class: 'field' }, 'Area to watch (radius)', radiusSelect),
      error);

    ui.modal({
      title: 'New investigation',
      className: 'modal-medium',
      body,
      actions: [
        { label: 'Cancel', kind: 'ghost' },
        {
          label: 'Create investigation',
          kind: 'primary',
          onClick: () => {
            error.textContent = '';
            const coords = parseCoordinates(locationInput.value);
            if (!coords) { error.textContent = 'Enter a latitude and longitude, like 27.7172, 85.3240.'; locationInput.focus(); return false; }
            try {
              const investigation = store.add(createInvestigation({ title: titleInput.value, topic: topicSelect.value, lat: coords.lat, lng: coords.lng, radiusKm: Number(radiusSelect.value) }));
              app.openInvestigation(investigation.id);
              ui.toast('Investigation created.');
            } catch (e) {
              if (e instanceof ValidationError) { error.textContent = e.message; return false; }
              throw e;
            }
            return true;
          }
        }
      ],
      onOpen: () => titleInput.focus()
    });
  }

  /* ---------- settings ---------- */
  async function settings() {
    const current = store.settings();
    const info = await platform.info();

    const imagery = h('select', { class: 'select' }, IMAGERY_LAYERS.map((layer) => h('option', { value: layer.id, selected: layer.id === current.imagery }, `${layer.label} · ${layer.detail}`)));
    const labels = h('input', { type: 'checkbox', checked: current.showLabels });
    const endpoint = h('input', { class: 'input mono', type: 'url', value: current.chatEndpoint, placeholder: 'https://your-site.netlify.app/.netlify/functions/echo-chat', autocomplete: 'off', spellcheck: 'false' });
    const status = h('div', { class: 'mode-note', role: 'status' });
    const error = h('div', { class: 'field-error', role: 'alert' });

    const test = async () => {
      status.className = 'mode-note';
      error.textContent = '';
      let url;
      try { url = normalizeEndpoint(endpoint.value); } catch (e) { error.textContent = e.message; return; }
      if (!url) { status.textContent = 'No endpoint set. Ask ECHO uses the built-in research guide.'; return; }
      status.textContent = 'Testing…';
      try {
        const result = await askLive({
          endpoint: url,
          timeoutMs: 15000,
          payload: { investigation: { title: 'Connection test', topic: 'other', date: '', sourceText: '', evidence: [], notes: [] }, messages: [{ role: 'user', content: 'Reply with the single word: ready' }] }
        });
        status.className = 'mode-note live';
        status.textContent = `Connected. The service replied: “${result.text.slice(0, 80)}”`;
      } catch (e) {
        status.textContent = '';
        error.textContent = `Could not use that endpoint (${e.name === 'AbortError' ? 'it took too long' : e.message}).`;
      }
    };

    const body = h('div', { class: 'settings' },
      h('section', null,
        h('h3', null, 'Map'),
        h('label', { class: 'field' }, 'Satellite imagery', imagery),
        h('label', { class: 'switch-row' }, h('span', null, 'Show place names on the map'), labels, h('span', { class: 'switch' }))),
      h('section', null,
        h('h3', null, 'Ask ECHO'),
        h('p', { class: 'muted small' }, 'Without an AI service, Ask ECHO gives built-in research guidance. To get live answers, point this at your own server (see docs/ARCHITECTURE.md). Your questions and the investigation’s summary are sent there, and nowhere else. Never put an API key in this app.'),
        h('label', { class: 'field' }, 'AI service address (optional)', endpoint),
        h('div', { class: 'field-row' }, status, h('button', { type: 'button', class: 'btn', onClick: test }, 'Test connection'))),
      h('section', null,
        h('h3', null, 'Your data'),
        h('p', { class: 'muted small' }, `Investigations and notes are stored on this computer only (${info.dataFile}).`),
        h('div', { class: 'button-row' },
          h('button', { type: 'button', class: 'btn', onClick: () => actions.exportWorkspace() }, ic('download', { size: 16 }), 'Export backup'),
          h('button', { type: 'button', class: 'btn', onClick: () => actions.importWorkspace() }, ic('upload', { size: 16 }), 'Import backup'),
          h('button', { type: 'button', class: 'btn', onClick: () => { const n = store.restoreDemos(); ui.toast(n ? `Restored ${n} demo investigation${n === 1 ? '' : 's'}.` : 'Both demo investigations are already there.'); } }, 'Restore demos'),
          h('button', {
            type: 'button', class: 'btn btn-danger',
            onClick: async () => {
              const ok = await ui.confirm({ title: 'Erase all data?', message: 'This deletes every investigation and note on this computer and restores the two demos. Export a backup first if you might want them back.', confirmLabel: 'Erase everything', danger: true });
              if (ok) { store.reset(); ui.toast('All data erased. Demos restored.'); }
            }
          }, ic('trash', { size: 16 }), 'Erase all data'))),
      error);

    ui.modal({
      title: 'Settings',
      className: 'modal-large',
      body,
      actions: [
        { label: 'Cancel', kind: 'ghost' },
        {
          label: 'Save settings',
          kind: 'primary',
          onClick: () => {
            try {
              store.setSettings({ imagery: imagery.value, showLabels: labels.checked, chatEndpoint: endpoint.value });
              ui.toast('Settings saved.');
              return true;
            } catch (e) {
              if (e instanceof ValidationError) { error.textContent = e.message; endpoint.focus(); return false; }
              throw e;
            }
          }
        }
      ]
    });
  }

  /* ---------- about the data ---------- */
  function aboutData() {
    const content = aboutDataContent('computer');
    ui.modal({
      title: 'About the data',
      className: 'modal-large',
      body: h('div', { class: 'about' },
        h('p', { class: 'lead' }, content.lead),
        content.items.map((item) => h('div', { class: 'about-item' }, h('strong', null, item.title), h('p', null, item.text))),
        h('div', { class: 'button-row' }, content.links.map((l) => ui.link(l.url, ic('external', { size: 14 }), l.label)))),
      actions: [{ label: 'Done', kind: 'primary' }]
    });
  }

  /* ---------- about ECHO ---------- */
  async function about() {
    const info = await platform.info();
    ui.modal({
      title: 'ECHO',
      className: 'modal-small',
      body: h('div', { class: 'about' },
        h('p', { class: 'lead' }, 'Earth Intelligence for Everyone'),
        h('p', { class: 'muted' }, `Version ${info.version}${info.electron ? ` · Electron ${info.electron}` : ''} · ${info.platform}`),
        h('p', { class: 'muted small' }, 'Imagery © NASA GIBS and Esri and its data providers. Event data © NASA EONET. Map engine: Leaflet.')),
      actions: [{ label: 'Close', kind: 'primary' }]
    });
  }

  return { newInvestigation, settings, aboutData, about };
}
