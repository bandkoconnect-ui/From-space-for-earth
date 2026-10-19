import test from 'node:test';
import assert from 'node:assert/strict';
import { DATA_OVERLAYS, IMAGERY_LAYERS, imageryLayer, overlayLayer, wmsOptions, worldviewUrl } from '../src/gibs.js';
import { buildEventsUrl, categoryInfo, fetchEvents, normaliseEvent, normaliseEvents } from '../src/eonet.js';

const NOW = new Date(Date.UTC(2026, 9, 19, 12));

test('wmsOptions builds documented GIBS WMS parameters', () => {
  const options = wmsOptions(imageryLayer('terra'), '2026-08-12', { now: NOW, pane: 'before' });
  assert.equal(options.layers, 'MODIS_Terra_CorrectedReflectance_TrueColor');
  assert.equal(options.time, '2026-08-12');
  assert.equal(options.version, '1.1.1');
  assert.equal(options.transparent, false);
  assert.equal(options.pane, 'before');
  assert.equal(options.opacity, undefined);
});

test('wmsOptions never requests imagery from the future and rejects bad dates', () => {
  assert.equal(wmsOptions(imageryLayer('aqua'), '2027-01-01', { now: NOW }).time, '2026-10-19');
  assert.throws(() => wmsOptions(imageryLayer('aqua'), 'soon'), RangeError);
});

test('data overlays are transparent and carry their opacity', () => {
  for (const layer of DATA_OVERLAYS) {
    const options = wmsOptions(layer, '2026-08-12', { now: NOW });
    assert.equal(options.transparent, true);
    assert.equal(options.opacity, layer.opacity);
  }
  assert.equal(overlayLayer('fires').gibs, 'MODIS_Terra_Thermal_Anomalies_All');
  assert.equal(overlayLayer('missing'), null);
});

test('catalogue ids are unique and unknown imagery falls back to Terra', () => {
  const ids = [...IMAGERY_LAYERS, ...DATA_OVERLAYS].map((l) => l.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(imageryLayer('nope').id, 'terra');
});

test('worldviewUrl is a valid link with an extent and a date', () => {
  const url = new URL(worldviewUrl(28.05, 85.33, '2026-08-27', 2));
  assert.equal(url.origin, 'https://worldview.earthdata.nasa.gov');
  assert.equal(url.searchParams.get('v'), '83.330,26.050,87.330,30.050');
  assert.equal(url.searchParams.get('t'), '2026-08-27-T00:00:00Z');
});

const RAW_EVENT = {
  id: 'EONET_1234',
  title: 'Example Fire, Country',
  description: 'A fire.',
  link: 'https://eonet.gsfc.nasa.gov/api/v3/events/EONET_1234',
  closed: null,
  categories: [{ id: 'wildfires', title: 'Wildfires' }],
  sources: [{ id: 'InciWeb', url: 'https://example.org/fire' }, { id: 'bad', url: 'javascript:alert(1)' }],
  geometry: [
    { date: '2026-10-15T00:00:00Z', type: 'Point', coordinates: [-120.1, 38.2], magnitudeValue: 120, magnitudeUnit: 'acres' },
    { date: '2026-10-12T00:00:00Z', type: 'Point', coordinates: [-120.0, 38.0] },
    { date: '2026-10-17T00:00:00Z', type: 'Polygon', coordinates: [[[-120, 38], [-119, 38], [-119, 39], [-120, 39], [-120, 38]]] },
    { date: '2026-10-18T00:00:00Z', type: 'Point', coordinates: ['x', 'y'] }
  ]
};

test('normaliseEvent sorts geometry, drops unusable entries and unsafe links', () => {
  const event = normaliseEvent(RAW_EVENT);
  assert.equal(event.id, 'EONET_1234');
  assert.deepEqual(event.geometry.map((g) => g.date), ['2026-10-12', '2026-10-15', '2026-10-17']);
  assert.equal(event.firstDate, '2026-10-12');
  assert.equal(event.date, '2026-10-17');
  assert.deepEqual([event.lat, event.lng], [38.5, -119.5]);
  assert.equal(event.topic, 'fire');
  assert.equal(event.sources.length, 1);
  assert.equal(event.sources[0].url, 'https://example.org/fire');
  assert.deepEqual(event.geometry[1].magnitude, { value: 120, unit: 'acres' });
});

test('events without a usable location are dropped', () => {
  assert.equal(normaliseEvent({ id: 'x', title: 'No place', geometry: [] }), null);
  assert.equal(normaliseEvent({ title: 'No id', geometry: [{ date: '2026-01-01', type: 'Point', coordinates: [1, 1] }] }), null);
  assert.equal(normaliseEvent(null), null);
  assert.deepEqual(normaliseEvents({ events: 'nope' }), []);
});

test('normaliseEvents returns newest first and unknown categories still work', () => {
  const older = { ...RAW_EVENT, id: 'A', categories: [{ id: 'mystery', title: 'Mystery' }], geometry: [{ date: '2026-01-01', type: 'Point', coordinates: [1, 1] }] };
  const list = normaliseEvents({ events: [older, RAW_EVENT] });
  assert.deepEqual(list.map((e) => e.id), ['EONET_1234', 'A']);
  assert.equal(list[1].category, 'Mystery');
  assert.equal(categoryInfo('mystery').topic, 'other');
});

test('buildEventsUrl encodes filters', () => {
  assert.equal(buildEventsUrl({ status: 'open', limit: 10 }), 'https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=10');
  assert.match(buildEventsUrl({ category: 'wildfires', days: 7 }), /days=7&category=wildfires$/);
});

test('fetchEvents returns normalised events from an injected fetch', async () => {
  let seen;
  const fetchImpl = async (url, init) => { seen = { url, init }; return { ok: true, json: async () => ({ events: [RAW_EVENT] }) }; };
  const events = await fetchEvents({ fetchImpl, limit: 5 });
  assert.equal(events.length, 1);
  assert.match(seen.url, /limit=5/);
  assert.equal(seen.init.headers.Accept, 'application/json');
});

test('fetchEvents surfaces HTTP errors and aborts on timeout', async () => {
  await assert.rejects(fetchEvents({ fetchImpl: async () => ({ ok: false, status: 503 }) }), /503/);
  const hang = (url, { signal }) => new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))));
  await assert.rejects(fetchEvents({ fetchImpl: hang, timeoutMs: 20 }), { name: 'AbortError' });
});
