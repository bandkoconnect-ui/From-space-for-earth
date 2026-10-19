// Saved: every investigation on this phone, with rename, duplicate, export and delete.

import { h, ic, mount } from '../../shared/ui/dom.js';
import { terrainArt } from '../../shared/ui/art.js';
import { describeInvestigation, pluralise, relativeDays, topicInfo } from '../../shared/core/src/index.js';

const KIND_LABEL = { demo: 'Demo', event: 'Event', custom: 'Yours' };
const SEARCH_FROM = 6; // a search box only earns its space once the list is long

export function createSavedView(app) {
  const { store, ui, platform, actions } = app;
  const st = { query: '', visible: false };

  const root = h('section', { class: 'view saved', 'aria-label': 'Saved investigations', hidden: true });
  const count = h('p', { class: 'muted small' });
  const search = h('input', { class: 'input', type: 'search', placeholder: 'Search investigations', 'aria-label': 'Search investigations', enterkeyhint: 'search', onInput: () => { st.query = search.value; render(); } });
  const listEl = h('div', { class: 'saved-list' });

  root.append(
    h('header', { class: 'page-head' },
      h('div', { class: 'page-title' },
        h('div', null, h('h1', null, 'Saved'), count),
        h('div', { class: 'head-actions' },
          h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'New investigation', onClick: () => app.sheets.newInvestigation() }, ic('plus')),
          h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Settings', onClick: () => app.sheets.settings() }, ic('settings')))),
      search),
    h('div', { class: 'scroll-y saved-scroll' }, listEl));

  async function rename(inv) {
    const title = await ui.prompt({ title: 'Rename investigation', label: 'Name', value: inv.title });
    if (title && title !== inv.title) {
      try { store.update(inv.id, { title }); } catch (error) { ui.toast(error.message, { error: true }); }
    }
  }

  async function remove(inv) {
    const notes = store.notes(inv.id).length;
    const ok = await ui.confirm({
      title: `Delete “${inv.title}”?`,
      message: `${notes ? `Its ${pluralise(notes, 'note')} will be deleted too. ` : ''}This cannot be undone.${inv.kind === 'demo' ? ' You can bring the demos back from Settings.' : ''}`,
      confirmLabel: 'Delete',
      danger: true
    });
    if (ok) { store.remove(inv.id); ui.toast('Investigation deleted.'); }
  }

  function duplicate(inv) {
    try {
      store.duplicate(inv.id);
      ui.toast('Duplicated. Your copy is now the active investigation.');
    } catch (error) {
      ui.toast(error.message, { error: true });
    }
  }

  function openMenu(inv) {
    ui.actionSheet({
      title: inv.title,
      actions: [
        { label: 'Open on the map', icon: 'explore', onClick: () => app.openInvestigation(inv.id) },
        { label: 'Rename', icon: 'edit', onClick: () => rename(inv) },
        { label: 'Duplicate', icon: 'copy', onClick: () => duplicate(inv) },
        { label: 'Export report', icon: 'download', onClick: () => actions.exportReport(inv.id) },
        { label: 'Delete', icon: 'trash', kind: 'danger', onClick: () => remove(inv) }
      ]
    });
  }

  function matches(inv) {
    const query = st.query.trim().toLowerCase();
    if (!query) return true;
    return `${inv.title} ${describeInvestigation(inv)} ${topicInfo(inv.topic).label}`.toLowerCase().includes(query);
  }

  function render() {
    const all = store.list();
    const rows = all.filter(matches);
    search.hidden = all.length < SEARCH_FROM;
    count.textContent = all.length ? `${pluralise(all.length, 'investigation')} · stored on this phone` : '';
    if (!rows.length) {
      mount(listEl, h('div', { class: 'empty-card inline' },
        ic('bookmark', { size: 32 }),
        h('h2', null, all.length ? 'No match' : 'Nothing saved yet'),
        h('p', { class: 'muted' }, all.length ? 'No investigation matches that search.' : 'Investigations you create, and ones you start from live events, appear here.'),
        h('button', { type: 'button', class: 'btn btn-primary', onClick: () => (all.length ? clearSearch() : app.sheets.newInvestigation()) }, all.length ? 'Clear search' : 'New investigation')));
      return;
    }
    const activeId = store.active()?.id;
    mount(listEl, ...rows.map((inv) => {
      const notes = store.notes(inv.id).length;
      return h('article', { class: `saved-card${inv.id === activeId ? ' active' : ''}` },
        h('button', { type: 'button', class: 'saved-open', onClick: () => { platform.haptic(); app.openInvestigation(inv.id); } },
          h('span', { class: 'thumb' }, terrainArt(inv.id, inv.topic, { width: 128, height: 128 })),
          h('span', { class: 'text' },
            h('strong', null, inv.title),
            h('small', null, describeInvestigation(inv)),
            h('span', { class: 'meta' },
              h('span', { class: 'pill' }, topicInfo(inv.topic).label),
              h('span', { class: `pill${inv.kind === 'custom' ? '' : ' pill-amber'}` }, KIND_LABEL[inv.kind] || 'Yours'),
              notes ? h('span', { class: 'meta-text' }, `${pluralise(notes, 'note')}`) : null,
              h('span', { class: 'meta-text' }, relativeDays(inv.updatedAt.slice(0, 10)))))),
        h('button', { type: 'button', class: 'icon-btn more', 'aria-label': `More actions for ${inv.title}`, onClick: () => openMenu(inv) }, ic('more')));
    }));
  }

  function clearSearch() {
    st.query = '';
    search.value = '';
    render();
  }

  store.subscribe((event) => { if (event.type !== 'settings' && st.visible) render(); });

  return {
    el: root,
    name: 'saved',
    show() { st.visible = true; render(); },
    hide() { st.visible = false; },
    back() { return false; }
  };
}
