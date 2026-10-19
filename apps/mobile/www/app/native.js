// The phone app's door to the operating system.
//
// Inside the Capacitor shell, native features come from Capacitor plugins. This app has no
// bundler, so it uses the global the native runtime provides (window.Capacitor.Plugins)
// instead of importing @capacitor/* packages. In a plain browser (development, the tests) the
// same API falls back to web equivalents, so every other module is written once.
//
// The interface matches the desktop app's platform object where it overlaps (storage,
// openExternal, saveFile, pickFile, info), which lets both apps share packages/ui/actions.js.

import { localStorageAdapter } from '../shared/core/src/store.js';
import { safeUrl } from '../shared/core/src/text.js';

const DATA_FILE = 'echo-data.json';
const BACKUP_FILE = 'echo-data.bak.json';
const MAX_IMPORT_BYTES = 10 * 1024 * 1024;

export function createPlatform(win = window) {
  const cap = win.Capacitor;
  const isNative = Boolean(cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform());
  const plugin = (name) => (isNative && cap.Plugins ? cap.Plugins[name] : undefined);
  const attempt = async (fn, fallback) => { try { return await fn(); } catch { return fallback; } };

  /* ---- storage: a JSON file in the app's private data folder, with the last good copy kept ---- */
  function nativeStorage() {
    const fs = plugin('Filesystem');
    const prefs = plugin('Preferences');
    if (!fs) return prefs ? preferencesStorage(prefs) : localStorageAdapter();
    let lastGood = null;
    const readFile = async (path) => {
      const { data } = await fs.readFile({ path, directory: 'DATA', encoding: 'utf8' });
      JSON.parse(data); // a truncated file must not be trusted
      return data;
    };
    return {
      async get() {
        const text = (await attempt(() => readFile(DATA_FILE), null)) ?? (await attempt(() => readFile(BACKUP_FILE), null));
        lastGood = text;
        return text;
      },
      async set(text) {
        JSON.parse(text);
        if (text === lastGood) return; // nothing changed: do not rotate the backup copy for no reason
        if (lastGood) await attempt(() => fs.writeFile({ path: BACKUP_FILE, data: lastGood, directory: 'DATA', encoding: 'utf8' }));
        await fs.writeFile({ path: DATA_FILE, data: text, directory: 'DATA', encoding: 'utf8' });
        lastGood = text;
      }
    };
  }

  function preferencesStorage(prefs) {
    return {
      async get() { const { value } = await prefs.get({ key: 'echo-data-v1' }); return value || null; },
      async set(text) { await prefs.set({ key: 'echo-data-v1', value: text }); }
    };
  }

  const platform = {
    isNative,
    os: isNative && typeof cap.getPlatform === 'function' ? cap.getPlatform() : 'web',
    storage: isNative ? nativeStorage() : localStorageAdapter(),

    async openExternal(url) {
      const safe = safeUrl(url);
      if (!safe) return;
      const browser = plugin('Browser');
      if (browser) await browser.open({ url: safe });
      else win.open(safe, '_blank', 'noopener,noreferrer');
    },

    /** Hands a text file to the share sheet (Save to Files, Drive, email...). Resolves { canceled }. */
    async saveFile({ name, content, mime = 'text/plain' }) {
      const share = plugin('Share');
      const fs = plugin('Filesystem');
      if (share && fs) {
        try {
          const { uri } = await fs.writeFile({ path: name, data: content, directory: 'CACHE', encoding: 'utf8' });
          await share.share({ title: name, url: uri, dialogTitle: 'Save or share' });
          return { canceled: false };
        } catch (error) {
          if (/cancel/i.test(String(error && error.message))) return { canceled: true };
          // fall through to the web fallbacks below
        }
      }
      const file = typeof File === 'function' ? new File([content], name, { type: mime }) : null;
      if (file && win.navigator.canShare && win.navigator.canShare({ files: [file] })) {
        try { await win.navigator.share({ files: [file], title: name }); return { canceled: false }; } catch (error) { if (error && error.name === 'AbortError') return { canceled: true }; }
      }
      const url = URL.createObjectURL(new Blob([content], { type: `${mime};charset=utf-8` }));
      const link = win.document.createElement('a');
      link.href = url; link.download = name; link.rel = 'noopener';
      win.document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      return { canceled: false };
    },

    /** Lets the person choose a text file. Resolves { name, content } or null. */
    pickFile({ accept = '' } = {}) {
      return new Promise((resolve, reject) => {
        const input = win.document.createElement('input');
        input.type = 'file';
        input.accept = accept;
        input.addEventListener('change', async () => {
          const file = input.files && input.files[0];
          if (!file) { resolve(null); return; }
          if (file.size > MAX_IMPORT_BYTES) { reject(new Error('That file is too large to import.')); return; }
          try { resolve({ name: file.name, content: await file.text() }); } catch (error) { reject(error); }
        });
        input.addEventListener('cancel', () => resolve(null));
        input.click();
      });
    },

    /** One position fix. Rejects with a readable message if location is off or denied. */
    async getPosition() {
      const geo = plugin('Geolocation');
      const describe = (error) => {
        const text = String((error && error.message) || '');
        if (/denied|permission/i.test(text) || (error && error.code === 1)) return new Error('Location is turned off for ECHO. You can allow it in your phone’s settings.');
        if (/timeout/i.test(text) || (error && error.code === 3)) return new Error('Your location is taking too long. Try again outdoors or with location services on.');
        return new Error('Your location is not available right now.');
      };
      try {
        if (geo) {
          const result = await geo.getCurrentPosition({ enableHighAccuracy: true, timeout: 12000 });
          return { lat: result.coords.latitude, lng: result.coords.longitude, accuracy: result.coords.accuracy };
        }
        if (!win.navigator.geolocation) throw new Error('Location is not available here.');
        return await new Promise((resolve, reject) => win.navigator.geolocation.getCurrentPosition(
          (r) => resolve({ lat: r.coords.latitude, lng: r.coords.longitude, accuracy: r.coords.accuracy }), reject, { enableHighAccuracy: true, timeout: 12000 }));
      } catch (error) {
        throw describe(error);
      }
    },

    /** A short tap of feedback. Silent where unsupported. */
    haptic(kind = 'light') {
      const haptics = plugin('Haptics');
      if (haptics) { attempt(() => haptics.impact({ style: kind === 'medium' ? 'MEDIUM' : 'LIGHT' })); return; }
      if (win.navigator.vibrate && kind === 'medium') win.navigator.vibrate(8);
    },

    /** Calls back with true/false as the phone goes online/offline. */
    onConnection(callback) {
      const network = plugin('Network');
      if (network) {
        attempt(() => network.getStatus().then((s) => callback(Boolean(s.connected))));
        const pending = attempt(() => network.addListener('networkStatusChange', (s) => callback(Boolean(s.connected))));
        return () => { pending.then((handle) => handle && handle.remove && handle.remove()); };
      }
      const on = () => callback(true);
      const off = () => callback(false);
      win.addEventListener('online', on); win.addEventListener('offline', off);
      callback(win.navigator.onLine !== false);
      return () => { win.removeEventListener('online', on); win.removeEventListener('offline', off); };
    },

    /** Android's back button. The handler returns true when it dealt with the press. */
    onBack(handler) {
      const app = plugin('App');
      if (!app) return () => {};
      const pending = attempt(() => app.addListener('backButton', () => { if (!handler()) app.exitApp(); }));
      return () => { pending.then((handle) => handle && handle.remove && handle.remove()); };
    },

    /** Called when the app goes to the background, so unsaved changes are written first. */
    onBackground(callback) {
      const app = plugin('App');
      if (app) attempt(() => app.addListener('appStateChange', (state) => { if (!state.isActive) callback(); }));
      win.document.addEventListener('visibilitychange', () => { if (win.document.visibilityState === 'hidden') callback(); });
    },

    /** Dark status bar, then reveal the app by hiding the launch screen. */
    async ready() {
      const bar = plugin('StatusBar');
      if (bar) {
        await attempt(() => bar.setStyle({ style: 'DARK' }));
        await attempt(() => bar.setBackgroundColor({ color: '#0b1118' }));
      }
      const splash = plugin('SplashScreen');
      if (splash) await attempt(() => splash.hide());
    },

    async info() {
      const version = await attempt(async () => (await (await fetch('version.json')).json()).version, 'dev');
      return { name: 'ECHO', version, platform: platform.os, dataFile: isNative ? 'the app’s private storage on this phone' : 'this browser’s local storage' };
    }
  };
  return platform;
}
