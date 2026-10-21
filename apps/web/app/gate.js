// The sign-in screen shown before the map. Two tabs, Sign up and Log in, on one form.
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

export function showGate(root, auth, { initialMode = 'signup', note = '' } = {}) {
  return new Promise((resolve) => {
    let mode = initialMode;
    let busy = false;

    const title = h('h1', { class: 'gate-title', id: 'gate-title' });
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
      h('div', { class: 'gate-brand' }, h('img', { src: 'assets/icons/icon-192.png', alt: '', width: 40, height: 40 }), h('span', null, 'ECHO')),
      title, lead, tabs, form, note ? footnote : null);
    const el = h('main', { class: 'gate', id: 'gate' },
      h('div', { class: 'gate-sky', 'aria-hidden': 'true' }),
      h('div', { class: 'gate-orbit', 'aria-hidden': 'true' }),
      h('div', { class: 'gate-intro' },
        h('p', { class: 'gate-eyebrow' }, 'Earth intelligence for everyone'),
        h('p', { class: 'gate-claim' }, 'See the whole story of a changing planet.')),
      card);
    root.append(el);

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
    requestAnimationFrame(() => (mode === 'signup' ? name.input : email.input).focus({ preventScroll: true }));
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
