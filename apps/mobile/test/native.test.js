// The phone's native bridge, tested with a fake Capacitor runtime.
//
// native.js imports the shared packages through the paths they have in the built app
// (shared/core/...), so the test builds dist/mobile first and imports the built copy.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { before, describe, it } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
let createPlatform;

before(async () => {
  execFileSync(process.execPath, [join(root, 'scripts/build.mjs'), 'mobile'], { stdio: 'pipe' });
  ({ createPlatform } = await import(pathToFileURL(join(root, 'dist/mobile/app/native.js')).href));
});

/** A fake Filesystem plugin backed by a Map, keyed by directory + path. */
function fakeFilesystem() {
  const files = new Map();
  return {
    files,
    async readFile({ path, directory }) {
      const key = `${directory}/${path}`;
      if (!files.has(key)) throw new Error('File does not exist.');
      return { data: files.get(key) };
    },
    async writeFile({ path, data, directory }) {
      files.set(`${directory}/${path}`, data);
      return { uri: `file:///fake/${directory}/${path}` };
    }
  };
}

function nativeWindow(plugins, os = 'android') {
  return { Capacitor: { isNativePlatform: () => true, getPlatform: () => os, Plugins: plugins } };
}

describe('platform detection', () => {
  it('reports the web when there is no Capacitor runtime', () => {
    const platform = createPlatform({ navigator: {} });
    assert.equal(platform.isNative, false);
    assert.equal(platform.os, 'web');
  });

  it('reports the native platform when Capacitor says so', () => {
    const platform = createPlatform(nativeWindow({ Filesystem: fakeFilesystem() }, 'ios'));
    assert.equal(platform.isNative, true);
    assert.equal(platform.os, 'ios');
  });

  it('does not treat a stub Capacitor object as native', () => {
    assert.equal(createPlatform({ Capacitor: { isNativePlatform: () => false } }).isNative, false);
    assert.equal(createPlatform({ Capacitor: {} }).isNative, false);
  });
});

describe('native storage', () => {
  it('starts empty, then round-trips what was saved', async () => {
    const fs = fakeFilesystem();
    const { storage } = createPlatform(nativeWindow({ Filesystem: fs }));
    assert.equal(await storage.get(), null);
    await storage.set('{"a":1}');
    assert.equal(fs.files.get('DATA/echo-data.json'), '{"a":1}');
    const again = createPlatform(nativeWindow({ Filesystem: fs })).storage;
    assert.equal(await again.get(), '{"a":1}');
  });

  it('keeps the previous good copy as a backup and recovers from a damaged file', async () => {
    const fs = fakeFilesystem();
    const { storage } = createPlatform(nativeWindow({ Filesystem: fs }));
    await storage.get();
    await storage.set('{"v":1}');
    await storage.set('{"v":2}');
    assert.equal(fs.files.get('DATA/echo-data.bak.json'), '{"v":1}');
    fs.files.set('DATA/echo-data.json', '{"v":2'); // cut off mid-write
    const reopened = createPlatform(nativeWindow({ Filesystem: fs })).storage;
    assert.equal(await reopened.get(), '{"v":1}');
  });

  it('does not overwrite the backup when nothing has changed', async () => {
    const fs = fakeFilesystem();
    const { storage } = createPlatform(nativeWindow({ Filesystem: fs }));
    await storage.get();
    await storage.set('{"v":1}');
    await storage.set('{"v":2}');
    await storage.set('{"v":2}');
    await storage.set('{"v":2}');
    assert.equal(fs.files.get('DATA/echo-data.bak.json'), '{"v":1}');
  });

  it('refuses to write text that is not JSON', async () => {
    const fs = fakeFilesystem();
    const { storage } = createPlatform(nativeWindow({ Filesystem: fs }));
    await storage.get();
    await assert.rejects(() => storage.set('not json'));
    assert.equal(fs.files.size, 0);
  });

  it('falls back to Preferences when the Filesystem plugin is missing', async () => {
    const values = new Map();
    const Preferences = {
      async get({ key }) { return { value: values.get(key) ?? null }; },
      async set({ key, value }) { values.set(key, value); }
    };
    const { storage } = createPlatform(nativeWindow({ Preferences }));
    assert.equal(await storage.get(), null);
    await storage.set('{"p":true}');
    assert.equal(await storage.get(), '{"p":true}');
  });
});

describe('exporting files', () => {
  it('writes to the cache folder and opens the share sheet', async () => {
    const fs = fakeFilesystem();
    const shared = [];
    const Share = { async share(options) { shared.push(options); } };
    const platform = createPlatform(nativeWindow({ Filesystem: fs, Share }));
    const result = await platform.saveFile({ name: 'report.md', content: '# Report' });
    assert.deepEqual(result, { canceled: false });
    assert.equal(fs.files.get('CACHE/report.md'), '# Report');
    assert.equal(shared.length, 1);
    assert.equal(shared[0].url, 'file:///fake/CACHE/report.md');
  });

  it('reports a dismissed share sheet as canceled, not as an error', async () => {
    const Share = { async share() { throw new Error('Share canceled'); } };
    const platform = createPlatform(nativeWindow({ Filesystem: fakeFilesystem(), Share }));
    assert.deepEqual(await platform.saveFile({ name: 'a.json', content: '{}' }), { canceled: true });
  });
});

describe('location', () => {
  const geo = (impl) => createPlatform(nativeWindow({ Geolocation: { getCurrentPosition: impl } }));

  it('returns one position fix', async () => {
    const platform = geo(async () => ({ coords: { latitude: 52.37, longitude: 9.73, accuracy: 20 } }));
    assert.deepEqual(await platform.getPosition(), { lat: 52.37, lng: 9.73, accuracy: 20 });
  });

  it('explains a denied permission in plain words', async () => {
    const platform = geo(async () => { throw new Error('User denied location permission'); });
    await assert.rejects(() => platform.getPosition(), /turned off for ECHO/);
  });

  it('explains a timeout in plain words', async () => {
    const platform = geo(async () => { throw new Error('Timeout expired'); });
    await assert.rejects(() => platform.getPosition(), /taking too long/);
  });

  it('has a generic message for anything else', async () => {
    const platform = geo(async () => { throw new Error('kaboom'); });
    await assert.rejects(() => platform.getPosition(), /not available right now/);
  });
});

describe('links and the back button', () => {
  it('opens only web links, in the in-app browser', async () => {
    const opened = [];
    const platform = createPlatform(nativeWindow({ Browser: { async open(options) { opened.push(options.url); } } }));
    await platform.openExternal('https://worldview.earthdata.nasa.gov/');
    await platform.openExternal('javascript:alert(1)');
    await platform.openExternal('file:///etc/passwd');
    assert.deepEqual(opened, ['https://worldview.earthdata.nasa.gov/']);
  });

  it('lets the app handle back, and exits only when it does not', async () => {
    let listener;
    let exits = 0;
    const App = { addListener(name, fn) { assert.equal(name, 'backButton'); listener = fn; return Promise.resolve({ remove() {} }); }, exitApp() { exits += 1; } };
    const platform = createPlatform(nativeWindow({ App }));
    let handled = true;
    platform.onBack(() => handled);
    listener();
    assert.equal(exits, 0);
    handled = false;
    listener();
    assert.equal(exits, 1);
  });
});
