import test from 'node:test';
import assert from 'node:assert/strict';
import { ValidationError, createFromEvent, createInvestigation, describeInvestigation, normalizeInvestigation } from '../src/investigation.js';
import { DEMO_IDS, demoInvestigations } from '../src/seed.js';
import { createStore, memoryAdapter, normalizeEndpoint } from '../src/store.js';
import { normaliseEvent } from '../src/eonet.js';
import { todayIso } from '../src/dates.js';

const NOW = new Date(Date.UTC(2026, 9, 19, 12));
const clock = () => NOW;

/* ---------------- investigations ---------------- */

test('createInvestigation builds a valid workspace with a four-stop timeline ending today', () => {
  const inv = createInvestigation({ title: '  Coastal erosion watch ', topic: 'flood', lat: '27.7172', lng: '85.324', radiusKm: 30, now: NOW });
  assert.equal(inv.title, 'Coastal erosion watch');
  assert.equal(inv.kind, 'custom');
  assert.deepEqual(inv.center, [27.7172, 85.324]);
  assert.equal(inv.timeline.length, 4);
  assert.equal(inv.timeline[3].date, '2026-10-19');
  assert.equal(inv.defaultIndex, 3);
  assert.equal(inv.overlay.kind, 'circle');
  assert.equal(inv.evidence.length, 3);
  assert.ok(inv.steps.length >= 3);
});

test('createInvestigation explains what is wrong in plain language', () => {
  assert.throws(() => createInvestigation({ title: '  ', lat: 1, lng: 1 }), { name: 'ValidationError', message: /name/ });
  assert.throws(() => createInvestigation({ title: 'x', lat: 91, lng: 1 }), /latitude/);
  assert.throws(() => createInvestigation({ title: 'x', lat: 1, lng: 'abc' }), ValidationError);
  assert.throws(() => createInvestigation({ title: 'x', lat: 1, lng: 1, radiusKm: 9999 }), /radius/);
});

test('unknown topics become "other"', () => {
  assert.equal(createInvestigation({ title: 'x', topic: 'banana', lat: 1, lng: 1, now: NOW }).topic, 'other');
});

const FIRE = normaliseEvent({
  id: 'EONET_9', title: 'Ridge Fire', description: 'Spreading fast.', link: 'https://eonet.gsfc.nasa.gov/api/v3/events/EONET_9',
  categories: [{ id: 'wildfires', title: 'Wildfires' }], sources: [{ id: 'CALFIRE', url: 'https://example.org/ridge' }],
  geometry: [
    { date: '2026-10-10T00:00:00Z', type: 'Point', coordinates: [-120.5, 38.5] },
    { date: '2026-10-17T00:00:00Z', type: 'Point', coordinates: [-120.3, 38.7] }
  ]
});

test('createFromEvent draws its timeline from the real event dates and never goes into the future', () => {
  const inv = createFromEvent(FIRE, { now: NOW });
  assert.equal(inv.kind, 'event');
  assert.equal(inv.topic, 'fire');
  assert.equal(inv.timeline[0].date, '2026-09-30');
  assert.ok(inv.timeline.every((s) => s.date <= todayIso(NOW)));
  assert.deepEqual(inv.center, [38.7, -120.3]);
  assert.equal(inv.event.geometry.length, 2);
  assert.ok(inv.evidence.some((e) => e.url.startsWith('https://worldview.earthdata.nasa.gov/')));
  assert.ok(inv.evidence.some((e) => e.url === 'https://example.org/ridge'));
  assert.match(inv.summary, /does not measure/);
});

test('createFromEvent works for a single-day event that happened today', () => {
  const today = normaliseEvent({ id: 'T', title: 'Today', categories: [{ id: 'volcanoes', title: 'Volcanoes' }], geometry: [{ date: '2026-10-19T00:00:00Z', type: 'Point', coordinates: [10, 10] }] });
  const inv = createFromEvent(today, { now: NOW });
  assert.ok(inv.timeline.length >= 2);
  assert.ok(inv.timeline.every((s) => s.date <= '2026-10-19'));
  assert.throws(() => createFromEvent({ id: 'x', geometry: [] }), ValidationError);
});

test('normalizeInvestigation drops unknown fields, caps lengths and sanitises links', () => {
  const inv = normalizeInvestigation({
    id: 'a', title: 'T'.repeat(500), topic: 'forest', center: [10, 20], timeline: [{ date: '12 AUG 2026', desc: 'x' }],
    evidence: [{ title: 'ok', url: 'https://example.org' }, { title: 'bad', url: 'javascript:alert(1)' }, { title: '', url: 'https://example.org' }],
    points: [{ name: 'p', lat: 1, lng: 2 }, { name: 'out of range', lat: 99, lng: 2 }],
    overlay: { kind: 'polygon', coords: [[1, 1], [1, 2]] }, injected: '<script>', __proto__: { polluted: true }
  });
  assert.equal(inv.title.length, 80);
  assert.equal(inv.timeline[0].date, '2026-08-12');
  assert.deepEqual(inv.evidence.map((e) => e.title), ['ok']);
  assert.equal(inv.points.length, 1);
  assert.equal(inv.overlay, null, 'a polygon needs at least three vertices');
  assert.equal(inv.injected, undefined);
  assert.equal({}.polluted, undefined);
});

