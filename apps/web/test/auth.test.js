import test from 'node:test';
import assert from 'node:assert/strict';
import { AuthError, createAuth, deviceAuth, initials, supabaseAuth, validate } from '../app/auth.js';

const memory = () => { const m = new Map(); return { get: (k) => m.get(k) ?? null, set: (k, v) => m.set(k, v), remove: (k) => m.delete(k), raw: m }; };
const fast = (storage) => deviceAuth({ storage, iterations: 1000 });

test('validate names the field to fix', () => {
  assert.throws(() => validate({ mode: 'signup', name: ' ', email: 'a@b.co', password: '12345678' }), (e) => e instanceof AuthError && e.field === 'name');
  assert.throws(() => validate({ mode: 'signup', name: 'A', email: 'nope', password: '12345678' }), (e) => e.field === 'email');
  assert.throws(() => validate({ mode: 'signup', name: 'A', email: 'a@b.co', password: 'short' }), (e) => e.field === 'password');
  // Log-in does not re-check password length (older passwords still work) and ignores the name.
  assert.deepEqual(validate({ mode: 'login', email: ' A@B.co ', password: 'x' }), { name: '', email: 'a@b.co', password: 'x' });
});

test('initials', () => {
  assert.equal(initials('Ada King Lovelace'), 'AL');
  assert.equal(initials('Ada'), 'AD');
  assert.equal(initials('', 'zed@example.com'), 'ZE');
});

test('device accounts: sign up, stay signed in, log out, log in', async () => {
  const storage = memory();
  const auth = fast(storage);
  assert.equal(await auth.current(), null);
  const { user, isNew } = await auth.signUp({ name: 'Ada', email: 'Ada@Example.com', password: 'orbit-705km' });
  assert.equal(isNew, true);
  assert.equal(user.email, 'ada@example.com');
  assert.equal((await fast(storage).current()).id, user.id, 'a new page load finds the session');
  const raw = storage.raw.get('echo-web-auth-v1');
  assert.ok(!raw.includes('orbit-705km'), 'the password itself is never stored');
  await auth.logOut();
  assert.equal(await auth.current(), null);
  await assert.rejects(auth.logIn({ email: 'ada@example.com', password: 'wrong-one' }), (e) => e.field === 'password');
  await assert.rejects(auth.logIn({ email: 'nobody@example.com', password: 'orbit-705km' }), (e) => e.field === 'password');
  const back = await auth.logIn({ email: 'ADA@example.com', password: 'orbit-705km' });
  assert.equal(back.isNew, false);
  assert.equal(back.user.id, user.id);
});

test('device accounts: one account per email; two people can share a browser', async () => {
  const storage = memory();
  const auth = fast(storage);
  await auth.signUp({ name: 'Ada', email: 'ada@example.com', password: 'orbit-705km' });
  await assert.rejects(auth.signUp({ name: 'Copy', email: 'ADA@example.com', password: 'another-pass' }), (e) => e.field === 'email');
  const second = await auth.signUp({ name: 'Grace', email: 'grace@example.com', password: 'cobol-1959' });
  assert.equal((await auth.current()).id, second.user.id);
});

test('device accounts survive corrupt storage', async () => {
  const storage = memory();
  storage.set('echo-web-auth-v1', '{not json');
  assert.equal(await fast(storage).current(), null);
});

test('createAuth defaults to device accounts and refuses a half-configured Supabase', () => {
  assert.equal(createAuth({}, { storage: memory() }).kind, 'device');
  assert.throws(() => createAuth({ provider: 'supabase', supabaseUrl: 'http://insecure.example', supabaseAnonKey: 'k' }, { storage: memory() }));
});

function fakeSupabase(responses) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init, body: init.body ? JSON.parse(init.body) : null });
    const path = url.replace('https://xyz.supabase.co/auth/v1/', '');
    const [status, body] = responses[path] || [404, { msg: 'not found' }];
    return { ok: status < 400, status, json: async () => body };
  };
  return { calls, fetchImpl };
}

test('supabase: sign up sends the name as metadata and keeps the session', async () => {
  const storage = memory();
  const session = { access_token: 'A', refresh_token: 'R', expires_in: 3600, user: { id: 'u1', email: 'ada@example.com', user_metadata: { name: 'Ada' } } };
  const { calls, fetchImpl } = fakeSupabase({ signup: [200, session] });
  const auth = supabaseAuth({ url: 'https://xyz.supabase.co/', anonKey: 'anon', storage, fetchImpl });
  const { user, isNew } = await auth.signUp({ name: 'Ada', email: 'ada@example.com', password: 'orbit-705km' });
  assert.equal(isNew, true);
  assert.equal(user.name, 'Ada');
  assert.deepEqual(calls[0].body, { email: 'ada@example.com', password: 'orbit-705km', data: { name: 'Ada' } });
  assert.equal(calls[0].init.headers.apikey, 'anon');
  assert.equal((await auth.current()).id, 'u1');
});

test('supabase: email confirmation, bad password and outages give clear messages', async () => {
  const storage = memory();
  const { fetchImpl } = fakeSupabase({
    signup: [200, { id: 'u1', email: 'ada@example.com' }],
    'token?grant_type=password': [400, { error_description: 'Invalid login credentials' }]
  });
  const auth = supabaseAuth({ url: 'https://xyz.supabase.co', anonKey: 'anon', storage, fetchImpl });
  await assert.rejects(auth.signUp({ name: 'Ada', email: 'ada@example.com', password: 'orbit-705km' }), (e) => e.field === 'confirm' && /confirmation link/.test(e.message));
  await assert.rejects(auth.logIn({ email: 'ada@example.com', password: 'nope' }), (e) => e.field === 'password');
  const down = supabaseAuth({ url: 'https://xyz.supabase.co', anonKey: 'anon', storage, fetchImpl: async () => { throw new TypeError('offline'); } });
  await assert.rejects(down.logIn({ email: 'ada@example.com', password: 'x' }), /Could not reach/);
});

test('supabase: an expired session is refreshed, a dead one is dropped', async () => {
  const storage = memory();
  let t = 0;
  const now = () => t;
  storage.set('echo-web-auth-supabase-v1', JSON.stringify({ access: 'A', refresh: 'R', expiresAt: 1000, user: { id: 'u1', email: 'a@b.co', name: 'A' } }));
  const { fetchImpl } = fakeSupabase({ 'token?grant_type=refresh_token': [200, { access_token: 'A2', refresh_token: 'R2', expires_in: 3600, user: { id: 'u1', email: 'a@b.co', user_metadata: { name: 'A' } } }] });
  const auth = supabaseAuth({ url: 'https://xyz.supabase.co', anonKey: 'anon', storage, fetchImpl, now });
  t = 5000;
  assert.equal((await auth.current()).id, 'u1');
  assert.equal(JSON.parse(storage.get('echo-web-auth-supabase-v1')).access, 'A2');
  const dead = supabaseAuth({ url: 'https://xyz.supabase.co', anonKey: 'anon', storage, fetchImpl: fakeSupabase({}).fetchImpl, now: () => 1e12 });
  assert.equal(await dead.current(), null);
  assert.equal(storage.get('echo-web-auth-supabase-v1'), null);
});
