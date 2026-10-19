// Loads main.cjs against a fake "electron" module and checks the security-critical wiring.
// This does not replace running the real app, but it catches regressions in the settings
// that matter: sandbox, context isolation, blocked navigation, denied permissions, IPC checks.

import test from 'node:test';
import assert from 'node:assert/strict';
import Module, { createRequire } from 'node:module';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);

function createFakeElectron(userData) {
  const calls = { handlers: new Map(), windows: [], menu: null, protocols: [], permission: null, quit: 0, external: [], sent: [] };
  class FakeWindow {
    constructor(options) {
      this.options = options;
      this.handlers = {};
      this.once = (event, fn) => { this.handlers[event] = fn; };
      this.on = (event, fn) => { this.handlers[event] = fn; };
      this.webContents = {
        setWindowOpenHandler: (fn) => { this.openHandler = fn; },
        on: (event, fn) => { this.navHandlers = { ...(this.navHandlers || {}), [event]: fn }; },
        send: (channel, command) => calls.sent.push([channel, command])
      };
      this.loadURL = (url) => { this.url = url; };
      this.isDestroyed = () => false;
      this.isMaximized = () => false;
      this.isFullScreen = () => false;
      this.isMinimized = () => false;
      this.getBounds = () => ({ x: 10, y: 10, width: 1300, height: 800 });
      this.maximize = () => {};
      this.show = () => {};
      calls.windows.push(this);
    }
  }
  FakeWindow.getAllWindows = () => calls.windows;
  const fake = {
    app: {
      requestSingleInstanceLock: () => true, on() {}, quit: () => { calls.quit += 1; }, getName: () => 'ECHO', getVersion: () => '1.0.0',
      getPath: (name) => (name === 'userData' ? userData : userData), setAppUserModelId() {}, isPackaged: true,
      whenReady: () => Promise.resolve()
    },
    BrowserWindow: FakeWindow,
    Menu: { setApplicationMenu: (menu) => { calls.menu = menu; }, buildFromTemplate: (template) => template },
    ipcMain: { handle: (channel, fn) => calls.handlers.set(channel, fn) },
    protocol: { registerSchemesAsPrivileged: (list) => { calls.privileged = list; }, handle: (scheme, fn) => calls.protocols.push([scheme, fn]) },
    shell: { openExternal: (url) => calls.external.push(url) },
    dialog: { showSaveDialog: async (_w, opts) => { calls.saveOptions = opts; return { canceled: false, filePath: path.join(userData, 'exported.md') }; }, showOpenDialog: async () => ({ canceled: true, filePaths: [] }) },
    screen: { getAllDisplays: () => [{ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }] },
    session: { defaultSession: { setPermissionRequestHandler: (fn) => { calls.permission = fn; }, setPermissionCheckHandler: (fn) => { calls.permissionCheck = fn; } } },
    nativeTheme: {}
  };
  return { fake, calls };
}

async function bootMain() {
  const userData = await mkdtemp(path.join(tmpdir(), 'echo-main-'));
  const { fake, calls } = createFakeElectron(userData);
  const original = Module._load;
  Module._load = function patched(request, ...rest) { return request === 'electron' ? fake : original.call(this, request, ...rest); };
  const mainPath = require.resolve('../main.cjs');
  delete require.cache[mainPath];
  try {
    require(mainPath);
    await new Promise((resolve) => setTimeout(resolve, 20)); // let whenReady().then(...) run
  } finally {
    Module._load = original;
  }
  return { calls, userData, win: calls.windows[0] };
}

const trusted = { senderFrame: { url: 'app://echo/index.html' } };

test('the window is sandboxed, isolated and loads only the app protocol', async () => {
  const { win, calls, userData } = await bootMain();
  const prefs = win.options.webPreferences;
  assert.equal(prefs.contextIsolation, true);
  assert.equal(prefs.nodeIntegration, false);
  assert.equal(prefs.sandbox, true);
  assert.equal(prefs.webSecurity, true);
  assert.match(prefs.preload, /preload\.cjs$/);
  assert.equal(win.url, 'app://echo/index.html');
  assert.equal(calls.privileged[0].scheme, 'app');
  assert.equal(calls.protocols[0][0], 'app');
  assert.ok(calls.menu.length > 4);
  await rm(userData, { recursive: true, force: true });
});

test('navigation and new windows never leave the app; safe links go to the system browser', async () => {
  const { win, calls, userData } = await bootMain();
  assert.deepEqual(win.openHandler({ url: 'https://worldview.earthdata.nasa.gov/' }), { action: 'deny' });
  assert.deepEqual(win.openHandler({ url: 'file:///etc/passwd' }), { action: 'deny' });
  assert.deepEqual(calls.external, ['https://worldview.earthdata.nasa.gov/']);
  let prevented = 0;
  win.navHandlers['will-navigate']({ preventDefault: () => { prevented += 1; } }, 'https://evil.example/');
  win.navHandlers['will-navigate']({ preventDefault: () => { prevented += 1; } }, 'app://echo/other.html');
  assert.equal(prevented, 1, 'only the external navigation is stopped');
  await rm(userData, { recursive: true, force: true });
});

test('every permission request is denied', async () => {
  const { calls, userData } = await bootMain();
  let granted = null;
  calls.permission({}, 'geolocation', (value) => { granted = value; });
  assert.equal(granted, false);
  assert.equal(calls.permissionCheck(), false);
  await rm(userData, { recursive: true, force: true });
});

test('the app protocol is registered and refuses path traversal', async () => {
  const { calls, userData } = await bootMain();
  const handler = calls.protocols[0][1];
  assert.equal((await handler({ url: 'app://echo/..%2f..%2fpackage.json' })).status, 403);
  assert.equal((await handler({ url: 'app://echo/definitely/not/there.js' })).status, 404);
  await rm(userData, { recursive: true, force: true });
});

test('IPC: storage works for app pages and is refused for anything else', async () => {
  const { calls, userData } = await bootMain();
  const set = calls.handlers.get('echo:storage:set');
  const get = calls.handlers.get('echo:storage:get');
  await set(trusted, '{"hello":"world"}');
  assert.equal(await get(trusted), '{"hello":"world"}');
  assert.equal(await readFile(path.join(userData, 'echo-data.json'), 'utf8'), '{"hello":"world"}');
  await assert.rejects(set({ senderFrame: { url: 'https://evil.example/' } }, '{}'), /untrusted sender/);
  await assert.rejects(get({}), /untrusted sender/);
  await rm(userData, { recursive: true, force: true });
});

test('IPC: external links are filtered and exports use a sanitised file name', async () => {
  const { calls, userData } = await bootMain();
  await calls.handlers.get('echo:open-external')(trusted, 'javascript:alert(1)');
  await calls.handlers.get('echo:open-external')(trusted, 'https://eonet.gsfc.nasa.gov/');
  assert.deepEqual(calls.external, ['https://eonet.gsfc.nasa.gov/']);
  const result = await calls.handlers.get('echo:file:save')(trusted, { defaultName: '../../evil:name?.md', content: '# Report', filters: [] });
  assert.equal(result.canceled, false);
  assert.equal(path.basename(calls.saveOptions.defaultPath), 'evil-name-.md');
  assert.equal(await readFile(path.join(userData, 'exported.md'), 'utf8'), '# Report');
  const info = await calls.handlers.get('echo:app:info')(trusted);
  assert.equal(info.version, '1.0.0');
  await rm(userData, { recursive: true, force: true });
});