test('normalizeInvestigation rejects records it cannot place or date', () => {
  assert.throws(() => normalizeInvestigation(null), ValidationError);
  assert.throws(() => normalizeInvestigation({ title: 'x', center: [200, 0], timeline: [{ date: '2026-01-01' }] }), /location/);
  assert.throws(() => normalizeInvestigation({ title: 'x', center: [1, 1], timeline: [] }), /timeline/);
  assert.throws(() => normalizeInvestigation({ title: '', center: [1, 1], timeline: [{ date: '2026-01-01' }] }), /title/);
});

test('demo investigations are valid and the Nepal case matches its cited dates', () => {
  const demos = demoInvestigations();
  assert.deepEqual(demos.map((d) => d.id), DEMO_IDS);
  const nepal = demos[0];
  assert.deepEqual(nepal.timeline.map((s) => s.date), ['2026-08-12', '2026-08-24', '2026-08-27', '2026-09-03']);
  assert.equal(nepal.overlay, null, 'no invented flood polygon');
  assert.match(nepal.summary, /26 August 2026/);
  assert.equal(demos[1].overlay.illustrative, true);
  assert.equal(describeInvestigation(createInvestigation({ title: 'x', lat: 1, lng: 2, now: NOW })).includes('°'), true);
});

/* ---------------- store ---------------- */

async function freshStore(adapter = memoryAdapter()) {
  return createStore(adapter, { now: clock, saveDelayMs: 1 }).load();
}

test('a new store starts with the demo investigations and an active selection', async () => {
  const store = await freshStore();
  assert.deepEqual(store.list().map((i) => i.id), DEMO_IDS);
  assert.equal(store.active().id, 'demo-nepal');
});

test('add, update, duplicate and remove investigations', async () => {
  const store = await freshStore();
  const inv = store.add(createInvestigation({ title: 'One', lat: 10, lng: 10, now: NOW }));
  assert.equal(store.list()[0].id, inv.id, 'newest first');
  assert.equal(store.active().id, inv.id);
  const renamed = store.update(inv.id, { title: 'Renamed', radiusKm: 80, id: 'hijack' });
  assert.equal(renamed.title, 'Renamed');
  assert.equal(renamed.radiusKm, 80);
  assert.equal(renamed.id, inv.id, 'ids cannot be changed through update');
  const copy = store.duplicate(inv.id);
  assert.equal(copy.title, 'Renamed (copy)');
  assert.notEqual(copy.id, inv.id);
  assert.equal(store.remove(copy.id), true);
  assert.equal(store.remove('missing'), false);
  assert.equal(store.get(copy.id), null);
});

test('removing the active investigation moves the selection', async () => {
  const store = await freshStore();
  const inv = store.add(createInvestigation({ title: 'Temp', lat: 1, lng: 1, now: NOW }));
  store.remove(inv.id);
  assert.notEqual(store.active().id, inv.id);
});

test('state survives a save and reload', async () => {
  const adapter = memoryAdapter();
  const store = await freshStore(adapter);
  const inv = store.add(createInvestigation({ title: 'Persisted', lat: 5, lng: 5, now: NOW }));
  store.addNote(inv.id, { text: 'Cloud-free on the 3rd', lat: 5.1, lng: 5.2, dateIndex: 1 });
  store.setSettings({ chatEndpoint: 'https://example.org/chat', imagery: 'viirs' });
  await store.flush();
  const again = await freshStore(adapter);
  assert.equal(again.get(inv.id).title, 'Persisted');
  assert.equal(again.notes(inv.id)[0].text, 'Cloud-free on the 3rd');
  assert.equal(again.notes(inv.id)[0].lat, 5.1);
  assert.equal(again.settings().imagery, 'viirs');
  assert.equal(again.active().id, inv.id);
  assert.equal(again.list().length, 3, 'demos are not duplicated on reload');
});

test('deleted demos stay deleted until restored', async () => {
  const adapter = memoryAdapter();
  const store = await freshStore(adapter);
  store.remove('demo-amazon');
  await store.flush();
  const again = await freshStore(adapter);
  assert.equal(again.get('demo-amazon'), null);
  assert.equal(again.restoreDemos(), 1);
  assert.ok(again.get('demo-amazon'));
});

