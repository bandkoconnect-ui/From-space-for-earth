// ECHO for phones: start-up, the tab bar, navigation, the back button and keyboard handling.

import { createChatSession, createEventFeed, createStore } from '../shared/core/src/index.js';
import { h, ic, mount } from '../shared/ui/dom.js';
import { createPlatform } from './native.js';
import { createUi } from './ui.js';
import { createActions } from '../shared/ui/actions.js';
import { createSheets } from './sheets.js';
import { createExploreView } from './views/explore.js';
import { createPulseView } from './views/pulse.js';
import { createSavedView } from './views/saved.js';
import { createAskView } from './views/ask.js';

const TABS = [
  { id: 'explore', label: 'Explore', icon: 'explore' },
  { id: 'pulse', label: 'Pulse', icon: 'pulse' },
  { id: 'saved', label: 'Saved', icon: 'bookmark' },
  { id: 'ask', label: 'Ask', icon: 'sparkle' }
];

const TITLES = { explore: 'Explore', pulse: 'Planet Pulse', saved: 'Saved', ask: 'Ask ECHO' };

function fatal(root, error) {
  console.error(error);
  // Never leave the launch screen up in front of an error message.
  try { window.Capacitor?.Plugins?.SplashScreen?.hide(); } catch { /* nothing to hide */ }
  mount(root, h('div', { class: 'fatal' },
    h('h1', null, 'ECHO could not start'),
    h('p', null, 'Your saved investigations have not been touched. Close ECHO completely and open it again. If this keeps happening, reinstalling the app will fix it, but export a backup first if you can.'),
    h('pre', null, String(error && error.stack ? error.stack : error))));
}

/** Keeps the layout inside the visible area when the on-screen keyboard is open (matters on iOS). */
function watchViewport() {
  const viewport = window.visualViewport;
  if (!viewport) return;
  const target = document.documentElement;
  const update = () => {
    const keyboard = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
    target.style.setProperty('--vvh', `${Math.round(viewport.height)}px`);
    target.style.setProperty('--vvt', `${Math.round(viewport.offsetTop)}px`);
    document.body.classList.toggle('keyboard', keyboard > 120);
  };
  viewport.addEventListener('resize', update);
  viewport.addEventListener('scroll', update);
  window.addEventListener('orientationchange', () => setTimeout(update, 250));
  document.addEventListener('focusout', () => setTimeout(() => { if (!document.activeElement || document.activeElement === document.body) window.scrollTo(0, 0); }, 60));
  update();
}

async function boot() {
  const root = document.getElementById('app');
  const platform = createPlatform();
  document.body.classList.add(`os-${platform.os}`, platform.isNative ? 'native' : 'web');

  const store = createStore(platform.storage);
  await store.load();

  const app = { store, platform };
  app.feed = createEventFeed({ store });
  app.session = createChatSession({ store });
  app.ui = createUi({ platform });
  app.actions = createActions(app);
  app.sheets = createSheets(app);

  const views = {
    explore: createExploreView(app),
    pulse: createPulseView(app),
    saved: createSavedView(app),
    ask: createAskView(app)
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
    for (const button of tabbar.querySelectorAll('[data-nav]')) {
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

  /** Shows the map with a crosshair and resolves with the chosen { lat, lng }, or null if cancelled. */
  app.pickLocation = () => {
    app.go('explore');
    return views.explore.pickLocation();
  };

  app.currentDate = () => views.explore.currentDate();

  const tabbar = h('nav', { class: 'tabbar', 'aria-label': 'Main' }, TABS.map((tab) => h('button', {
    type: 'button', class: 'tab', 'data-nav': tab.id,
    onClick: () => { if (currentName !== tab.id) platform.haptic(); app.go(tab.id); }
  }, ic(tab.icon, { size: 24 }), h('span', null, tab.label))));

  const offlineBar = h('div', { class: 'offline-bar', role: 'status', hidden: true }, ic('wifiOff', { size: 14 }), h('span', null, 'Offline · showing saved data'));

  mount(root, h('div', { class: 'shell' },
    h('main', { class: 'stage' }, Object.values(views).map((view) => view.el)),
    offlineBar,
    tabbar));

  // Android's back button: close a sheet, then step back inside a screen, then go to Explore, then leave.
  const handleBack = () => {
    if (app.ui.closeTop()) return true;
    if (views[currentName]?.back?.()) return true;
    if (currentName !== 'explore') { app.go('explore'); return true; }
    return false;
  };
  app.back = handleBack;
  platform.onBack(handleBack);

  platform.onConnection((online) => { offlineBar.hidden = online; });
  platform.onBackground(() => { store.flush().catch(() => {}); });
  window.addEventListener('pagehide', () => { store.flush().catch(() => {}); });

  window.addEventListener('unhandledrejection', (event) => {
    console.error(event.reason);
    app.ui.toast('Something went wrong. Your data is safe.', { error: true });
  });

  watchViewport();
  app.go('explore');
  window.__echo = { app, views }; // handy for debugging and tests; contains no secrets
  requestAnimationFrame(() => platform.ready());
}

boot().catch((error) => fatal(document.getElementById('app'), error));
