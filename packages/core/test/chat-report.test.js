import test from 'node:test';
import assert from 'node:assert/strict';
import { ask, askLive, buildChatPayload, guide } from '../src/chat.js';
import { buildSnapshot, exportFileName, toMarkdownReport } from '../src/report.js';
import { createInvestigation } from '../src/investigation.js';
import { demoInvestigations } from '../src/seed.js';

const NOW = new Date(Date.UTC(2026, 9, 19, 12));
const [nepal] = demoInvestigations();
const fire = createInvestigation({ title: 'Valley fire watch', topic: 'fire', lat: 38, lng: -120, now: NOW });

test('guidance is specific to the investigation and never leaks another case', () => {
  const answer = guide('How would I map the extent?', { investigation: fire, dateIso: '2026-10-19' });
  assert.match(answer.text, /thermal/i);
  assert.doesNotMatch(JSON.stringify(answer), /Nepal|Amazon/);
  const flood = guide('How would I map the extent?', { investigation: nepal, dateIso: '2026-08-27' });
  assert.match(flood.text, /Sentinel-1/);
});

test('"what do we know" is honest about a brand-new workspace and quotes sourced ones', () => {
  assert.match(guide('What do we know for sure?', { investigation: fire }).text, /nothing is established yet/);
  assert.match(guide('What do we know for sure?', { investigation: nepal }).text, /26 August 2026/);
});

test('timeline questions mention the selected date', () => {
  assert.match(guide('what does the timeline show?', { investigation: nepal, dateIso: '2026-08-27' }).title, /27 August 2026/);
});

test('greetings and unknown questions get a sensible, deterministic reply', () => {
  assert.match(guide('hello there', { investigation: fire }).title, /Hello/);
  const a = guide('banana?', { investigation: fire, turn: 1 });
  const b = guide('banana?', { investigation: fire, turn: 1 });
  assert.deepEqual(a, b);
  assert.ok(a.links.length > 0);
});

test('buildChatPayload bounds what is sent to the server', () => {
  const messages = Array.from({ length: 30 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `m${i}`.repeat(2000) }));
  const payload = buildChatPayload({ investigation: nepal, notes: Array.from({ length: 9 }, () => ({ text: 'n'.repeat(900) })), dateIso: '2026-08-27', messages });
  assert.equal(payload.messages.length, 12);
  assert.ok(payload.messages.every((m) => m.content.length <= 3000));
  assert.equal(payload.investigation.notes.length, 5);
  assert.ok(payload.investigation.notes.every((n) => n.length <= 300));
  assert.equal(payload.investigation.date, '2026-08-27');
});

test('ask uses the live endpoint when it works', async () => {
  let sent;
  const fetchImpl = async (url, init) => { sent = { url, body: JSON.parse(init.body), method: init.method }; return { ok: true, json: async () => ({ reply: ' Live answer ' }) }; };
  const answer = await ask({ question: 'hi', history: [{ role: 'user', content: 'hi' }], investigation: nepal, dateIso: '2026-08-27', endpoint: 'https://example.org/chat', fetchImpl });
  assert.equal(answer.mode, 'live');
  assert.equal(answer.text, 'Live answer');
  assert.equal(sent.method, 'POST');
  assert.equal(sent.body.investigation.title, nepal.title);
});

test('ask falls back to the built-in guide when the service fails, and says why', async () => {
  const broken = await ask({ question: 'How would I map the extent?', history: [{ role: 'user', content: 'x' }], investigation: nepal, endpoint: 'https://example.org/chat', fetchImpl: async () => ({ ok: false, status: 502 }) });
  assert.equal(broken.mode, 'guide');
  assert.match(broken.fallbackReason, /could not be reached/);
  const slow = await ask({ question: 'x', history: [], investigation: nepal, endpoint: 'https://example.org/chat', timeoutMs: 15, fetchImpl: (u, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(Object.assign(new Error('x'), { name: 'AbortError' })))) });
  assert.match(slow.fallbackReason, /took too long/);
  const none = await ask({ question: 'hello', history: [], investigation: nepal });
  assert.equal(none.mode, 'guide');
  assert.equal(none.fallbackReason, undefined);
});

test('askLive rejects empty or malformed replies', async () => {
  await assert.rejects(askLive({ endpoint: 'https://x', payload: {}, fetchImpl: async () => ({ ok: true, json: async () => ({ reply: '  ' }) }) }), /no reply/);
  await assert.rejects(askLive({ endpoint: '', payload: {} }), /No AI endpoint/);
});

test('the Markdown report contains every section and the notes, oldest first', () => {
  const notes = [{ id: '2', text: 'Second\nline', createdAt: '2026-10-19T09:00:00Z', lat: 28.1, lng: 85.3, dateIndex: 2 }, { id: '1', text: 'First', createdAt: '2026-10-18T09:00:00Z' }];
  const md = toMarkdownReport(nepal, { notes, now: NOW });
  for (const heading of ['# Nepal · Glacier flash flood', '## Summary', '## Timeline', '## Evidence trail', '## Next steps', '## Field notes']) assert.ok(md.includes(heading), heading);
  assert.ok(md.includes('- **27 AUG 2026**'));
  assert.ok(md.indexOf('First') < md.indexOf('Second line'));
  assert.ok(md.includes('imagery 27 AUG 2026'));
  assert.match(toMarkdownReport(fire, { now: NOW }), /_No notes yet._/);
});

test('snapshots and file names', () => {
  const snap = buildSnapshot(nepal, { dateIndex: 2, layers: { compare: true }, now: NOW });
  assert.equal(snap.selectedDate, '2026-08-27');
  assert.equal(snap.kind, 'echo-snapshot');
  assert.equal(snap.layers.compare, true);
  assert.equal(exportFileName(nepal, 'md'), 'echo-nepal-glacier-flash-flood.md');
  assert.equal(exportFileName({ title: '???' }, 'json'), 'echo-investigation.json');
});
