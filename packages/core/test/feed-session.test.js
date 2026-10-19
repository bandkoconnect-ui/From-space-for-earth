import test from 'node:test';
import assert from 'node:assert/strict';
import { createEventFeed, restoreEvent } from '../src/feed.js';
import { createChatSession } from '../src/session.js';
import { createStore, memoryAdapter } from '../src/store.js';
import { normaliseEvent } from '../src/eonet.js';

const NOW = new Date(Date.UTC(2026, 9, 19, 12));
const EVENT = normaliseEvent({
  id: 'E1', title: 'Fire', categories: [{ id: 'wildfires', title: 'Wildfires' }], sources: [{ id: 'S', url: 'https://example.org' }],
  geometry: [{ date: '2026-10-10T00:00:00Z', type: 'Point', coordinates: [1, 2], magnitudeValue: 5, magnitudeUnit: 'ha' }]
});
const newStore = () => createStore(memoryAdapter(), { now: () => NOW, saveDelayMs: 1 }).load();

test('a cached event survives the round trip through storage and re-validation', () => {
  const restored = restoreEvent(JSON.parse(JSON.stringify(EVENT)));
  assert.deepEqual(restored, EVENT);
  assert.equal(restoreEvent({ id: 'x', geometry: [] }), null);
  assert.equal(restoreEvent('nope'), null);
  assert.equal(restoreEvent({ ...EVENT, link: 'javascript:alert(1)' }).link, '');
});

test('feed loads, caches, and reuses the result inside the TTL', async () => {
  const store = await newStore();
  let calls = 0;
  const feed = createEventFeed({ store, now: () => NOW, fetcher: async () => { calls += 1; return [EVENT]; } });
  const first = await feed.load();
  assert.equal(first.stale, false);
  assert.equal(first.items.length, 1);
  await feed.load();
  assert.equal(calls, 1, 'second call served from memory');
  await feed.load({ force: true });
  assert.equal(calls, 2);
  assert.equal(store.cachedEvents().items.length, 1);
  assert.equal(feed.find('E1').title, 'Fire');
});

test('concurrent loads share one request', async () => {
  const store = await newStore();
  let calls = 0;
  const feed = createEventFeed({ store, now: () => NOW, fetcher: async () => { calls += 1; await new Promise((r) => setTimeout(r, 10)); return [EVENT]; } });
  await Promise.all([feed.load(), feed.load(), feed.load()]);
  assert.equal(calls, 1);
});

test('offline: falls back to the last saved feed and says it is stale', async () => {
  const store = await newStore();
  store.cacheEvents([EVENT], '2026-10-18T08:00:00.000Z');
  const feed = createEventFeed({ store, now: () => NOW, fetcher: async () => { throw new Error('offline'); } });
  const result = await feed.load();
  assert.equal(result.stale, true);
  assert.equal(result.error.message, 'offline');
  assert.equal(result.items[0].id, 'E1');
  assert.equal(result.fetchedAt, '2026-10-18T08:00:00.000Z');
  assert.equal(feed.find('E1').id, 'E1');
});

test('offline with nothing cached returns an empty, stale result instead of throwing', async () => {
  const store = await newStore();
  const result = await createEventFeed({ store, fetcher: async () => { throw new Error('offline'); } }).load();
  assert.deepEqual(result.items, []);
  assert.equal(result.stale, true);
});

test('chat session keeps history per investigation and uses the built-in guide offline', async () => {
  const store = await newStore();
  const session = createChatSession({ store });
  const reply = await session.send('demo-nepal', 'What do we know for sure?', { dateIso: '2026-08-27' });
  assert.equal(reply.mode, 'guide');
  assert.match(reply.content, /26 August 2026/);
  assert.equal(session.history('demo-nepal').length, 2);
  assert.equal(session.history('demo-amazon').length, 0);
  session.reset('demo-nepal');
  assert.equal(session.history('demo-nepal').length, 0);
});

test('chat session uses the configured endpoint and sends notes as context', async () => {
  const store = await newStore();
  store.setSettings({ chatEndpoint: 'https://example.org/chat' });
  store.addNote('demo-nepal', { text: 'Cloud over the valley on 24 Aug' });
  let body;
  const session = createChatSession({ store, fetchImpl: async (url, init) => { body = JSON.parse(init.body); return { ok: true, json: async () => ({ reply: 'Live!' }) }; } });
  const reply = await session.send('demo-nepal', 'hello', { dateIso: '2026-08-27' });
  assert.equal(reply.mode, 'live');
  assert.equal(body.investigation.notes[0], 'Cloud over the valley on 24 Aug');
  assert.equal(body.messages.at(-1).content, 'hello');
});

test('chat session validates input and does not resurrect deleted investigations', async () => {
  const store = await newStore();
  const session = createChatSession({ store });
  await assert.rejects(session.send('missing', 'x'), /no longer exists/);
  await assert.rejects(session.send('demo-nepal', '   '), /Type a question/);
  const pending = session.send('demo-amazon', 'hello');
  session.reset('demo-amazon');
  await pending;
  assert.equal(session.history('demo-amazon').length, 0);
});
