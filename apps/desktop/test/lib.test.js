import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { createStorage } = require('../lib/storage.cjs');
const security = require('../lib/security.cjs');
const { fitToDisplays } = require('../lib/window-state.cjs');
const { buildMenuTemplate } = require('../lib/menu.cjs');
const { createAppProtocolHandler } = require('../lib/protocol.cjs');

/* ---------------- storage ---------------- */

async function tempDir() {
  return mkdtemp(path.join(tmpdir(), 'echo-test-'));
}

test('storage round-trips and returns null before anything is saved', async () => {
  const dir = await tempDir();
  const storage = createStorage(dir);
  assert.equal(await storage.read(), null);
  await storage.write('{"a":1}');
  assert.equal(await storage.read(), '{"a":1}');
  await rm(dir, { recursive: true, force: true });
});

test('storage keeps a backup and recovers from a damaged main file', async () => {
  const dir = await tempDir();
  const storage = createStorage(dir);
  await storage.write('{"version":1}');
  await storage.write('{"version":2}');
  assert.equal(await readFile(`${storage.file}.bak`, 'utf8'), '{"version":1}');
  await writeFile(storage.file, '{"version":3, "trunc'); // simulate a crash mid-write
  assert.equal(await storage.read(), '{"version":1}', 'falls back to the last good copy');
  await rm(dir, { recursive: true, force: true });
});

test('storage refuses invalid or oversized data and keeps going afterwards', async () => {
  const dir = await tempDir();
  const storage = createStorage(dir);
  await assert.rejects(storage.write('not json'), SyntaxError);
  await assert.rejects(storage.write(123), TypeError);
  await storage.write('{"ok":true}');
  assert.equal(await storage.read(), '{"ok":true}');
  await rm(dir, { recursive: true, force: true });
});

test('storage serialises concurrent writes in call order', async () => {
  const dir = await tempDir();
  const storage = createStorage(dir);
  await Promise.all(Array.from({ length: 25 }, (_, i) => storage.write(JSON.stringify({ n: i }))));
  assert.equal(await storage.read(), '{"n":24}');
  await rm(dir, { recursive: true, force: true });
});

/* ---------------- security ---------------- */

test('only plain http(s) links may open in the system browser', () => {
  assert.equal(security.isSafeExternalUrl('https://eonet.gsfc.nasa.gov/'), true);
  assert.equal(security.isSafeExternalUrl('http://example.org'), true);
  for (const bad of ['file:///etc/passwd', 'javascript:alert(1)', 'app://echo/index.html', 'ms-msdt:/x', 'https://user:pw@example.org', 'nonsense', '', null]) {
    assert.equal(security.isSafeExternalUrl(bad), false, String(bad));
  }
});

test('app URLs and trusted senders', () => {
  assert.equal(security.isAppUrl('app://echo/index.html'), true);
  assert.equal(security.isAppUrl('app://evil/index.html'), false);
  assert.equal(security.isAppUrl('https://echo/index.html'), false);
  assert.equal(security.isAppUrl('app://echo:8080/index.html'), false);
  assert.equal(security.isAppUrl('app://echo@evil.example/index.html'), false);
  assert.equal(security.isAppUrl('app://echo.evil.example/index.html'), false);
  assert.equal(security.isAppUrl('not a url'), false);
  assert.equal(security.isTrustedSender({ senderFrame: { url: 'app://echo/index.html' } }), true);
  assert.equal(security.isTrustedSender({ senderFrame: { url: 'https://example.org/' } }), false);
  assert.equal(security.isTrustedSender({}), false);
  assert.equal(security.isTrustedSender(null), false);
});

test('app protocol paths cannot escape the dist folder', () => {
  const root = path.join(path.sep, 'app', 'dist', 'desktop');
  assert.equal(security.resolveAppPath(root, '/'), path.join(root, 'index.html'));
  assert.equal(security.resolveAppPath(root, '/shared/core/src/index.js'), path.join(root, 'shared', 'core', 'src', 'index.js'));
  for (const bad of ['/../secret', '/..%2f..%2fetc/passwd', '/a/../../b', '/%00', '/%E0%A4%A']) {
    assert.equal(security.resolveAppPath(root, bad), null, bad);
  }
});

test('content types: modules, styles, images and a safe default', () => {
  assert.match(security.mimeFor('/x/app/main.js'), /^text\/javascript/);
  assert.match(security.mimeFor('index.HTML'), /^text\/html/);
  assert.equal(security.mimeFor('a.webp'), 'image/webp');
  assert.equal(security.mimeFor('a.unknown'), 'application/octet-stream');
});

/* ---------------- app protocol ---------------- */

