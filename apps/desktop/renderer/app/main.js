// ECHO desktop: start-up, navigation, menu commands and keyboard shortcuts.

import { createChatSession, createEventFeed, createStore } from '../shared/core/src/index.js';
import { h, ic, mount } from '../shared/ui/dom.js';
import { createPlatform } from './platform.js';
import { createUi } from './ui.js';
import { createActions } from '../shared/ui/actions.js';
import { createDialogs } from './dialogs.js';
import { createHomeView } from './views/home.js';
import { createExploreView } from './views/explore.js';
import { createInvestigationsView } from './views/investigations.js';
import { createPulseView } from './views/pulse.js';

const NAV = [
  { id: 'home', label: 'Home', icon: 'home', title: 'Home (Ctrl/Cmd+1)' },
  { id: 'explore', label: 'Explore', icon: 'explore', title: 'Explore the map (Ctrl/Cmd+2)' },
  { id: 'investigations', label: 'Library', icon: 'list', title: 'Investigations (Ctrl/Cmd+3)' },
  { id: 'pulse', label: 'Pulse', icon: 'pulse', title: 'Planet Pulse (Ctrl/Cmd+4)' }
];

const TITLES = { home: 'Home', explore: 'Explore', investigations: 'Investigations', pulse: 'Planet Pulse' };

/** Keyboard shortcuts for when ECHO runs in a plain browser (the native menu provides them in the app). */
function shortcutFor(event) {
  const mod = event.ctrlKey || event.metaKey;
  const key = event.key.toLowerCase();
  if (mod && event.shiftKey) return { n: 'view:pulse', e: 'export-workspace', p: 'timeline:play' }[key];
  if (mod) return { n: 'new-investigation', o: 'import', e: 'export-report', ',': 'settings', k: 'ask', '\\': 'toggle-inspector', b: 'toggle-compare', 1: 'view:home', 2: 'view:explore', 3: 'view:investigations', 4: 'view:pulse' }[key];
  if (event.altKey && event.key === 'ArrowLeft') return 'timeline:prev';
  if (event.altKey && event.key === 'ArrowRight') return 'timeline:next';
  return undefined;
}

function fatal(root, error) {
  console.error(error);
  mount(root, h('div', { class: 'fatal' },
    h('h1', null, 'ECHO could not start'),
    h('p', null, 'Your saved investigations have not been touched. Quit and reopen ECHO; if this keeps happening, export a backup from a working copy and reinstall.'),
    h('pre', null, String(error && error.stack ? error.stack : error))));
}

async function boot() {
  const root = document.getElementById('app');
  const platform = createPlatform();
  document.body.classList.add(`os-${platform.os}`);

  const store = createStore(platform.storage);
  await store.load();

  const app = { store, platform };
  app.feed = createEventFeed({ store });
  app.session = createChatSession({ store });
  app.ui = createUi({ platform });
  app.actions = createActions(app);
  app.dialogs = createDialogs(app);

  const views = {
    home: createHomeView(app),
    explore: createExploreView(app),
    investigations: createInvestigationsView(app),
    pulse: createPulseView(app)
  };
  let currentName = null;

  app.go = (name, params) => {
    const next = views[name];
    if (!next) return;
    if (currentName && currentName !== name) {
      views[currentName].hide();
      views[currentName].el.hidden = true;
    }
    currentName = name;
    next.el.hidden = false;
    next.show(params);
    for (const button of rail.querySelectorAll('[data-nav]')) {
      const active = button.dataset.nav === name;
      button.classList.toggle('active', active);
      if (active) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
    }
    document.title = `ECHO · ${TITLES[name]}`;
  };

  app.openInvestigation = (id) => {
    store.setActive(id);
    app.go('explore');
  };
  app.mapCenter = () => views.explore.mapCenter();

  const railButton = (id, label, icon, title, onClick, extra = {}) =>
    h('button', { type: 'button', class: 'rail-btn', title, 'aria-label': title, onClick, ...extra }, ic(icon, { size: 22 }), h('span', null, label));

  const rail = h('nav', { class: 'rail', 'aria-label': 'Main' },
    h('div', { class: 'brand', 'aria-hidden': 'true' }, h('span', { class: 'brand-orbit' }), h('span', { class: 'brand-core' })),
    NAV.map((item) => railButton(item.id, item.label, item.icon, item.title, () => app.go(item.id), { 'data-nav': item.id })),
    h('div', { class: 'rail-spacer' }),
    railButton('ask', 'Ask', 'sparkle', 'Ask ECHO (Ctrl/Cmd+K)', () => runCommand('ask')),
    railButton('data', 'Data', 'info', 'About the data', () => app.dialogs.aboutData()),
    railButton('settings', 'Settings', 'settings', 'Settings', () => app.dialogs.settings()));

  mount(root, h('div', { class: 'shell' }, rail, h('main', { class: 'stage' }, Object.values(views).map((view) => view.el))));

  function runCommand(command) {
    const [group, arg] = command.split(':');
    switch (command) {
      case 'new-investigation': app.dialogs.newInvestigation(); return;
      case 'import': app.actions.importWorkspace(); return;
      case 'export-workspace': app.actions.exportWorkspace(); return;
      case 'export-report': app.actions.exportReport(); return;
      case 'settings': app.dialogs.settings(); return;
      case 'about-data': app.dialogs.aboutData(); return;
      case 'about': app.dialogs.about(); return;
      case 'ask': app.go('explore'); views.explore.focusAsk(); return;
      case 'toggle-inspector': app.go('explore'); views.explore.toggleInspector(); return;
      case 'toggle-compare': app.go('explore'); views.explore.toggleCompare(); return;
      case 'timeline:prev': app.go('explore'); views.explore.step(-1); return;
      case 'timeline:next': app.go('explore'); views.explore.step(1); return;
      case 'timeline:play': app.go('explore'); views.explore.togglePlay(); return;
      default:
        if (group === 'view' && views[arg]) app.go(arg);
    }
  }
  app.runCommand = runCommand;
  platform.onMenu(runCommand);

  document.addEventListener('keydown', (event) => {
    if (document.querySelector('dialog[open]')) return;
    if (!platform.isNative) {
      const command = shortcutFor(event);
      if (command) { event.preventDefault(); runCommand(command); return; }
    }
    if (currentName === 'explore' && views.explore.handleKey(event)) event.preventDefault();
  });

  window.addEventListener('unhandledrejection', (event) => {
    console.error(event.reason);
    app.ui.toast('Something went wrong. Your data is safe.', { error: true });
  });

  // Save anything still waiting to be written when the window closes.
  window.addEventListener('pagehide', () => { store.flush().catch(() => {}); });

  app.go('home');
  window.__echo = { app, views }; // handy for debugging in dev tools; contains no secrets
}

boot().catch((error) => fatal(document.getElementById('app'), error));
