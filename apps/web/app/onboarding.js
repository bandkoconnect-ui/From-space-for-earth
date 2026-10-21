// Three welcome cards after someone creates an account (never after logging back in).
// Skip at any time, or Next, Next, then Start exploring.

import { h } from '../../../packages/ui/dom.js';

const s = (tag, attrs, ...kids) => h(`svg:${tag}`, attrs, ...kids);

/* Small drawings in the app's own palette: mint for ECHO, red for events, amber for interpretation. */
function artPlanet() {
  return s('svg', { viewBox: '0 0 240 150', class: 'ob-art', 'aria-hidden': 'true' },
    s('defs', null, s('radialGradient', { id: 'ob-g1', cx: '45%', cy: '40%', r: '60%' }, s('stop', { offset: '0', 'stop-color': '#1d3a4a' }), s('stop', { offset: '1', 'stop-color': '#0a141c' }))),
    s('ellipse', { cx: 120, cy: 75, rx: 104, ry: 40, fill: 'none', stroke: '#9af3c6', 'stroke-opacity': '.35', transform: 'rotate(-14 120 75)' }),
    s('circle', { cx: 120, cy: 75, r: 52, fill: 'url(#ob-g1)', stroke: 'rgba(255,255,255,.12)' }),
    s('path', { d: 'M86 60c10-8 22-6 30 2s20 4 26-2 18 2 22 10M80 86c12 6 24 2 34-4s22 0 30 8', fill: 'none', stroke: 'rgba(154,243,198,.35)', 'stroke-width': 1.4 }),
    [[96, 56], [140, 70], [118, 96], [152, 92]].map(([x, y], i) => s('g', null,
      s('circle', { cx: x, cy: y, r: 9, fill: '#ff453a', opacity: '.18', class: `ob-pulse ob-d${i}` }),
      s('circle', { cx: x, cy: y, r: 4, fill: '#ff453a' }))),
    s('circle', { cx: 214, cy: 52, r: 4, fill: '#e9fff4' }));
}
function artReport() {
  return s('svg', { viewBox: '0 0 240 150', class: 'ob-art', 'aria-hidden': 'true' },
    s('rect', { x: 34, y: 18, width: 120, height: 114, rx: 12, fill: '#101821', stroke: 'rgba(255,255,255,.12)' }),
    s('rect', { x: 46, y: 30, width: 96, height: 44, rx: 7, fill: '#1c3326' }),
    s('path', { d: 'M46 64l20-14 14 10 16-12 26 18v8H46z', fill: '#2f5a43' }),
    s('line', { x1: 94, y1: 30, x2: 94, y2: 74, stroke: '#eef2f6', 'stroke-width': 1.6 }),
    s('circle', { cx: 94, cy: 52, r: 6, fill: '#eef2f6' }),
    s('rect', { x: 46, y: 84, width: 70, height: 6, rx: 3, fill: 'rgba(255,255,255,.22)' }),
    s('rect', { x: 46, y: 96, width: 90, height: 6, rx: 3, fill: 'rgba(255,255,255,.12)' }),
    s('rect', { x: 46, y: 108, width: 56, height: 6, rx: 3, fill: 'rgba(255,255,255,.12)' }),
    s('rect', { x: 140, y: 52, width: 70, height: 60, rx: 10, fill: 'rgba(16,24,33,.92)', stroke: 'rgba(154,243,198,.4)' }),
    s('circle', { cx: 175, cy: 76, r: 13, fill: 'none', stroke: '#9af3c6', 'stroke-width': 1.6 }),
    s('path', { d: 'M175 66v20M165 76h20', stroke: '#9af3c6', 'stroke-width': 1.2 }),
    s('rect', { x: 152, y: 96, width: 46, height: 5, rx: 2.5, fill: 'rgba(154,243,198,.5)' }));
}
function artEvidence() {
  const row = (y, color, fill, w, dashed) => s('g', null,
    s('rect', { x: 52, y, width: 52, height: 18, rx: 5, fill, stroke: dashed ? 'rgba(255,255,255,.3)' : 'none', 'stroke-dasharray': dashed ? '3 3' : null }),
    s('circle', { cx: 62, cy: y + 9, r: 3, fill: color }),
    s('rect', { x: 70, y: y + 7, width: 26, height: 4, rx: 2, fill: color, opacity: '.8' }),
    s('rect', { x: 114, y: y + 3, width: w, height: 5, rx: 2.5, fill: 'rgba(255,255,255,.22)' }),
    s('rect', { x: 114, y: y + 11, width: w * 0.65, height: 4, rx: 2, fill: 'rgba(255,255,255,.1)' }));
  return s('svg', { viewBox: '0 0 240 150', class: 'ob-art', 'aria-hidden': 'true' },
    s('rect', { x: 36, y: 16, width: 168, height: 118, rx: 14, fill: '#101821', stroke: 'rgba(255,255,255,.12)' }),
    row(32, '#9af3c6', 'rgba(154,243,198,.12)', 74, false),
    row(66, '#f2c27b', 'rgba(242,194,123,.13)', 62, false),
    row(100, '#7f8b96', 'transparent', 52, true));
}

