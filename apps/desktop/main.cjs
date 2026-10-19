'use strict';
// ECHO desktop: the Electron main process.
//
// Security model: the renderer is sandboxed with context isolation and no Node.js; it loads
// only from the app's own app://echo protocol; external links open in the system browser
// (http/https only); every permission request is denied; IPC is accepted only from app pages.

const { app, BrowserWindow, Menu, ipcMain, protocol, shell, dialog, screen, session, nativeTheme } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createStorage } = require('./lib/storage.cjs');
const { buildMenuTemplate } = require('./lib/menu.cjs');
const { APP_ORIGIN, isAppUrl, isSafeExternalUrl, isTrustedSender } = require('./lib/security.cjs');
const { createAppProtocolHandler } = require('./lib/protocol.cjs');
const windowState = require('./lib/window-state.cjs');

const MENU_CHANNEL = 'echo:menu';
const DIST = path.join(__dirname, '..', '..', 'dist', 'desktop');
const MAX_IMPORT_BYTES = 10 * 1024 * 1024;
const isMac = process.platform === 'darwin';

protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);

let mainWindow = null;
let storage = null;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });
}

function sendToRenderer(command) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(MENU_CHANNEL, command);
}

function openExternal(url) {
  if (isSafeExternalUrl(url)) shell.openExternal(url);
}

function createWindow() {
  const stateFile = path.join(app.getPath('userData'), 'window-state.json');
  const state = windowState.fitToDisplays(windowState.load(stateFile), screen.getAllDisplays());

  mainWindow = new BrowserWindow({
    x: state.x,
    y: state.y,
    width: state.width,
    height: state.height,
    minWidth: windowState.MIN.width,
    minHeight: windowState.MIN.height,
    show: false,
    backgroundColor: '#0b1118',
    title: 'ECHO',
    titleBarStyle: isMac ? 'hiddenInset' : 'default',
    trafficLightPosition: isMac ? { x: 18, y: 18 } : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
      webSecurity: true
    }
  });

  if (state.maximized) mainWindow.maximize();
  mainWindow.once('ready-to-show', () => mainWindow.show());

  const remember = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const bounds = mainWindow.isMaximized() || mainWindow.isFullScreen() ? undefined : mainWindow.getBounds();
    windowState.save(stateFile, { ...(bounds || windowState.load(stateFile) || {}), maximized: mainWindow.isMaximized() });
  };
  mainWindow.on('close', remember);

  // Links and new windows never open inside the app.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => { openExternal(url); return { action: 'deny' }; });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isAppUrl(url)) { event.preventDefault(); openExternal(url); }
  });
  mainWindow.webContents.on('will-attach-webview', (event) => event.preventDefault());

  mainWindow.loadURL(`${APP_ORIGIN}/index.html`);
  mainWindow.on('closed', () => { mainWindow = null; });
}

function registerProtocol() {
  protocol.handle('app', createAppProtocolHandler({ root: DIST }));
}

function registerIpc() {
  const guard = (handler) => async (event, ...args) => {
    if (!isTrustedSender(event)) throw new Error('Blocked: untrusted sender');
    return handler(event, ...args);
  };

  ipcMain.handle('echo:storage:get', guard(() => storage.read()));
  ipcMain.handle('echo:storage:set', guard((_e, text) => storage.write(text)));

  ipcMain.handle('echo:app:info', guard(() => ({
    name: app.getName(),
    version: app.getVersion(),
    platform: process.platform,
    electron: process.versions.electron,
    dataFile: storage.file
  })));

  ipcMain.handle('echo:open-external', guard((_e, url) => { openExternal(url); }));

  ipcMain.handle('echo:file:save', guard(async (_e, { defaultName, content, filters }) => {
    const safeName = path.basename(String(defaultName)).replace(/[\\/:*?"<>|]/g, '-');
    const result = await dialog.showSaveDialog(mainWindow, { defaultPath: path.join(app.getPath('documents'), safeName), filters });
    if (result.canceled || !result.filePath) return { canceled: true };
    await fs.writeFile(result.filePath, String(content), 'utf8');
    return { canceled: false, path: result.filePath };
  }));

  ipcMain.handle('echo:file:open', guard(async (_e, { filters }) => {
    const result = await dialog.showOpenDialog(mainWindow, { properties: ['openFile'], filters });
    if (result.canceled || !result.filePaths[0]) return null;
    const file = result.filePaths[0];
    const { size } = await fs.stat(file);
    if (size > MAX_IMPORT_BYTES) throw new Error('That file is too large to import.');
    return { name: path.basename(file), content: await fs.readFile(file, 'utf8') };
  }));
}

app.whenReady().then(() => {
  app.setAppUserModelId('com.bandkoconnect.echo');
  nativeTheme.themeSource = 'dark';
  storage = createStorage(app.getPath('userData'));

  // Deny every permission (camera, microphone, geolocation, notifications...). The desktop app needs none.
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);

  registerProtocol();
  registerIpc();
  Menu.setApplicationMenu(Menu.buildFromTemplate(buildMenuTemplate({ isMac, appName: app.getName(), isDev: !app.isPackaged, send: sendToRenderer, openExternal })));
  createWindow();

  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (!isMac) app.quit(); });
