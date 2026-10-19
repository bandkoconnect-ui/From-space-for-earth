'use strict';
// Runs in an isolated context before the page. Exposes a small, fixed API to the renderer.
// The renderer never gets Node.js, the file system, or the raw ipcRenderer.

const { contextBridge, ipcRenderer } = require('electron');

const MENU_CHANNEL = 'echo:menu';

contextBridge.exposeInMainWorld('echoNative', {
  platform: process.platform,
  storage: {
    get: () => ipcRenderer.invoke('echo:storage:get'),
    set: (text) => ipcRenderer.invoke('echo:storage:set', String(text))
  },
  getInfo: () => ipcRenderer.invoke('echo:app:info'),
  openExternal: (url) => ipcRenderer.invoke('echo:open-external', String(url)),
  saveFile: (options) => ipcRenderer.invoke('echo:file:save', {
    defaultName: String(options && options.defaultName || 'echo-export.txt'),
    content: String(options && options.content || ''),
    filters: Array.isArray(options && options.filters) ? options.filters.slice(0, 4) : []
  }),
  openFile: (options) => ipcRenderer.invoke('echo:file:open', {
    filters: Array.isArray(options && options.filters) ? options.filters.slice(0, 4) : []
  }),
  onMenu: (callback) => {
    const listener = (_event, command) => callback(String(command));
    ipcRenderer.on(MENU_CHANNEL, listener);
    return () => ipcRenderer.removeListener(MENU_CHANNEL, listener);
  }
});
