// Accounts for the web app: sign up, log in, log out and the current session.
//
// Two ways to store accounts, chosen in config.js:
//  - 'device' (default): accounts live in this browser only. Passwords are never stored; a salted
//    PBKDF2 hash is. This gates the app and personalises it, but it is not a server account: it
//    does not follow the person to another browser and cannot be recovered. Fine for a preview.
//  - 'supabase': real accounts on a Supabase project (email + password), called over its REST
//    API with the project's public "anon" key. Nothing secret is needed in the page.
//
// The interface is the same for both, so the sign-in screen does not care which one is in use.

export class AuthError extends Error {
  constructor(message, field = null) { super(message); this.name = 'AuthError'; this.field = field; }
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const PASSWORD_MIN = 8;

export function normaliseEmail(value) { return String(value || '').trim().toLowerCase(); }

/** Checks the sign-up or log-in form. Throws AuthError naming the field to fix. */
export function validate({ mode, name, email, password }) {
  if (mode === 'signup') {
    const n = String(name || '').trim();
    if (!n) throw new AuthError('Enter your name.', 'name');
    if (n.length > 60) throw new AuthError('Use 60 characters or fewer for your name.', 'name');
  }
  const e = normaliseEmail(email);
  if (!e) throw new AuthError('Enter your email address.', 'email');
  if (!EMAIL.test(e) || e.length > 200) throw new AuthError('Enter a valid email address, like name@example.com.', 'email');
  if (!password) throw new AuthError('Enter your password.', 'password');
  if (mode === 'signup' && String(password).length < PASSWORD_MIN) throw new AuthError(`Use at least ${PASSWORD_MIN} characters for your password.`, 'password');
  return { name: String(name || '').trim(), email: e, password: String(password) };
}

export function initials(name = '', email = '') {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return String(email).slice(0, 2).toUpperCase() || '?';
}

/* ---------------- device accounts ---------------- */

const toHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const fromHex = (hex) => new Uint8Array(hex.match(/.{2}/g).map((b) => parseInt(b, 16)));

async function hashPassword(password, saltHex, crypto, iterations) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: fromHex(saltHex), iterations }, key, 256);
  return toHex(bits);
}

function sameText(a, b) { // constant-time compare, so timing does not leak how much of a hash matched
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Accounts kept in one storage key. `storage` is { get(key), set(key, value), remove(key) } of
 * strings (localStorage in the browser, a Map in tests).
 */
export function deviceAuth({ storage, crypto = globalThis.crypto, key = 'echo-web-auth-v1', iterations = 120000, now = () => Date.now() }) {
  const read = () => {
    try { const data = JSON.parse(storage.get(key) || 'null'); return data && Array.isArray(data.users) ? data : { users: [], session: null }; } catch { return { users: [], session: null }; }
  };
  const write = (data) => storage.set(key, JSON.stringify(data));
  const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, createdAt: u.createdAt });

  return {
    kind: 'device',
    async current() {
      const data = read();
      const user = data.session && data.users.find((u) => u.id === data.session.userId);
      return user ? publicUser(user) : null;
    },
    async signUp(form) {
      const { name, email, password } = validate({ mode: 'signup', ...form });
      const data = read();
      if (data.users.some((u) => u.email === email)) throw new AuthError('An account with this email already exists on this device. Log in instead.', 'email');
      const salt = toHex(crypto.getRandomValues(new Uint8Array(16)));
      const user = { id: toHex(crypto.getRandomValues(new Uint8Array(12))), name, email, salt, iterations, hash: await hashPassword(password, salt, crypto, iterations), createdAt: new Date(now()).toISOString() };
      data.users.push(user);
      data.session = { userId: user.id, at: now() };
      write(data);
      return { user: publicUser(user), isNew: true };
    },
    async logIn(form) {
      const { email, password } = validate({ mode: 'login', ...form });
      const data = read();
      const user = data.users.find((u) => u.email === email);
      // Hash even when the email is unknown, so both failures take the same time.
      const hash = await hashPassword(password, user?.salt || '00'.repeat(16), crypto, user?.iterations || iterations);
      if (!user || !sameText(hash, user.hash)) throw new AuthError('That email and password do not match an account on this device.', 'password');
      data.session = { userId: user.id, at: now() };
      write(data);
      return { user: publicUser(user), isNew: false };
    },
    async logOut() {
      const data = read();
      data.session = null;
      write(data);
    }
  };
}

