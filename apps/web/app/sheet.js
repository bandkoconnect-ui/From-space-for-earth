// Bottom-sheet behaviour for phones: the panel rests at one of three heights (peek, half,
// full), follows a finger drag on its grab area, and settles with a flick. On larger screens
// it is switched off and the panel is an ordinary floating card.
//
// The sheet's height changes (rather than sliding it off screen), so its scroll area always
// ends at the bottom of what is visible and the last item can always be reached.

export function createSheet(el, { handle = '.sheet-grab', snaps, onChange = () => {}, initial = 'peek' } = {}) {
  let enabled = false;
  let snap = initial;
  let drag = null;
  let suppressClick = false;

  const heightOf = (name) => Math.round(snaps()[name]);

  function apply({ animate = true } = {}) {
    if (!enabled) return;
    el.classList.toggle('sheet-animate', animate);
    el.style.height = `${heightOf(snap)}px`;
    el.dataset.snap = snap;
    onChange(snap, heightOf(snap));
  }

  function set(name, options) {
    if (!['peek', 'half', 'full'].includes(name)) return;
    snap = name;
    apply(options);
  }

  function nearest(height, velocity) {
    const s = snaps();
    // Project the flick a little ahead so a quick swipe moves one step even if short.
    const target = height + velocity * 180;
    return Object.entries(s).sort((a, b) => Math.abs(a[1] - target) - Math.abs(b[1] - target))[0][0];
  }

  function onDown(e) {
    if (!enabled || (e.button !== undefined && e.button !== 0)) return;
    if (!e.target.closest(handle)) return;
    if (e.target.closest('input, textarea, select, a, [data-no-drag]')) return;
    drag = { startY: e.clientY, startH: el.getBoundingClientRect().height, lastY: e.clientY, lastT: performance.now(), v: 0, moved: false, id: e.pointerId };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onUp);
  }

  function onMove(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const dy = e.clientY - drag.startY;
    if (!drag.moved && Math.abs(dy) < 6) return;
    drag.moved = true;
    const s = snaps();
    const h = Math.max(s.peek * 0.7, Math.min(s.full, drag.startH - dy));
    const t = performance.now();
    drag.v = (drag.lastY - e.clientY) / Math.max(1, t - drag.lastT);
    drag.lastY = e.clientY;
    drag.lastT = t;
    el.classList.remove('sheet-animate');
    el.style.height = `${h}px`;
    onChange(snap, h, true);
    e.preventDefault();
  }

  function onUp(e) {
    if (!drag || e.pointerId !== drag.id) return;
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
    document.removeEventListener('pointercancel', onUp);
    const moved = drag.moved;
    const height = el.getBoundingClientRect().height;
    const v = drag.v;
    drag = null;
    if (moved) {
      suppressClick = true;
      setTimeout(() => { suppressClick = false; }, 60);
      set(nearest(height, v));
    }
  }

  el.addEventListener('pointerdown', onDown);
  el.addEventListener('click', (e) => { if (suppressClick) { e.stopPropagation(); e.preventDefault(); } }, true);

  return {
    get snap() { return snap; },
    get enabled() { return enabled; },
    set,
    /** Steps to the next height: peek -> half -> full -> half. */
    cycle() { set(snap === 'peek' ? 'half' : snap === 'half' ? 'full' : 'half'); },
    refresh() { apply({ animate: false }); },
    enable(on) {
      enabled = on;
      if (!on) { el.style.height = ''; delete el.dataset.snap; el.classList.remove('sheet-animate'); }
      else apply({ animate: false });
    },
    height() { return enabled ? heightOf(snap) : 0; }
  };
}
