// The Field Report: everything ECHO knows about the selected place, in the order an
// investigator needs it. One panel, updated in place when the selection changes.

import { h, mount } from '../../../packages/ui/dom.js';
import { formatDate, formatDateLong, relativeDays } from '../../../packages/core/src/dates.js';
import { formatLatLng } from '../../../packages/core/src/geo.js';
import { SUGGESTIONS } from '../../../packages/core/src/chat.js';
import { pluralise } from '../../../packages/core/src/text.js';
import { gibsSnapshotUrl } from './sources.js';
import { formatNumber } from './subjects.js';
import { categoryIcon, ic, revealIn } from './ui.js';

const SECTIONS = [
  ['overview', 'Overview'], ['window', 'Event window'], ['evidence', 'Evidence'], ['analysis', 'Analysis'],
  ['interpretation', 'Interpretation'], ['points', 'Points'], ['live', 'Live visuals'], ['ask', 'Ask ECHO']
];

function tag(kind) {
  const labels = { verified: 'Verified source', reference: 'Reference', interpretation: 'Interpretation', notmeasured: 'Not measured', live: 'Near real time', daily: 'Daily' };
  return h('span', { class: `tag tag-${kind}` }, kind === 'verified' ? ic('check', { size: 11, stroke: 2.4 }) : null, labels[kind]);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function dayMonth(iso) { return `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]}`; }

function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

/** A small line chart of the reported size or strength over time (inline SVG). */
function sparkline(series) {
  const w = 300;
  const hgt = 64;
  const pad = 6;
  const values = series.map((s) => s.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const t0 = new Date(series[0].date).getTime();
  const t1 = new Date(series[series.length - 1].date).getTime();
  const x = (d) => pad + ((new Date(d).getTime() - t0) / Math.max(1, t1 - t0)) * (w - pad * 2);
  const y = (v) => hgt - pad - ((v - min) / Math.max(1e-9, max - min)) * (hgt - pad * 2);
  const svg = h('svg:svg', { viewBox: `0 0 ${w} ${hgt}`, class: 'spark', role: 'img', 'aria-label': `Reported ${series[0].unit} from ${formatNumber(values[0])} on ${formatDateLong(series[0].date)} to ${formatNumber(values[values.length - 1])} on ${formatDateLong(series[series.length - 1].date)}` });
  const d = series.map((s, i) => `${i ? 'L' : 'M'}${x(s.date).toFixed(1)},${y(s.value).toFixed(1)}`).join(' ');
  svg.append(h('svg:path', { d, class: 'spark-line' }));
  series.forEach((s) => svg.append(h('svg:circle', { cx: x(s.date).toFixed(1), cy: y(s.value).toFixed(1), r: '2.6', class: 'spark-dot' })));
  return h('figure', { class: 'spark-wrap' }, svg,
    h('figcaption', null, h('span', null, `${formatNumber(values[0])} ${series[0].unit}`, h('small', null, formatDate(series[0].date))), h('span', null, `${formatNumber(values[values.length - 1])} ${series[0].unit}`, h('small', null, formatDate(series[series.length - 1].date)))));
}

export function createReport(app) {
  const { state, store, ui } = app;
  let model = null;

  const root = h('section', { class: 'report panel', id: 'report', 'aria-labelledby': 'report-title', hidden: true, tabindex: '-1' });
  const grab = h('button', { type: 'button', class: 'sheet-grab', 'aria-label': 'Resize the field report', onClick: () => app.cycleSheet?.('report') }, h('span'));
  const head = h('header', { class: 'report-head' });
  const nav = h('nav', { class: 'report-nav', 'aria-label': 'Report sections' });
  const body = h('div', { class: 'report-body' });
  root.append(grab, head, nav, body);

  /* ---------------- header ---------------- */
  function renderHead() {
    const saved = model.kind === 'event' ? app.savedFor(model.id) : null;
    const actions = [];
    if (model.kind === 'event') {
      actions.push(saved
        ? h('button', { type: 'button', class: 'pill-button is-done', onClick: () => app.openInvestigation(saved.id, { asInvestigation: true }) }, ic('check', { size: 15, stroke: 2.2 }), 'Saved')
        : h('button', { type: 'button', class: 'pill-button', onClick: () => app.saveEvent(model.id) }, ic('bookmark', { size: 15 }), 'Save'));
    }
    actions.push(
      h('button', { type: 'button', class: `pill-button${state.imagery.compare ? ' is-on' : ''}`, 'aria-pressed': String(state.imagery.compare), onClick: () => app.setCompare(!state.imagery.compare) }, ic('compare', { size: 15 }), 'Compare'),
      h('button', { type: 'button', class: 'pill-button', onClick: () => app.shareSelection() }, ic('share', { size: 15 }), 'Share'),
      h('button', { type: 'button', class: 'pill-button', onClick: () => app.exportSelection() }, ic('download', { size: 15 }), 'Export'));
    if (model.kind === 'inv' && model.tone === 'mine') {
      actions.push(h('button', { type: 'button', class: 'pill-button', onClick: () => app.renameInvestigation(model.id) }, ic('edit', { size: 15 }), 'Rename'),
        h('button', { type: 'button', class: 'pill-button is-danger', onClick: () => app.deleteInvestigation(model.id) }, ic('trash', { size: 15 }), 'Delete'));
    }
    const kicker = model.kind === 'event'
      ? h('p', { class: 'report-kicker' }, h('span', { class: `kick-mark${model.recent ? ' is-recent' : ''}`, 'aria-hidden': 'true' }), categoryIcon(model.categoryId, { size: 14, stroke: 1.9 }), h('span', null, model.category), h('span', { class: 'kick-status' }, model.statusLine))
      : h('p', { class: 'report-kicker is-inv' }, h('span', { class: 'kick-ring', 'aria-hidden': 'true' }), categoryIcon(model.categoryId, { size: 14, stroke: 1.9 }), h('span', null, model.kindLabel), h('span', { class: 'kick-status' }, model.category));
    mount(head,
      h('div', { class: 'report-topline' }, h('span', { class: 'report-label' }, 'Field Report'),
        h('button', { type: 'button', class: 'icon-button report-close', 'aria-label': 'Close field report', onClick: () => app.closeReport() }, ic('close', { size: 18 }))),
      kicker,
      h('h2', { class: 'report-title', id: 'report-title' }, model.title),
      h('p', { class: 'report-place' }, model.place && model.place !== model.title ? h('span', null, model.place) : null, h('button', { type: 'button', class: 'coord-button', title: 'Show on the map', onClick: () => app.focusSubject() }, formatLatLng(model.lat, model.lng, 3))),
      h('div', { class: 'report-actions', 'data-no-drag': '' }, actions));
  }

  function renderNav() {
    mount(nav, ...SECTIONS.map(([id, label]) => h('a', { href: `#rs-${id}`, class: 'nav-link', onClick: (e) => { e.preventDefault(); app.expandReport?.(); if (id === 'ask') askSoon(); requestAnimationFrame(() => revealIn(body, body.querySelector(`#rs-${id}`), { block: 'start', smooth: !app.reducedMotion })); } }, label)));
  }

  const section = (id, title, ...children) => h('section', { class: 'rs', id: `rs-${id}`, 'aria-labelledby': `rs-${id}-h` }, h('h3', { class: 'rs-title', id: `rs-${id}-h` }, title), ...children);

  /* ---------------- A. overview ---------------- */
  function overview() {
    return section('overview', 'Overview',
      h('p', { class: 'rs-lead' }, model.summary),
      h('dl', { class: 'facts' }, model.facts.map((f) => h('div', { class: 'fact' }, h('dt', null, f.label), h('dd', { class: f.mono ? 'num' : null }, f.value)))),
      h('p', { class: 'provenance' }, model.kind === 'event' ? `Built from the NASA EONET record${app.state.feed.fetchedAt ? `, checked ${relativeDays(app.state.feed.fetchedAt.slice(0, 10))}` : ''}${app.state.feed.stale ? ' (offline copy)' : ''}.` : model.provenance));
  }

  /* ---------------- B. event window ---------------- */
  function windowSection() {
    const nasaToggle = h('label', { class: 'switch-row compact' }, h('input', { type: 'checkbox', checked: state.imagery.nasa, onChange: (e) => app.setNasa(e.target.checked) }), h('span', { class: 'switch' }), h('span', null, 'Show NASA imagery for the chosen date'));
    const items = model.window.items.map((item) => {
      const active = state.imagery.index === item.timelineIndex && item.timelineIndex !== null && (state.imagery.nasa || state.imagery.compare);
      return h('li', { class: `win-item win-${item.kind}${active ? ' is-active' : ''}` }, h('button', {
        type: 'button', class: 'win-button', 'aria-pressed': item.timelineIndex !== null ? String(active) : null,
        onClick: () => app.chooseWindowItem(item)
      }, h('time', { datetime: item.date, class: 'win-date' }, dayMonth(item.date), h('small', null, item.date.slice(0, 4))), h('span', { class: 'win-text' }, h('span', { class: 'win-title' }, item.title), item.detail ? h('span', { class: 'win-detail' }, item.detail) : null)));
    });
    return section('window', 'Event window',
      h('p', { class: 'rs-note' }, model.kind === 'event' ? 'Each entry is a report the source made. Choose one to move the map there; with imagery on, the map shows NASA’s picture of that day.' : 'The dates this investigation compares. Choose one to see NASA’s imagery for that day.'),
      nasaToggle,
      h('ol', { class: 'win-list' }, items),
      model.window.hiddenUpdates ? h('p', { class: 'rs-note' }, `${pluralise(model.window.hiddenUpdates, 'more update')} between these, shown as the dotted track on the map.`) : null,
      model.window.series.length ? sparkline(model.window.series) : null);
  }

  /* ---------------- C. evidence ---------------- */
  function evidence() {
    const imagery = state.settings.imagery;
    const thumbs = model.evidence.imagery.map((shot) => {
      const src = gibsSnapshotUrl({ lat: model.lat, lng: model.lng, date: shot.date, imagery, spanKm: model.evidence.spanKm, width: 320, height: 200 });
      const img = h('img', { src, alt: '', loading: 'lazy', decoding: 'async', width: 320, height: 200 });
      const card = h('button', { type: 'button', class: 'shot', onClick: () => app.openSnapshot(shot) },
        h('span', { class: 'shot-frame' }, img, h('span', { class: 'shot-fallback' }, ic('image', { size: 18 }), 'No image')),
        h('span', { class: 'shot-role' }, shot.role), h('time', { class: 'shot-date', datetime: shot.date }, `${dayMonth(shot.date)} ${shot.date.slice(0, 4)}`));
      img.addEventListener('error', () => card.classList.add('is-missing'));
      return card;
    });
    const link = (s) => h('li', null, h('a', { class: 'source', href: s.url, target: '_blank', rel: 'noopener noreferrer' },
      h('span', { class: 'source-text' }, h('span', { class: 'source-title' }, s.label), h('span', { class: 'source-detail' }, `${s.detail} · ${hostOf(s.url)}`)),
      tag(s.verified ? 'verified' : 'reference'), ic('external', { size: 14 })));
    const verified = [...model.evidence.sources, ...model.evidence.records].filter((s) => s.verified);
    const reference = [...model.evidence.sources, ...model.evidence.records].filter((s) => !s.verified);
    return section('evidence', 'Evidence',
      h('div', { class: 'shots-head' }, h('h4', null, 'Satellite imagery'), tag('daily')),
      h('div', { class: 'shots' }, thumbs),
      h('p', { class: 'rs-note' }, `NASA ${imagery === 'viirs' ? 'VIIRS' : imagery === 'aqua' ? 'MODIS Aqua' : 'MODIS Terra'} true colour, about 250 m per pixel, about ${formatNumber(model.evidence.spanKm)} km across. Clouds and smoke can hide the ground. Open an image to inspect it or compare it on the map.`),
      verified.length ? h('div', null, h('h4', null, model.kind === 'event' ? 'Official reports' : 'Sources'), h('ul', { class: 'sources' }, verified.map(link))) : null,
      reference.length ? h('div', null, h('h4', null, 'Where to look further'), h('p', { class: 'rs-note' }, 'General data sources, not reports about this event.'), h('ul', { class: 'sources' }, reference.map(link))) : null);
  }

  /* ---------------- D. trials and analysis ---------------- */
  function analysis() {
    const rows = model.analysis.map((a) => {
      let control;
      if (a.action === 'compare') control = h('button', { type: 'button', class: `btn btn-small${state.imagery.compare ? ' is-on' : ''}`, 'aria-pressed': String(state.imagery.compare), onClick: () => app.setCompare(!state.imagery.compare) }, state.imagery.compare ? 'Close' : 'Open');
      else if (a.action === 'layer') control = h('label', { class: 'switch-row' }, h('input', { type: 'checkbox', checked: Boolean(state.layers[a.layer]), 'aria-label': a.title, onChange: (e) => app.setDataLayer(a.layer, e.target.checked) }), h('span', { class: 'switch' }));
      else if (a.action === 'trend') control = a.available ? h('button', { type: 'button', class: 'btn btn-small', onClick: () => revealIn(body, body.querySelector('.spark-wrap'), { smooth: !app.reducedMotion }) }, 'View') : tag('notmeasured');
      return h('li', { class: `an-item${a.available ? '' : ' is-off'}${a.suggested ? ' is-suggested' : ''}` },
        h('span', { class: 'an-text' }, h('span', { class: 'an-title' }, a.title, a.suggested ? h('span', { class: 'an-hint' }, 'Useful here') : null), h('span', { class: 'an-detail' }, a.detail)), control);
    });
    return section('analysis', 'Trials and analysis',
      h('p', { class: 'rs-note' }, 'Methods you can run in ECHO now. Each shows source data; none produces a measurement.'),
      h('ul', { class: 'an-list' }, rows),
      h('p', { class: 'caveat' }, ic('info', { size: 14 }), model.notRun.join(' ')));
  }

  /* ---------------- E. interpretation ---------------- */
  function interpretation() {
    return section('interpretation', 'Interpretation',
      h('div', { class: 'interp interp-observed' }, h('div', { class: 'interp-head' }, h('h4', null, 'What the sources show'), tag('verified')), h('ul', null, model.interpretation.observed.map((line) => h('li', null, line)))),
      h('div', { class: 'interp interp-meaning' }, h('div', { class: 'interp-head' }, h('h4', null, 'What it may mean'), tag('interpretation')), h('p', null, model.interpretation.meaning), model.kind === 'event' ? h('p', { class: 'rs-note' }, `General guidance for ${model.category.toLowerCase()}, not an assessment of this event.`) : null),
      h('div', { class: 'interp interp-unknown' }, h('div', { class: 'interp-head' }, h('h4', null, 'Still unknown')), h('ul', null, model.interpretation.unknown.map((line) => h('li', null, line)))));
  }

  /* ---------------- F. investigation points ---------------- */
  function points() {
    const saved = model.kind === 'inv' && model.tone !== 'case' ? store.get(model.id) : model.kind === 'event' ? app.savedFor(model.id) : store.get(model.id);
    const notes = saved ? store.notes(saved.id) : [];
    const noteBox = h('textarea', { class: 'input note-input', rows: 2, maxlength: 2000, placeholder: 'What did you notice? Note the date and the source.', 'aria-label': 'New note' });
    const pinIt = h('input', { type: 'checkbox', checked: true });
    const noteError = h('p', { class: 'field-error', role: 'alert' });
    const composer = saved
      ? h('form', { class: 'note-form', onSubmit: (e) => { e.preventDefault(); const text = noteBox.value.trim(); if (!text) { noteError.textContent = 'Write the note first.'; noteBox.focus(); return; } app.addNote(saved.id, text, { pin: pinIt.checked }); } },
        noteBox, noteError,
        h('div', { class: 'note-actions' }, h('label', { class: 'check-row' }, pinIt, h('span', null, 'Pin it on the map')), h('button', { type: 'submit', class: 'btn btn-primary btn-small' }, 'Add note')))
      : h('div', { class: 'note-empty' }, h('p', null, 'Save this event to keep notes and pins with it.'), h('button', { type: 'button', class: 'btn btn-small', onClick: () => app.saveEvent(model.id) }, ic('bookmark', { size: 15 }), 'Save'));
    return section('points', 'Investigation points',
      h('h4', null, 'Places to inspect'),
      h('ul', { class: 'pt-list' }, model.points.map((p) => h('li', null, h('button', { type: 'button', class: 'pt-item', onClick: () => app.focusPoint(p) },
        ic('target', { size: 15 }), h('span', { class: 'pt-text' }, h('span', { class: 'pt-name' }, p.name), h('span', { class: 'pt-detail' }, p.detail)))))),
      h('h4', null, 'Questions to answer'),
      h('ol', { class: 'q-list' }, model.questions.map((q) => h('li', null, h('strong', null, q.title), h('span', null, q.detail)))),
      h('h4', null, `Your notes${notes.length ? ` (${notes.length})` : ''}`),
      notes.length ? h('ul', { class: 'note-list' }, notes.slice().reverse().map((n) => h('li', { class: 'note' },
        h('p', null, n.text),
        h('div', { class: 'note-meta' }, h('time', { datetime: n.createdAt }, formatDateLong(n.createdAt.slice(0, 10))),
          n.lat !== undefined ? h('button', { type: 'button', class: 'link-button', onClick: () => app.focusPoint({ lat: n.lat, lng: n.lng }) }, ic('pin', { size: 13 }), 'On the map') : null,
          h('button', { type: 'button', class: 'link-button', 'aria-label': 'Delete note', onClick: () => app.removeNote(saved.id, n.id) }, ic('trash', { size: 13 }), 'Delete'))))) : null,
      composer);
  }

  /* ---------------- G. live visuals ---------------- */
  function live() {
    const rows = model.live.map((s) => s.kind === 'in-app'
      ? h('li', null, h('button', { type: 'button', class: 'live-item', onClick: () => app.openLatestImage() },
        h('span', { class: 'live-icon' }, ic('image', { size: 18 })), h('span', { class: 'live-text' }, h('span', { class: 'live-title' }, s.title), h('span', { class: 'live-detail' }, s.detail)), tag('daily')))
      : h('li', null, h('a', { class: 'live-item', href: s.url, target: '_blank', rel: 'noopener noreferrer' },
        h('span', { class: 'live-icon' }, ic(s.id === 'firms' ? 'fire' : 'globe', { size: 18 })),
        h('span', { class: 'live-text' }, h('span', { class: 'live-title' }, s.title), h('span', { class: 'live-detail' }, `${s.detail} Opens ${hostOf(s.url)}.`)),
        s.freshness === 'Updated daily' ? tag('daily') : tag('live'), ic('external', { size: 14 }))));
    return section('live', 'Live visuals',
      h('ul', { class: 'live-list' }, rows),
      h('p', { class: 'caveat' }, ic('info', { size: 14 }), 'No verified live camera or video stream is connected for this place. The satellite viewers above are the freshest public pictures available.'));
  }

  /* ---------------- H. ask ECHO (coming soon) ---------------- */
  // The assistant is switched off for now. The section stays, so people can see what is coming,
  // and anything they try with it explains that it is on the way.
  const ASK_SOON = 'Ask ECHO will be here soon. We are still building it.';
  function askSoon() { ui.toast(ASK_SOON); }
  function askSection() {
    const box = h('textarea', { class: 'input chat-input', rows: 1, readonly: true, placeholder: 'Ask about this place…', 'aria-label': 'Question for ECHO (coming soon)', onFocus: askSoon });
    const send = h('button', { type: 'button', class: 'icon-button chat-send', 'aria-label': 'Send question (coming soon)' }, ic('send', { size: 18 }));
    return section('ask', 'Ask ECHO',
      h('p', { class: 'rs-note soon-note' }, h('span', { class: 'tag tag-soon' }, 'Coming soon'), 'An evidence-led assistant for questions about this place.'),
      h('div', { class: 'chips is-soon' }, SUGGESTIONS.map((q) => h('button', { type: 'button', class: 'chip', onClick: askSoon }, q))),
      h('form', { class: 'chat-form is-soon', onSubmit: (e) => { e.preventDefault(); askSoon(); }, onClick: (e) => { if (e.target !== box) askSoon(); } }, box, send));
  }

  // Highlight the section being read in the quick navigation.
  let spy = null;
  function watchSections() {
    spy?.disconnect();
    if (typeof IntersectionObserver !== 'function') return;
    const visible = new Map();
    spy = new IntersectionObserver((entries) => {
      for (const e of entries) visible.set(e.target.id, e.isIntersecting ? e.boundingClientRect.top : null);
      const current = [...body.querySelectorAll('.rs')].find((s) => visible.get(s.id) !== null && visible.get(s.id) !== undefined);
      nav.querySelectorAll('.nav-link').forEach((a) => {
        const on = current && a.getAttribute('href') === `#${current.id}`;
        a.setAttribute('aria-current', on ? 'true' : 'false');
        // Scroll only the navigation strip (scrollIntoView would also scroll the panel itself).
        if (on && (a.offsetLeft < nav.scrollLeft || a.offsetLeft + a.offsetWidth > nav.scrollLeft + nav.clientWidth)) nav.scrollLeft = Math.max(0, a.offsetLeft - 12);
      });
    }, { root: body, rootMargin: '0px 0px -60% 0px' });
    body.querySelectorAll('.rs').forEach((s) => spy.observe(s));
  }

  function renderBody({ keepScroll = false } = {}) {
    const top = body.scrollTop;
    mount(body, overview(), windowSection(), evidence(), analysis(), interpretation(), points(), live(), askSection(),
      h('p', { class: 'report-foot' }, 'ECHO shows source data and imagery. It does not measure events or replace official guidance.'));
    if (keepScroll) body.scrollTop = top;
    watchSections();
  }

  return {
    el: root, grab, head,
    get model() { return model; },
    show(next) {
      const same = model && next && model.kind === next.kind && model.id === next.id;
      model = next;
      root.hidden = false;
      renderHead();
      if (!same) renderNav();
      renderBody({ keepScroll: same });
      if (!same) body.scrollTop = 0;
    },
    /** Re-renders after a change (a note, a toggle) without losing the reading position. */
    refresh() { if (model) { renderHead(); renderBody({ keepScroll: true }); } },
    hide() { root.hidden = true; model = null; },
    focusTitle() { root.querySelector('.report-close')?.focus({ preventScroll: true }); }
  };
}
