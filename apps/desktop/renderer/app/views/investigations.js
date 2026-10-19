// Investigations: every workspace in one table, with search, sort and housekeeping.

import { h, ic, mount } from '../../shared/ui/dom.js';
import { terrainArt } from '../../shared/ui/art.js';
import {
  TOPICS, TOPIC_ORDER, describeInvestigation, formatDate, pluralise, relativeDays, topicInfo
} from '../../shared/core/src/index.js';

const SORTS = {
  updated: { label: 'Recently updated', compare: (a, b) => b.updatedAt.localeCompare(a.updatedAt) },
  created: { label: 'Newest first', compare: (a, b) => b.createdAt.localeCompare(a.createdAt) },
  title: { label: 'Name (A to Z)', compare: (a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }) }
};

const KIND_LABEL = { demo: 'Demo', event: 'Event', custom: 'Yours' };

export function createInvestigationsView(app) {
  const { store, ui, actions } = app;
  const st = { query: '', topic: 'all', sort: 'updated', visible: false };
  const root = h('section', { class: 'view table-view', 'aria-label': 'Investigations', hidden: true });

  const search = h('input', { class: 'input', type: 'search', placeholder: 'Search investigations', 'aria-label': 'Search investigations', onInput: () => { st.query = search.value; renderRows(); } });
  const topicSelect = h('select', { class: 'select', 'aria-label': 'Filter by topic', onChange: () => { st.topic = topicSelect.value; renderRows(); } },
    h('option', { value: 'all' }, 'All topics'), TOPIC_ORDER.map((key) => h('option', { value: key }, TOPICS[key].label)));
  const sortSelect = h('select', { class: 'select', 'aria-label': 'Sort', onChange: () => { st.sort = sortSelect.value; renderRows(); } },
    Object.entries(SORTS).map(([key, sort]) => h('option', { value: key }, sort.label)));
  const body = h('tbody');
  const emptyEl = h('div', { class: 'table-empty', hidden: true });
  const count = h('span', { class: 'muted small' });

  const iconButton = (icon, label, onClick, extra = {}) => h('button', { type: 'button', class: 'btn btn-ghost btn-icon', title: label, 'aria-label': label, onClick, ...extra }, ic(icon, { size: 16 }));

  root.append(
    h('header', { class: 'view-head' },
      h('div', null, h('h1', null, 'Investigations'), count),
      h('div', { class: 'button-row' },
        h('button', { type: 'button', class: 'btn', onClick: () => actions.importWorkspace() }, ic('upload', { size: 16 }), 'Import'),
        h('button', { type: 'button', class: 'btn', onClick: () => actions.exportWorkspace() }, ic('download', { size: 16 }), 'Export all'),
        h('button', { type: 'button', class: 'btn btn-primary', onClick: () => app.dialogs.newInvestigation() }, ic('plus', { size: 16 }), 'New investigation'))),
    h('div', { class: 'toolbar' }, search, topicSelect, sortSelect),
    h('div', { class: 'table-wrap' },
      h('table', { class: 'data-table' },
        h('caption', { class: 'sr-only' }, 'Your investigations'),
        h('thead', null, h('tr', null,
          ['Investigation', 'Topic', 'Imagery dates', 'Notes', 'Updated'].map((label) => h('th', { scope: 'col' }, label)),
          h('th', { scope: 'col', class: 'sr-only' }, 'Actions'))),
        body),
      emptyEl));

  function matches(inv) {
    if (st.topic !== 'all' && inv.topic !== st.topic) return false;
    const query = st.query.trim().toLowerCase();
    if (!query) return true;
    return `${inv.title} ${describeInvestigation(inv)} ${topicInfo(inv.topic).label}`.toLowerCase().includes(query);
  }

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

  function renderRows() {
    const all = store.list();
    const rows = all.filter(matches).sort(SORTS[st.sort].compare);
    count.textContent = `${rows.length} of ${all.length}`;
    mount(body, ...rows.map((inv) => {
      const notes = store.notes(inv.id).length;
      const first = inv.timeline[0].date;
      const last = inv.timeline[inv.timeline.length - 1].date;
      return h('tr', null,
        h('td', { class: 'cell-title' }, h('button', { type: 'button', class: 'row-open', onClick: () => app.openInvestigation(inv.id) },
          h('span', { class: 'inv-thumb' }, terrainArt(inv.id, inv.topic, { width: 96, height: 72 })),
          h('span', { class: 'inv-text' }, h('strong', null, inv.title), h('small', null, describeInvestigation(inv))))),
        h('td', null, h('span', { class: 'pill' }, topicInfo(inv.topic).label), ' ', h('span', { class: `pill${inv.kind === 'custom' ? '' : ' pill-amber'}` }, KIND_LABEL[inv.kind] || 'Yours')),
        h('td', { class: 'mono small' }, `${formatDate(first)} → ${formatDate(last)}`),
        h('td', { class: 'mono small' }, notes || '—'),
        h('td', { class: 'small muted' }, relativeDays(inv.updatedAt.slice(0, 10))),
        h('td', { class: 'cell-actions' },
          iconButton('edit', `Rename ${inv.title}`, () => rename(inv)),
          iconButton('copy', `Duplicate ${inv.title}`, () => duplicate(inv)),
          iconButton('download', `Export report for ${inv.title}`, () => actions.exportReport(inv.id)),
          iconButton('trash', `Delete ${inv.title}`, () => remove(inv))));
    }));
    emptyEl.hidden = rows.length > 0;
    if (!rows.length) {
      mount(emptyEl, h('p', null, all.length ? 'No investigation matches that search.' : 'You have no investigations.'),
        h('button', { type: 'button', class: 'btn btn-primary', onClick: () => (all.length ? clearFilters() : app.dialogs.newInvestigation()) }, all.length ? 'Clear filters' : 'New investigation'));
    }
  }

  function clearFilters() {
    st.query = ''; st.topic = 'all';
    search.value = ''; topicSelect.value = 'all';
    renderRows();
  }

  store.subscribe((event) => { if (event.type !== 'settings' && st.visible) renderRows(); });

  return {
    el: root,
    name: 'investigations',
    show() { st.visible = true; renderRows(); },
    hide() { st.visible = false; },
    focusSearch() { search.focus(); }
  };
}
