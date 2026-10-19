// The browser's door to files, links and location. Same interface as the desktop and phone
// apps' platform objects, so the shared actions (export, import) work unchanged.

import { localStorageAdapter } from '../../../packages/core/src/store.js';
import { safeUrl } from '../../../packages/core/src/text.js';

const MAX_IMPORT_BYTES = 10 * 1024 * 1024;

export function createPlatform(win = window) {
  return {
    isNative: false,
    os: 'web',
    storage: localStorageAdapter('echo-web-v1'),

    openExternal(url) {
      const safe = safeUrl(url);
      if (safe) win.open(safe, '_blank', 'noopener,noreferrer');
    },

    async saveFile({ name, content, mime = 'text/plain' }) {
      const url = URL.createObjectURL(new Blob([content], { type: `${mime};charset=utf-8` }));
      const link = win.document.createElement('a');
      link.href = url;
      link.download = name;
      link.rel = 'noopener';
      win.document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      return { canceled: false };
    },

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

    getPosition() {
      return new Promise((resolve, reject) => {
        if (!win.navigator.geolocation) { reject(new Error('This browser cannot share your location.')); return; }
        win.navigator.geolocation.getCurrentPosition(
          (r) => resolve({ lat: r.coords.latitude, lng: r.coords.longitude, accuracy: r.coords.accuracy }),
          (error) => reject(new Error(error.code === 1 ? 'Location is blocked for this site. Allow it in your browser settings to use My location.' : 'Your location is not available right now.')),
          { enableHighAccuracy: false, timeout: 12000, maximumAge: 300000 }
        );
      });
    },

    async share({ title, url }) {
      if (win.navigator.share) {
        try { await win.navigator.share({ title, url }); return 'shared'; } catch (error) { if (error?.name === 'AbortError') return 'canceled'; }
      }
      try { await win.navigator.clipboard.writeText(url); return 'copied'; } catch { return 'failed'; }
    },

    async info() {
      let version = 'dev';
      try { version = (await (await fetch('package.json')).json()).version || version; } catch { /* not served: fine */ }
      return { name: 'ECHO', version, platform: 'web', dataFile: 'this browser’s storage on this device' };
    }
  };
}