test('a corrupt save file does not crash the app', async () => {
  const store = await freshStore(memoryAdapter('{not json'));
  assert.equal(store.list().length, 2);
  const partial = await freshStore(memoryAdapter(JSON.stringify({ schema: 1, seeded: true, investigations: [{ title: 'broken' }, null, 5], notes: 'x' })));
  assert.equal(partial.list().length, 0, 'invalid records are skipped');
  assert.equal(partial.active(), null);
});

test('notes: add, order, validate, remove and clean up with their investigation', async () => {
  const store = await freshStore();
  const id = 'demo-nepal';
  store.addNote(id, { text: 'first' });
  store.addNote(id, { text: 'second', lat: 28, lng: 85 });
  assert.deepEqual(store.notes(id).map((n) => n.text), ['second', 'first']);
  assert.throws(() => store.addNote(id, { text: '   ' }), /Write something/);
  assert.throws(() => store.addNote('missing', { text: 'x' }), /no longer exists/);
  assert.equal(store.noteCount(), 2);
  assert.equal(store.removeNote(id, store.notes(id)[0].id), true);
  store.remove(id);
  assert.equal(store.noteCount(), 0);
});

test('invalid pins are ignored rather than stored', async () => {
  const store = await freshStore();
  const note = store.addNote('demo-nepal', { text: 'pin', lat: 500, lng: 5 });
  assert.equal(note.lat, undefined);
});

test('settings: the AI endpoint must be https (or localhost for development)', async () => {
  assert.equal(normalizeEndpoint(''), '');
  assert.equal(normalizeEndpoint('https://x.netlify.app/.netlify/functions/echo-chat'), 'https://x.netlify.app/.netlify/functions/echo-chat');
  assert.equal(normalizeEndpoint('http://localhost:8888/chat'), 'http://localhost:8888/chat');
  assert.throws(() => normalizeEndpoint('http://example.org/chat'), /https/);
  assert.throws(() => normalizeEndpoint('javascript:alert(1)'), /https/);
  const store = await freshStore();
  assert.throws(() => store.setSettings({ chatEndpoint: 'ftp://x' }), ValidationError);
  assert.equal(store.setSettings({ imagery: 'bogus' }).imagery, 'terra');
});

test('export and import round-trip without overwriting what is already there', async () => {
  const a = await freshStore();
  const inv = a.add(createInvestigation({ title: 'Share me', lat: 3, lng: 4, now: NOW }));
  a.addNote(inv.id, { text: 'evidence note' });
  const bundle = JSON.parse(JSON.stringify(a.exportBundle()));

  const b = await freshStore();
  const result = b.importBundle(bundle);
  assert.equal(result.added, 1, 'demos already present are skipped');
  assert.equal(result.skipped.length, 2);
  const imported = b.list().find((i) => i.title === 'Share me');
  assert.equal(b.notes(imported.id)[0].text, 'evidence note');

  const again = b.importBundle(bundle);
  assert.equal(again.added, 1, 'importing twice creates a separate copy rather than overwriting');
  assert.equal(b.list().filter((i) => i.title === 'Share me').length, 2);
});

test('import rejects wrong files and tolerates hostile content', async () => {
  const store = await freshStore();
  assert.throws(() => store.importBundle({ kind: 'something-else' }), /not an ECHO workspace/);
  assert.throws(() => store.importBundle(null), ValidationError);
  const before = store.list().length;
  const result = store.importBundle({
    kind: 'echo-workspace',
    investigations: [{ title: 'bad', center: [999, 0], timeline: [{ date: '2026-01-01' }] }, { id: '__proto__', title: 'Sneaky', center: [1, 1], timeline: [{ date: '2026-01-01' }] }],
    notes: { constructor: [{ text: 'x' }] }
  });
  assert.equal(result.added, 1);
  assert.equal(result.skipped.length, 1);
  assert.equal(store.list().length, before + 1);
  assert.equal({}.polluted, undefined);
});

test('listeners hear about changes and can unsubscribe', async () => {
  const store = await freshStore();
  const seen = [];
  const off = store.subscribe((e) => seen.push(e.type));
  const inv = store.add(createInvestigation({ title: 'L', lat: 1, lng: 1, now: NOW }));
  store.addNote(inv.id, { text: 'n' });
  off();
  store.remove(inv.id);
  assert.deepEqual(seen, ['add', 'notes']);
});

test('the event feed is cached for offline use', async () => {
  const adapter = memoryAdapter();
  const store = await freshStore(adapter);
  store.cacheEvents([FIRE], '2026-10-19T10:00:00.000Z');
  await store.flush();
  const again = await freshStore(adapter);
  assert.equal(again.cachedEvents().items[0].id, 'EONET_9');
  assert.equal(again.cachedEvents().fetchedAt, '2026-10-19T10:00:00.000Z');
});