test('app protocol serves real files with the right content type and refuses everything else', async () => {
  const root = await tempDir();
  await mkdir(path.join(root, 'app'), { recursive: true });
  await writeFile(path.join(root, 'index.html'), '<!doctype html><title>x</title>');
  await writeFile(path.join(root, 'app', 'main.js'), 'export default 1;');
  await writeFile(path.join(path.dirname(root), 'secret.txt'), 'top secret');
  const handle = createAppProtocolHandler({ root });
  const index = await handle({ url: 'app://echo/' });
  assert.equal(index.status, 200);
  assert.match(index.headers.get('content-type'), /^text\/html/);
  assert.match(await index.text(), /<title>x<\/title>/);
  const script = await handle({ url: 'app://echo/app/main.js' });
  assert.match(script.headers.get('content-type'), /^text\/javascript/);
  assert.equal(script.headers.get('x-content-type-options'), 'nosniff');
  assert.equal((await handle({ url: 'app://echo/app/missing.js' })).status, 404);
  assert.equal((await handle({ url: 'app://echo/app' })).status, 404, 'a directory is not a file');
  for (const evil of ['app://echo/..%2fsecret.txt', 'app://echo/app/..%2f..%2fsecret.txt']) {
    assert.equal((await handle({ url: evil })).status, 403, evil);
  }
  // The URL parser resolves literal and %2e dot segments against the root itself, so these can only
  // ever name files inside it. What matters is that the outside file is never served.
  for (const contained of ['app://echo/../secret.txt', 'app://echo/%2e%2e/secret.txt']) {
    const response = await handle({ url: contained });
    assert.notEqual(response.status, 200, contained);
    assert.doesNotMatch(await response.text(), /top secret/, contained);
  }
  assert.equal((await handle({ url: 'not a url' })).status, 400);
  await rm(root, { recursive: true, force: true });
  await rm(path.join(path.dirname(root), 'secret.txt'), { force: true });
});

/* ---------------- window state ---------------- */

const display = (x, y, width, height) => ({ workArea: { x, y, width, height } });

test('window state: sane defaults, minimum size, and kept position', () => {
  const d = [display(0, 0, 1920, 1080)];
  assert.deepEqual(fitToDisplays(null, d), { width: 1440, height: 900, maximized: false });
  assert.equal(fitToDisplays({ width: 300, height: 200 }, d).width, 1040);
  assert.equal(fitToDisplays({ width: 5000, height: 5000 }, d).width, 1920);
  assert.deepEqual(fitToDisplays({ x: 100, y: 80, width: 1300, height: 800, maximized: true }, d), { x: 100, y: 80, width: 1300, height: 800, maximized: true });
});

test('window state: a position on a disconnected monitor is dropped', () => {
  const only = [display(0, 0, 1920, 1080)];
  const state = fitToDisplays({ x: 3000, y: 100, width: 1200, height: 800 }, only);
  assert.equal(state.x, undefined);
  assert.equal(state.y, undefined);
  const dual = [display(0, 0, 1920, 1080), display(1920, 0, 1920, 1080)];
  assert.equal(fitToDisplays({ x: 3000, y: 100, width: 1200, height: 800 }, dual).x, 3000);
});

/* ---------------- menu ---------------- */

function flatten(items) {
  return items.flatMap((item) => [item, ...(item.submenu ? flatten(item.submenu) : [])]);
}

test('menu: every command item sends a command, accelerators are unique per menu', () => {
  const sent = [];
  const opened = [];
  for (const isMac of [true, false]) {
    const template = buildMenuTemplate({ isMac, send: (c) => sent.push(c), openExternal: (u) => opened.push(u) });
    const items = flatten(template);
    const accelerators = items.map((i) => i.accelerator).filter(Boolean);
    assert.equal(new Set(accelerators).size, accelerators.length, `duplicate accelerator (mac=${isMac})`);
    assert.equal(template[0].label === 'ECHO', isMac, 'the app menu exists only on macOS');
    assert.ok(items.some((i) => i.label === 'Settings…'));
    items.filter((i) => i.click).forEach((i) => i.click());
  }
  for (const command of ['new-investigation', 'import', 'export-workspace', 'export-report', 'settings', 'about-data', 'ask', 'toggle-inspector', 'toggle-compare', 'view:home', 'view:explore', 'view:investigations', 'view:pulse', 'timeline:prev', 'timeline:next', 'timeline:play']) {
    assert.ok(sent.includes(command), `missing command ${command}`);
  }
  assert.ok(opened.every((u) => u.startsWith('https://')));
});

test('menu: developer tools only appear in development', () => {
  const roles = (isDev) => flatten(buildMenuTemplate({ isMac: false, isDev, send() {}, openExternal() {} })).map((i) => i.role);
  assert.equal(roles(true).includes('toggleDevTools'), true);
  assert.equal(roles(false).includes('toggleDevTools'), false);
});
