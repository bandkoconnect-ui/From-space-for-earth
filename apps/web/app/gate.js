// The sign-in screen shown before the map: a framed window onto the ECHO website's opening
// scene beside one form with Sign up and Log in tabs.
// Resolves with { user, isNew } once the person is in.

import { h } from '../../../packages/ui/dom.js';
import { AuthError, PASSWORD_MIN } from './auth.js';
import { ic } from './ui.js';

const EYE = ['M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z', 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z'];
const EYE_OFF = ['M3 3l18 18', 'M10.6 6.1A9.6 9.6 0 0 1 12 6c6 0 9.5 6 9.5 6a17 17 0 0 1-3 3.6', 'M6.6 7.6C4 9.3 2.5 12 2.5 12S6 18 12 18c1.4 0 2.6-.3 3.7-.8', 'M9.9 9.9a3 3 0 0 0 4.2 4.2'];

function svgIcon(paths, size = 18) {
  return h('svg:svg', { viewBox: '0 0 24 24', width: size, height: size, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' },
    paths.map((d) => h('svg:path', { d })));
}

/** A still field of stars, like the ECHO website: three sizes, a few tinted mint. */
function drawSky(canvas) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = canvas.clientWidth || innerWidth;
  const hgt = canvas.clientHeight || innerHeight;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(hgt * dpr);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  let seed = 20261023;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const count = Math.round((w * hgt) / 3800);
  for (let i = 0; i < count; i += 1) {
    const d = rnd();
    const r = (d < 0.65 ? 0.5 : d < 0.92 ? 0.85 : 1.3) * dpr;
    ctx.globalAlpha = (d < 0.65 ? 0.35 : d < 0.92 ? 0.55 : 0.85) * (0.6 + rnd() * 0.4);
    ctx.fillStyle = rnd() < 0.07 ? '#bff8dc' : '#e8f0f8';
    ctx.beginPath();
    ctx.arc(rnd() * canvas.width, rnd() * canvas.height, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function showGate(root, auth, { initialMode = 'signup', note = '' } = {}) {
  return new Promise((resolve) => {
    let mode = initialMode;
    let busy = false;

    const title = h('h2', { class: 'gate-title', id: 'gate-title' });
    const lead = h('p', { class: 'gate-lead' });
    const tabSignup = h('button', { type: 'button', role: 'tab', id: 'tab-signup', class: 'gate-tab', 'aria-controls': 'gate-form', onClick: () => setMode('signup') }, 'Sign up');
    const tabLogin = h('button', { type: 'button', role: 'tab', id: 'tab-login', class: 'gate-tab', 'aria-controls': 'gate-form', onClick: () => setMode('login') }, 'Log in');
    const tabs = h('div', { class: 'gate-tabs', role: 'tablist', 'aria-label': 'Choose sign up or log in' }, tabSignup, tabLogin);

    const field = (id, label, input, hint) => {
      const err = h('p', { class: 'gate-error', id: `${id}-error`, role: 'alert' });
      const wrap = h('div', { class: 'gate-field', dataset: { field: id } }, h('label', { for: id }, label), input, hint ? h('p', { class: 'gate-hint', id: `${id}-hint` }, hint) : null, err);
      return { wrap, input, err };
    };
    const name = field('gate-name', 'Name', h('input', { class: 'input', id: 'gate-name', name: 'name', type: 'text', autocomplete: 'name', maxlength: 60, autocapitalize: 'words', spellcheck: 'false' }));
    const email = field('gate-email', 'Email', h('input', { class: 'input', id: 'gate-email', name: 'email', type: 'email', autocomplete: 'email', inputmode: 'email', maxlength: 200, autocapitalize: 'off', spellcheck: 'false' }));
    const pwInput = h('input', { class: 'input', id: 'gate-password', name: 'password', type: 'password', maxlength: 200 });
    const reveal = h('button', { type: 'button', class: 'gate-reveal', 'aria-label': 'Show password', 'aria-pressed': 'false', onClick: () => {
      const show = pwInput.type === 'password';
      pwInput.type = show ? 'text' : 'password';
      reveal.setAttribute('aria-pressed', String(show));
      reveal.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
      reveal.replaceChildren(svgIcon(show ? EYE_OFF : EYE));
    } }, svgIcon(EYE));
    const password = field('gate-password', 'Password', h('div', { class: 'gate-pw' }, pwInput, reveal), `At least ${PASSWORD_MIN} characters.`);
    password.input = pwInput;
    const formError = h('p', { class: 'gate-error gate-form-error', role: 'alert' });
    const submit = h('button', { type: 'submit', class: 'btn btn-primary gate-submit' });
    const swap = h('p', { class: 'gate-swap' });
    const form = h('form', { class: 'gate-form', id: 'gate-form', role: 'tabpanel', novalidate: true, onSubmit: (e) => { e.preventDefault(); go(); } },
      name.wrap, email.wrap, password.wrap, formError, submit, swap);

    const footnote = h('p', { class: 'gate-foot' }, note);
    const card = h('section', { class: 'gate-card', 'aria-labelledby': 'gate-title' },
      h('div', { class: 'gate-brand' }, h('img', { src: 'assets/icons/icon-192.png', alt: '', width: 34, height: 34 }), h('span', null, 'ECHO')),
      title, lead, tabs, form, note ? footnote : null);

    // Left: a framed window onto the ECHO website's opening scene. Right: the form, ready to use.
    const sky = h('canvas', { class: 'gate-sky', 'aria-hidden': 'true' });
    const satellite = h('svg:g', null, h('svg:circle', { r: 16, fill: 'url(#gate-sat)' }), h('svg:circle', { r: 3.4, fill: '#e9fff4' }));
    const orbitPath = h('svg:path', { d: 'M10,238 a490,228 0 1,0 980,0 a490,228 0 1,0 -980,0', fill: 'none' });
    const orbit = h('div', { class: 'gate-orbit', 'aria-hidden': 'true' },
      h('svg:svg', { viewBox: '0 0 1000 476' },
        h('svg:defs', null,
          h('svg:linearGradient', { id: 'gate-og', x1: '0', x2: '1' }, h('svg:stop', { offset: '0', 'stop-color': '#9af3c6', 'stop-opacity': '0' }), h('svg:stop', { offset: '.45', 'stop-color': '#9af3c6', 'stop-opacity': '.55' }), h('svg:stop', { offset: '1', 'stop-color': '#9af3c6', 'stop-opacity': '.08' })),
          h('svg:radialGradient', { id: 'gate-sat' }, h('svg:stop', { offset: '0', 'stop-color': '#ffffff' }), h('svg:stop', { offset: '.35', 'stop-color': '#9af3c6' }), h('svg:stop', { offset: '1', 'stop-color': '#9af3c6', 'stop-opacity': '0' }))),
        h('svg:ellipse', { cx: 500, cy: 238, rx: 490, ry: 228, fill: 'none', stroke: 'url(#gate-og)', 'stroke-width': 1.4 }),
        orbitPath, satellite));
    const stage = h('section', { class: 'gate-stage', 'aria-labelledby': 'gate-hero-title' },
      h('div', { class: 'gate-earth', 'aria-hidden': 'true' }, h('img', { src: 'assets/img/earth-hd.webp', alt: '', decoding: 'async', fetchpriority: 'high' })),
      h('div', { class: 'gate-shade', 'aria-hidden': 'true' }),
      orbit,
      h('div', { class: 'gate-hero' },
        h('p', { class: 'gate-eyebrow' }, h('span', { class: 'gate-dot', 'aria-hidden': 'true' }), 'Earth intelligence for everyone'),
        h('h1', { class: 'gate-hero-title', id: 'gate-hero-title' }, 'See the whole ', h('em', { class: 'gate-serif' }, 'story.')),
        h('p', { class: 'gate-lede' }, 'ECHO turns NASA satellite imagery and open event data into investigations anyone can run, with a clear line between evidence and interpretation.')),
      h('p', { class: 'gate-credit', 'aria-hidden': 'true' }, h('span', null, 'NASA EONET'), h('span', null, 'MODIS'), h('span', null, 'VIIRS')));
    const el = h('main', { class: 'gate', id: 'gate' }, sky, stage, h('div', { class: 'gate-side' }, card));
    root.append(el);
    drawSky(sky);
    const onResize = () => { if (!sky.isConnected) { removeEventListener('resize', onResize); return; } drawSky(sky); };
    addEventListener('resize', onResize);

    // The satellite travels the orbit, as on the website (still when reduced motion is on).
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const len = orbitPath.getTotalLength ? orbitPath.getTotalLength() : 0;
    const place = (t) => { if (!len) return; const p = orbitPath.getPointAtLength(((t * 0.00004) % 1) * len); satellite.setAttribute('transform', `translate(${p.x} ${p.y})`); };
    if (still) place(9000);
    else { const loop = (t) => { if (!el.isConnected) return; place(t); requestAnimationFrame(loop); }; requestAnimationFrame(loop); }

    function clearErrors() {
      for (const f of [name, email, password]) { f.err.textContent = ''; f.input.removeAttribute('aria-invalid'); f.input.removeAttribute('aria-describedby'); }
      formError.textContent = '';
      formError.classList.remove('is-info');
    }

    function setMode(next) {
      mode = next;
      const signup = mode === 'signup';
      tabSignup.setAttribute('aria-selected', String(signup));
      tabLogin.setAttribute('aria-selected', String(!signup));
      tabSignup.tabIndex = signup ? 0 : -1;
      tabLogin.tabIndex = signup ? -1 : 0;
      form.setAttribute('aria-labelledby', signup ? 'tab-signup' : 'tab-login');
      title.textContent = signup ? 'Create your account' : 'Welcome back';
      lead.textContent = signup ? 'Start investigating what is changing on Earth.' : 'Log in to continue your investigations.';
      name.wrap.hidden = !signup;
      password.wrap.querySelector('.gate-hint').hidden = !signup;
      pwInput.autocomplete = signup ? 'new-password' : 'current-password';
      submit.textContent = signup ? 'Create account' : 'Log in';
      swap.replaceChildren(signup ? 'Already have an account? ' : 'New to ECHO? ',
        h('button', { type: 'button', class: 'gate-link', onClick: () => { setMode(signup ? 'login' : 'signup'); (signup ? email.input : name.input).focus(); } }, signup ? 'Log in' : 'Create an account'));
      clearErrors();
    }

    tabs.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      setMode(mode === 'signup' ? 'login' : 'signup');
      (mode === 'signup' ? tabSignup : tabLogin).focus();
    });

    async function go() {
      if (busy) return;
      clearErrors();
      busy = true;
      submit.disabled = true;
      submit.setAttribute('aria-busy', 'true');
      submit.textContent = mode === 'signup' ? 'Creating account…' : 'Logging in…';
      try {
        const form = { name: name.input.value, email: email.input.value, password: pwInput.value };
        const result = mode === 'signup' ? await auth.signUp(form) : await auth.logIn(form);
        el.classList.add('is-leaving');
        setTimeout(() => el.remove(), 380);
        resolve(result);
        return;
      } catch (e) {
        if (!(e instanceof AuthError)) { console.error(e); formError.textContent = 'Something went wrong. Try again.'; }
        else if (e.field === 'confirm') { setMode('login'); formError.textContent = e.message; formError.classList.add('is-info'); }
        else {
          const target = { name, email, password }[e.field];
          if (target) { target.err.textContent = e.message; target.input.setAttribute('aria-invalid', 'true'); target.input.setAttribute('aria-describedby', target.err.id); target.input.focus(); }
          else formError.textContent = e.message;
        }
      } finally {
        busy = false;
        submit.disabled = false;
        submit.removeAttribute('aria-busy');
        if (!el.classList.contains('is-leaving')) submit.textContent = mode === 'signup' ? 'Create account' : 'Log in';
      }
    }

    setMode(mode);
    // Put the cursor in the first field, except on touch screens where it would pop the keyboard
    // up over the scene before the person has chosen to start.
    if (matchMedia('(pointer: fine)').matches) requestAnimationFrame(() => (mode === 'signup' ? name.input : email.input).focus({ preventScroll: true }));
  });
}

/** Small account dialog: who is signed in, and Log out. */
export async function accountDialog(app, user) {
  const { ui } = app;
  const body = h('div', { class: 'account' },
    h('div', { class: 'account-id' }, h('span', { class: 'avatar avatar-lg', 'aria-hidden': 'true' }, app.userInitials),
      h('div', null, h('strong', null, user.name || 'Your account'), h('span', null, user.email))),
    app.authKind === 'device' ? h('p', { class: 'rs-note' }, ic('info', { size: 14 }), 'This account is saved in this browser only.') : null);
  const handle = ui.modal({ title: 'Account', body, actions: [{ label: 'Close', kind: 'quiet' }, { label: 'Log out', kind: 'primary' }] });
  if ((await handle.closed) === 'Log out') await app.logOut();
}