/* ---------------- Supabase accounts ---------------- */

/**
 * Email-and-password accounts on a Supabase project, through its Auth REST API.
 * `url` is the project address (https://xyz.supabase.co) and `anonKey` its public anon key.
 */
export function supabaseAuth({ url, anonKey, storage, fetchImpl = globalThis.fetch?.bind(globalThis), key = 'echo-web-auth-supabase-v1', now = () => Date.now() }) {
  const base = String(url || '').replace(/\/+$/, '');
  if (!/^https:\/\/[^/]+$/.test(base) || !anonKey) throw new Error('Supabase needs an https project address and its anon key in config.js.');
  const readSession = () => { try { return JSON.parse(storage.get(key) || 'null'); } catch { return null; } };
  const saveSession = (s) => (s ? storage.set(key, JSON.stringify(s)) : storage.remove(key));
  const userFrom = (u) => ({ id: u.id, email: u.email, name: u.user_metadata?.name || '', createdAt: u.created_at || null });

  async function call(path, { method = 'POST', body, token } = {}) {
    let res;
    try {
      res = await fetchImpl(`${base}/auth/v1/${path}`, {
        method,
        headers: { apikey: anonKey, 'content-type': 'application/json', authorization: `Bearer ${token || anonKey}` },
        body: body ? JSON.stringify(body) : undefined
      });
    } catch {
      throw new AuthError('Could not reach the sign-in service. Check your connection and try again.');
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = String(data.msg || data.error_description || data.message || '');
      if (/already registered|already exists/i.test(msg)) throw new AuthError('An account with this email already exists. Log in instead.', 'email');
      if (/invalid login|invalid credentials/i.test(msg)) throw new AuthError('That email and password do not match an account.', 'password');
      if (/not confirmed/i.test(msg)) throw new AuthError('Confirm your email address first, using the link we sent you.', 'email');
      if (/password/i.test(msg)) throw new AuthError(msg, 'password');
      throw new AuthError(msg || `The sign-in service returned an error (${res.status}).`);
    }
    return data;
  }

  function keep(data) {
    const s = { access: data.access_token, refresh: data.refresh_token, expiresAt: now() + (Number(data.expires_in) || 3600) * 1000, user: userFrom(data.user) };
    saveSession(s);
    return s;
  }

  return {
    kind: 'supabase',
    async current() {
      const s = readSession();
      if (!s) return null;
      if (s.expiresAt - now() > 60_000) return s.user;
      try { return keep(await call('token?grant_type=refresh_token', { body: { refresh_token: s.refresh } })).user; } catch { saveSession(null); return null; }
    },
    async signUp(form) {
      const { name, email, password } = validate({ mode: 'signup', ...form });
      const data = await call('signup', { body: { email, password, data: { name } } });
      if (!data.access_token) {
        // The project asks people to confirm their email before the first log-in.
        throw new AuthError('Almost there: we sent a confirmation link to your email. Open it, then log in.', 'confirm');
      }
      return { user: keep(data).user, isNew: true };
    },
    async logIn(form) {
      const { email, password } = validate({ mode: 'login', ...form });
      return { user: keep(await call('token?grant_type=password', { body: { email, password } })).user, isNew: false };
    },
    async logOut() {
      const s = readSession();
      saveSession(null);
      if (s?.access) { try { await call('logout', { token: s.access }); } catch { /* the local session is gone either way */ } }
    }
  };
}

/** Picks the account store from config.js. */
export function createAuth(config = {}, { storage, fetchImpl, crypto } = {}) {
  if (config.provider === 'supabase') return supabaseAuth({ url: config.supabaseUrl, anonKey: config.supabaseAnonKey, storage, fetchImpl });
  return deviceAuth({ storage, crypto });
}

/** localStorage as { get, set, remove }; falls back to memory when storage is blocked. */
export function browserStorage(win = globalThis) {
  const memory = new Map();
  return {
    get(k) { try { return win.localStorage.getItem(k); } catch { return memory.get(k) ?? null; } },
    set(k, v) { try { win.localStorage.setItem(k, v); } catch { memory.set(k, v); } },
    remove(k) { try { win.localStorage.removeItem(k); } catch { memory.delete(k); } }
  };
}