const CARDS = [
  { art: artPlanet, kicker: 'Explore', title: 'A living planet, live', text: 'Red pins are natural events reported by NASA: wildfires, storms, volcanoes and floods. Search any place, or open an event to start.' },
  { art: artReport, kicker: 'Investigate', title: 'Look closer, through time', text: 'Every place opens a Field Report. Compare NASA satellite images before and after an event, check the sources, and pin your own notes.' },
  { art: artEvidence, kicker: 'Evidence first', title: 'Know what the evidence shows', text: 'ECHO keeps what was observed apart from what it might mean and what is still unknown. Illustrative overlays are always labelled.' }
];

/** Shows the cards. Resolves 'done' or 'skipped'. */
export function showOnboarding({ name = '' } = {}) {
  return new Promise((resolve) => {
    let i = 0;
    const art = h('div', { class: 'ob-visual' });
    const kicker = h('p', { class: 'ob-kicker' });
    const title = h('h2', { class: 'ob-title', id: 'ob-title' });
    const text = h('p', { class: 'ob-text', id: 'ob-text' });
    const dots = h('div', { class: 'ob-dots', 'aria-hidden': 'true' }, CARDS.map(() => h('span')));
    const count = h('p', { class: 'sr-only', 'aria-live': 'polite' });
    const skip = h('button', { type: 'button', class: 'btn btn-quiet ob-skip', onClick: () => finish('skipped') }, 'Skip');
    const back = h('button', { type: 'button', class: 'btn btn-quiet ob-back', onClick: () => go(i - 1) }, 'Back');
    const next = h('button', { type: 'button', class: 'btn btn-primary ob-next', onClick: () => (i < CARDS.length - 1 ? go(i + 1) : finish('done')) });
    const greet = h('p', { class: 'ob-greet' }, name ? `Welcome to ECHO, ${name.split(/\s+/)[0]}.` : 'Welcome to ECHO.');
    const dialog = h('dialog', { class: 'onboarding', 'aria-labelledby': 'ob-title', 'aria-describedby': 'ob-text' },
      h('div', { class: 'ob-top' }, greet, skip),
      art, h('div', { class: 'ob-copy' }, kicker, title, text), count,
      h('div', { class: 'ob-foot' }, dots, h('div', { class: 'ob-buttons' }, back, next)));
    document.body.append(dialog);

    function go(n) {
      i = Math.max(0, Math.min(CARDS.length - 1, n));
      const c = CARDS[i];
      art.replaceChildren(c.art());
      kicker.textContent = `${c.kicker} · ${i + 1} of ${CARDS.length}`;
      title.textContent = c.title;
      text.textContent = c.text;
      count.textContent = `Card ${i + 1} of ${CARDS.length}: ${c.title}`;
      [...dots.children].forEach((d, k) => d.classList.toggle('on', k === i));
      back.hidden = i === 0;
      next.textContent = i === CARDS.length - 1 ? 'Start exploring' : 'Next';
      dialog.dataset.card = String(i + 1);
      dialog.querySelector('.ob-visual')?.animate?.([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 260, easing: 'cubic-bezier(.2,.8,.2,1)' });
      next.focus({ preventScroll: true });
    }
    function finish(how) {
      if (!dialog.isConnected) return;
      dialog.close();
      dialog.remove();
      resolve(how);
    }
    dialog.addEventListener('cancel', (e) => { e.preventDefault(); finish('skipped'); });
    dialog.addEventListener('keydown', (e) => {
      if (e.target.closest('button') && (e.key === 'Enter' || e.key === ' ')) return;
      if (e.key === 'ArrowRight' && i < CARDS.length - 1) go(i + 1);
      if (e.key === 'ArrowLeft' && i > 0) go(i - 1);
    });
    dialog.showModal();
    go(0);
  });
}
