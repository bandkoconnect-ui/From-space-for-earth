'use strict';
// The native application menu. Items that need the app's UI send a command string to the
// renderer (see apps/desktop/renderer/app/main.js for the handlers).

function buildMenuTemplate({ isMac, appName = 'ECHO', isDev = false, send, openExternal }) {
  const cmd = (command) => () => send(command);

  const fileMenu = {
    label: 'File',
    submenu: [
      { label: 'New Investigation…', accelerator: 'CmdOrCtrl+N', click: cmd('new-investigation') },
      { label: 'Investigate an Event…', accelerator: 'CmdOrCtrl+Shift+N', click: cmd('view:pulse') },
      { type: 'separator' },
      { label: 'Import Workspace Backup…', accelerator: 'CmdOrCtrl+O', click: cmd('import') },
      { label: 'Export Workspace Backup…', accelerator: 'CmdOrCtrl+Shift+E', click: cmd('export-workspace') },
      { label: 'Export Field Report…', accelerator: 'CmdOrCtrl+E', click: cmd('export-report') },
      { type: 'separator' },
      ...(isMac ? [{ role: 'close' }] : [{ label: 'Settings…', accelerator: 'Ctrl+,', click: cmd('settings') }, { type: 'separator' }, { role: 'quit' }])
    ]
  };

  const editMenu = { label: 'Edit', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] };

  const viewMenu = {
    label: 'View',
    submenu: [
      { label: 'Dashboard', accelerator: 'CmdOrCtrl+1', click: cmd('view:home') },
      { label: 'Explore Map', accelerator: 'CmdOrCtrl+2', click: cmd('view:explore') },
      { label: 'Investigations', accelerator: 'CmdOrCtrl+3', click: cmd('view:investigations') },
      { label: 'Planet Pulse', accelerator: 'CmdOrCtrl+4', click: cmd('view:pulse') },
      { type: 'separator' },
      { label: 'Ask ECHO', accelerator: 'CmdOrCtrl+K', click: cmd('ask') },
      { label: 'Toggle Side Panel', accelerator: 'CmdOrCtrl+\\', click: cmd('toggle-inspector') },
      { type: 'separator' },
      { label: 'Compare Before / After', accelerator: 'CmdOrCtrl+B', click: cmd('toggle-compare') },
      { label: 'Previous Date', accelerator: 'Alt+Left', click: cmd('timeline:prev') },
      { label: 'Next Date', accelerator: 'Alt+Right', click: cmd('timeline:next') },
      { label: 'Play / Pause Timeline', accelerator: 'CmdOrCtrl+Shift+P', click: cmd('timeline:play') },
      { type: 'separator' },
      { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
      { type: 'separator' },
      { role: 'togglefullscreen' },
      ...(isDev ? [{ type: 'separator' }, { role: 'reload' }, { role: 'toggleDevTools' }] : [])
    ]
  };

  const windowMenu = { label: 'Window', submenu: [{ role: 'minimize' }, { role: 'zoom' }, ...(isMac ? [{ type: 'separator' }, { role: 'front' }] : [{ role: 'close' }])] };

  const helpMenu = {
    role: 'help',
    submenu: [
      { label: 'About the Data…', click: cmd('about-data') },
      { type: 'separator' },
      { label: 'NASA Worldview', click: () => openExternal('https://worldview.earthdata.nasa.gov/') },
      { label: 'NASA GIBS Documentation', click: () => openExternal('https://nasa-gibs.github.io/gibs-api-docs/') },
      { label: 'NASA EONET', click: () => openExternal('https://eonet.gsfc.nasa.gov/') },
      { label: 'Copernicus Data Space', click: () => openExternal('https://dataspace.copernicus.eu/') }
    ]
  };

  const template = [];
  if (isMac) {
    template.push({
      label: appName,
      submenu: [
        { label: `About ${appName}`, click: cmd('about') },
        { type: 'separator' },
        { label: 'Settings…', accelerator: 'Cmd+,', click: cmd('settings') },
        { type: 'separator' },
        { role: 'services' }, { type: 'separator' },
        { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' },
        { role: 'quit' }
      ]
    });
  }
  template.push(fileMenu, editMenu, viewMenu, windowMenu, helpMenu);
  return template;
}

module.exports = { buildMenuTemplate };
