// Settings, About the data, and New investigation, as modal dialogs.

import { h } from '../../../packages/ui/dom.js';
import { IMAGERY_LAYERS, TOPICS, TOPIC_ORDER, ValidationError, askLive, createInvestigation, formatLatLng, normalizeEndpoint, parseCoordinates } from '../../../packages/core/src/index.js';
import { aboutDataContent } from '../../../packages/ui/about-data.js';
import { ic } from './ui.js';

const RADIUS_CHOICES = [5, 10, 25, 50, 100, 200];

function choiceChips(options, selected, onChange, label) {
  const row = h('div', { class: 'chips wrap', role: 'radiogroup', 'aria-label': label });
  const render = (value) => row.replaceChildren(...options.map((o) => h('button', {
    type: 'button', role: 'radio', class: `chip${o.value === value ? ' is-on' : ''}`, 'aria-checked': String(o.value === value),
    onClick: () => { onChange(o.value); render(o.value); }
  }, o.label)));
  render(selected);
  return row;
}

export function createDialogs(app) {
  const { ui, store, actions } = app;

  function about() {
    const content = aboutDataContent('device');
    ui.modal({
      title: 'About the data',
      className: 'modal-wide',
      body: h('div', { class: 'about' },
        h('p', { class: 'modal-lead' }, content.lead),
        content.items.map((item) => h('div', { class: 'about-item' }, h('h3', null, item.title), h('p', null, item.text))),
        h('div', { class: 'about-item' }, h('h3', null, 'Place search'), h('p', null, 'Search uses Photon (OpenStreetMap data) and, if that is unavailable, Open-Meteo (GeoNames data). What you type is sent to that service to find places. Events and coordinates are matched on your device.')),
        h('div', { class: 'about-item' }, h('h3', null, 'Day and night'), h('p', null, 'The shaded half of the world is where the Sun is down right now, calculated on your device from the date and time.')),
        h('ul', { class: 'about-links' }, content.links.map((l) => h('li', null, h('a', { href: l.url, target: '_blank', rel: 'noopener noreferrer' }, l.label, ic('external', { size: 13 })))))),
      actions: [{ label: 'Done', kind: 'primary' }]
    });
  }

  async function settings() {
    const current = store.settings();
    const info = await app.platform.info();
    const state = { imagery: current.imagery };
    const labels = h('input', { type: 'checkbox', checked: current.showLabels });
    const night = h('input', { type: 'checkbox', checked: app.state.layers.night });
    const endpoint = h('input', { class: 'input mono', type: 'url', inputmode: 'url', value: current.chatEndpoint, placeholder: 'https://your-site.netlify.app/.netlify/functions/echo-chat', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'AI service address' });
    const status = h('p', { class: 'rs-note', role: 'status' });
    const error = h('p', { class: 'field-error', role: 'alert' });

    async function test() {
      error.textContent = '';
      let url;
      try { url = normalizeEndpoint(endpoint.value); } catch (e) { error.textContent = e.message; return; }
      if (!url) { status.textContent = 'No address set. Ask ECHO uses the built-in research guide.'; return; }
      status.textContent = 'Testing…';
      try {
        const result = await askLive({ endpoint: url, timeoutMs: 15000, payload: { investigation: { title: 'Connection test', topic: 'other', date: '', sourceText: '', evidence: [], notes: [] }, messages: [{ role: 'user', content: 'Reply with the single word: ready' }] } });
        status.textContent = `Connected. The service replied: “${result.text.slice(0, 80)}”`;
      } catch (e) {
        status.textContent = '';
        error.textContent = `That address did not work (${e.name === 'AbortError' ? 'no reply in time' : e.message}).`;
      }
    }

    const body = h('div', { class: 'settings' },
      h('section', null, h('h3', null, 'Map'),
        h('div', { class: 'field' }, h('span', null, 'NASA imagery source'), choiceChips(IMAGERY_LAYERS.map((l) => ({ value: l.id, label: l.label })), state.imagery, (v) => { state.imagery = v; }, 'NASA imagery source')),
        h('label', { class: 'switch-row' }, labels, h('span', { class: 'switch' }), h('span', null, 'Place names')),
        h('label', { class: 'switch-row' }, night, h('span', { class: 'switch' }), h('span', null, 'Day and night shading'))),
      h('section', null, h('h3', null, 'Ask ECHO'),
        h('p', { class: 'rs-note' }, 'Without an AI service, Ask ECHO gives built-in research guidance. For live answers, enter the address of a server you run (see docs/WEB_APP.md). Never put an API key in this page.'),
        h('label', { class: 'field' }, h('span', null, 'AI service address (optional)'), endpoint),
        h('button', { type: 'button', class: 'btn btn-small', onClick: test }, 'Test connection'), status),
      h('section', null, h('h3', null, 'Your data'),
        h('p', { class: 'rs-note' }, `Saved investigations and notes are stored in ${info.dataFile}. Clearing your browser data removes them, so export a backup now and then.`),
        h('div', { class: 'button-stack' },
          h('button', { type: 'button', class: 'btn', onClick: () => actions.exportWorkspace() }, ic('download', { size: 16 }), 'Export a backup'),
          h('button', { type: 'button', class: 'btn', onClick: () => actions.importWorkspace() }, ic('upload', { size: 16 }), 'Import a backup'),
          h('button', { type: 'button', class: 'btn', onClick: () => { const n = store.restoreDemos(); ui.toast(n ? `Restored ${n} case ${n === 1 ? 'study' : 'studies'}.` : 'Both case studies are already there.'); } }, 'Restore case studies'),
          h('button', { type: 'button', class: 'btn btn-danger', onClick: async () => {
            if (await ui.confirm({ title: 'Erase all saved data?', message: 'This deletes every saved investigation and note in this browser and restores the case studies. Export a backup first if you might want them back.', confirmLabel: 'Erase everything', danger: true })) {
              app.closeReport();
              store.reset();
              ui.toast('All saved data erased.');
            }
          } }, ic('trash', { size: 16 }), 'Erase all saved data'))),
      error);

    ui.modal({
      title: 'Settings', className: 'modal-wide', body,
      actions: [{ label: 'Cancel', kind: 'quiet' }, {
        label: 'Save settings', kind: 'primary', onClick: () => {
          try {
            store.setSettings({ imagery: state.imagery, showLabels: labels.checked, chatEndpoint: endpoint.value });
            app.setNight(night.checked);
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

  /** New investigation at a spot (from pick mode, a search result or a right-click). */
  function newInvestigation({ lat, lng, name = '' } = {}) {
    const st = { topic: 'environment', radius: 25 };
    const title = h('input', { class: 'input', type: 'text', maxlength: 80, value: name, placeholder: 'e.g. Lake levels near Pokhara', 'aria-label': 'Name', autofocus: true, autocomplete: 'off' });
    const where = h('input', { class: 'input mono', type: 'text', value: Number.isFinite(lat) ? `${lat.toFixed(4)}, ${lng.toFixed(4)}` : '', 'aria-label': 'Location as latitude, longitude', autocomplete: 'off', spellcheck: 'false' });
    const error = h('p', { class: 'field-error', role: 'alert' });
    const body = h('div', { class: 'form-stack' },
      h('label', { class: 'field' }, h('span', null, 'Name'), title),
      h('div', { class: 'field' }, h('span', null, 'What are you looking into?'), choiceChips(TOPIC_ORDER.map((k) => ({ value: k, label: TOPICS[k].label })), st.topic, (v) => { st.topic = v; }, 'Topic')),
      h('label', { class: 'field' }, h('span', null, 'Where'), where, h('small', { class: 'rs-note' }, Number.isFinite(lat) ? formatLatLng(lat, lng, 3) : 'Latitude and longitude, e.g. 27.7172, 85.3240')),
      h('div', { class: 'field' }, h('span', null, 'Area to watch'), choiceChips(RADIUS_CHOICES.map((km) => ({ value: km, label: `${km} km` })), st.radius, (v) => { st.radius = v; }, 'Radius')),
      h('p', { class: 'rs-note' }, 'ECHO sets up four dates over the last seven weeks so you can compare NASA imagery. Nothing is measured automatically.'),
      error);
    ui.modal({
      title: 'Investigate a place', body,
      actions: [{ label: 'Cancel', kind: 'quiet' }, {
        label: 'Create investigation', kind: 'primary', onClick: () => {
          error.textContent = '';
          const c = parseCoordinates(where.value);
          if (!c) { error.textContent = 'Enter the location as latitude, longitude.'; where.focus(); return false; }
          try {
            const inv = store.add(createInvestigation({ title: title.value, topic: st.topic, lat: c.lat, lng: c.lng, radiusKm: st.radius }), { activate: false });
            app.openInvestigation(inv.id);
            ui.toast('Investigation saved on this device.');
            return true;
          } catch (e) {
            if (e instanceof ValidationError) { error.textContent = e.message; return false; }
            throw e;
          }
        }
      }]
    });
  }

  return { about, settings, newInvestigation };
}
