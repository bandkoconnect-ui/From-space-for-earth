// The desktop app's door to the operating system.
//
// Inside Electron the preload script exposes window.echoNative (file-based storage, native
// save/open dialogs, the system browser, menu commands). Opened in a plain browser, which is
// handy for development and for the tests, the same API falls back to localStorage, file
// downloads and window.open, so every other module is written once.

import { localStorageAdapter } from '../shared/core/src/store.js';
import { safeUrl } from '../shared/core/src/text.js';

const MAX_IMPORT_BYTES = 10 * 1024 * 1024;

export function createPlatform(win = window) {
  const native = win.echoNative || null;

  return {
    isNative: Boolean(native),
    os: native ? native.platform : 'web',

    /** Storage adapter for createStore(). */
    storage: native
      ? { get: () => native.storage.get(), set: (text) => native.storage.set(text) }
      : localStorageAdapter(),

    async openExternal(url) {
      const safe = safeUrl(url);
      if (!safe) return;
      if (native) await native.openExternal(safe);
      else win.open(safe, '_blank', 'noopener,noreferrer');
    },

    /** Saves text to a file the person chooses. Resolves { canceled }. */
    async saveFile({ name, content, mime = 'text/plain', filters = [] }) {
      if (native) {
        const result = await native.saveFile({ defaultName: name, content, filters });
        return { canceled: Boolean(result.canceled), path: result.path };
      }
      const blob = new Blob([content], { type: `${mime};charset=utf-8` });
      const url = URL.createObjectURL(blob);
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

    /** Lets the person choose a text file. Resolves { name, content } or null if they cancel. */
    async pickFile({ accept = '', filters = [] } = {}) {
      if (native) return native.openFile({ filters });
      return new Promise((resolve, reject) => {
        const input = win.document.createElement('input');
        input.type = 'file';
        input.accept = accept;
        input.addEventListener('change', async () => {
          const file = input.files && input.files[0];
          if (!file) { resolve(null); return; }
          if (file.size > MAX_IMPORT_BYTES) { reject(new Error('That file is too large to import.')); return; }
          resolve({ name: file.name, content: await file.text() });
        });
        input.addEventListener('cancel', () => resolve(null));
        input.click();
      });
    },

    /** Subscribes to native menu commands. Returns an unsubscribe function. */
    onMenu(callback) {
      return native ? native.onMenu(callback) : () => {};
    },

    async info() {
      if (native) return native.getInfo();
      return { name: 'ECHO', version: 'web', platform: 'web', dataFile: 'this browser’s local storage' };
    }
  };
}
