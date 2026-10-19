// Home: where you left off, what the planet is doing, and quick ways to start.

import { h, ic, mount } from '../../shared/ui/dom.js';
import { terrainArt } from '../../shared/ui/art.js';
import {
  describeInvestigation, formatDate, pluralise, relativeDays, topicInfo
} from '../../shared/core/src/index.js';

function greeting(date = new Date()) {
  const hour = date.getHours();
  if (hour < 5) return 'Still up?';
  if (hour < 12) return 'Good morning.';
  if (hour < 18) return 'Good afternoon.';
  return 'Good evening.';
}

export function createHomeView(app) {
  const { store, feed, ui, actions } = app;
  const st = { visible: false, dirty: true, pulse: null, loading: false };
  const root = h('section', { class: 'view home', 'aria-label': 'Home', hidden: true });
  const scroller = h('div', { class: 'home-scroll' });
  root.append(scroller);

  function stat(label, value, hint) {
    return h('div', { class: 'stat' }, h('span', { class: 'stat-value' }, String(value)), h('span', { class: 'stat-label' }, label), hint ? h('small', null, hint) : null);
  }

  function investigationCard(inv, { large = false } = {}) {
    const notes = store.notes(inv.id).length;
    const last = inv.timeline[inv.timeline.length - 1].date;
    return h('button', { type: 'button', class: `inv-card${large ? ' large' : ''}`, onClick: () => app.openInvestigation(inv.id) },
      h('span', { class: 'inv-card-art' }, terrainArt(inv.id, inv.topic, { width: large ? 560 : 320, height: large ? 220 : 130 }),
        h('span', { class: 'pill' }, topicInfo(inv.topic).label)),
      h('span', { class: 'inv-card-body' },
        h('strong', null, inv.title),
        h('small', null, describeInvestigation(inv)),
        h('span', { class: 'inv-card-meta mono' }, `${formatDate(inv.timeline[0].date)} → ${formatDate(last)}`, notes ? ` · ${pluralise(notes, 'note')}` : '')));
  }

  function pulseSection() {
    const pulse = st.pulse;
    const items = (pulse?.items || feed.cached().items).slice(0, 5);
    let status;
    if (st.loading && !items.length) status = 'Loading the latest events from NASA…';
    else if (pulse?.error && !items.length) status = 'Events could not be loaded. Check your connection.';
    else if (pulse?.stale) status = `Offline. Showing events saved ${pulse.fetchedAt ? relativeDays(pulse.fetchedAt.slice(0, 10)) : 'earlier'}.`;
    else if (pulse?.fetchedAt) status = 'Live from NASA EONET';
    else status = items.length ? 'Saved on this computer' : 'No events yet';

    return h('section', { class: 'home-block' },
      h('div', { class: 'block-head' }, h('h2', null, 'Planet Pulse'), h('button', { type: 'button', class: 'btn btn-ghost', onClick: () => app.go('pulse') }, 'See all', ic('chevronRight', { size: 16 }))),
      h('p', { class: 'muted small' }, status),
      items.length
        ? h('ul', { class: 'event-mini' }, items.map((event) => h('li', null, h('button', { type: 'button', class: 'event-row', onClick: () => app.go('pulse', { eventId: event.id }) },
          h('span', { class: 'event-dot', style: { background: event.color } }),
          h('span', { class: 'event-text' }, h('strong', null, event.title), h('small', null, `${event.category} · ${relativeDays(event.date)}`)),
          ic('chevronRight', { size: 16 })))))
        : null);
  }

  function render() {
    const all = store.list();
    const active = store.active();
    const recent = all.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).filter((inv) => inv.id !== active?.id).slice(0, 6);
    const eventCount = (st.pulse?.items || feed.cached().items).length;

    mount(scroller,
      h('header', { class: 'home-hero' },
        h('div', { class: 'home-hero-text' },
          h('span', { class: 'eyebrow' }, 'Earth intelligence for everyone'),
          h('h1', null, greeting(), h('br'), h('span', null, 'See the whole story.')),
          h('p', null, 'Real NASA satellite imagery, live Earth events and a notebook for what you find. Pick up an investigation or start a new one.'),
          h('div', { class: 'button-row' },
            h('button', { type: 'button', class: 'btn btn-primary', onClick: () => app.dialogs.newInvestigation() }, ic('plus', { size: 16 }), 'New investigation'),
            h('button', { type: 'button', class: 'btn', onClick: () => app.go('pulse') }, ic('pulse', { size: 16 }), 'Investigate a live event'),
            h('button', { type: 'button', class: 'btn btn-ghost', onClick: () => actions.importWorkspace() }, ic('upload', { size: 16 }), 'Import backup')))),
      h('div', { class: 'home-grid' },
        h('div', { class: 'home-main' },
          active ? h('section', { class: 'home-block' },
            h('div', { class: 'block-head' }, h('h2', null, 'Continue')),
            investigationCard(active, { large: true })) : h('section', { class: 'home-block' }, h('p', { class: 'muted' }, 'No investigations yet. Create one to get started.')),
          recent.length ? h('section', { class: 'home-block' },
            h('div', { class: 'block-head' }, h('h2', null, 'Your investigations'), h('button', { type: 'button', class: 'btn btn-ghost', onClick: () => app.go('investigations') }, 'Manage', ic('chevronRight', { size: 16 }))),
            h('div', { class: 'inv-grid' }, recent.map((inv) => investigationCard(inv)))) : null),
        h('aside', { class: 'home-side' },
          h('div', { class: 'stats' },
            stat('Investigations', all.length),
            stat('Field notes', store.noteCount()),
            stat('Live events', eventCount || '—')),
          pulseSection(),
          h('section', { class: 'home-block note-block' },
            h('h2', null, 'About the imagery'),
            h('p', { class: 'muted small' }, 'Daily NASA MODIS and VIIRS imagery at about 250 m per pixel. Great for regional change, not for buildings. ECHO shows the data; it does not tell you what happened.'),
            h('button', { type: 'button', class: 'btn', onClick: () => app.dialogs.aboutData() }, ic('info', { size: 16 }), 'About the data')))));
    st.dirty = false;
  }

  async function loadPulse() {
    if (st.loading) return;
    st.loading = true;
    try {
      st.pulse = await feed.load();
    } finally {
      st.loading = false;
      if (st.visible) render();
    }
  }

  store.subscribe((event) => { if (event.type === 'settings') return; if (st.visible) render(); else st.dirty = true; });

  return {
    el: root,
    name: 'home',
    show() {
      st.visible = true;
      render();
      loadPulse();
    },
    hide() { st.visible = false; }
  };
}
