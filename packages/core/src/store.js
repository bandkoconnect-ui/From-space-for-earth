// The app's persistent state: investigations, field notes, settings and the last event feed.
//
// The store is storage-agnostic. It talks to an adapter with two async methods,
//   get() -> string | null     set(string) -> void
// so the desktop app can keep a JSON file, the phone app can use native preferences, and
// tests can use memory. Records are normalised on the way in, so a damaged or hand-edited
// file can never crash the UI.

import { DEMO_IDS, demoInvestigations } from './seed.js';
import { ValidationError, normalizeInvestigation } from './investigation.js';
import { clampText, safeUrl, uid } from './text.js';
import { toIsoDate } from './dates.js';
import { isValidLatLng } from './geo.js';

export const SCHEMA_VERSION = 1;
export const MAX_NOTES_PER_INVESTIGATION = 500;
export const MAX_INVESTIGATIONS = 200;
export const MAX_CACHED_EVENTS = 200;

export const DEFAULT_SETTINGS = Object.freeze({
  chatEndpoint: '',
  imagery: 'terra',
  showLabels: true
});

const IMAGERY_IDS = ['terra', 'aqua', 'viirs'];

export function memoryAdapter(initial = null) {
  let value = initial;
  return { async get() { return value; }, async set(next) { value = next; } };
}

export function localStorageAdapter(key = 'echo-data-v1', storage = globalThis.localStorage) {
  return {
    async get() { try { return storage.getItem(key); } catch { return null; } },
    async set(value) { storage.setItem(key, value); }
  };
}

/** The chat endpoint must be https (or localhost while developing). Empty means "offline guide". */
export function normalizeEndpoint(value) {
  const text = clampText(value, 300);
  if (!text) return '';
  const url = safeUrl(text);
  const local = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(url);
  if (!url || (!url.startsWith('https://') && !local)) {
    throw new ValidationError('The AI endpoint must be a secure https:// address.');
  }
  return url;
}

function normalizeSettings(raw = {}) {
  return {
    chatEndpoint: (() => { try { return normalizeEndpoint(raw.chatEndpoint); } catch { return ''; } })(),
    imagery: IMAGERY_IDS.includes(raw.imagery) ? raw.imagery : DEFAULT_SETTINGS.imagery,
    showLabels: raw.showLabels !== false
  };
}

function normalizeNote(raw) {
  const text = clampText(raw?.text, 2000);
  if (!text) return null;
  const note = { id: clampText(raw?.id, 64) || uid('note'), text, createdAt: toIsoDate(raw?.createdAt) ? new Date(raw.createdAt).toISOString() : new Date().toISOString() };
  const lat = Number(raw?.lat);
  const lng = Number(raw?.lng);
  if (raw?.lat !== undefined && raw?.lat !== null && isValidLatLng(lat, lng)) { note.lat = lat; note.lng = lng; }
  if (Number.isInteger(raw?.dateIndex) && raw.dateIndex >= 0 && raw.dateIndex < 50) note.dateIndex = raw.dateIndex;
  return note;
}

export function createStore(adapter, { now = () => new Date(), saveDelayMs = 200 } = {}) {
  let investigations = [];
  let notes = new Map();
  let settings = normalizeSettings();
  let activeId = null;
  let seeded = false;
  let events = { fetchedAt: null, items: [] };
  const listeners = new Set();
  let timer = null;
  let pending = Promise.resolve();

  const emit = (type, detail) => listeners.forEach((fn) => { try { fn({ type, ...detail }); } catch (error) { console.error(error); } });

  function serialise() {
    return JSON.stringify({
      schema: SCHEMA_VERSION,
      seeded,
      activeId,
      settings,
      investigations,
      notes: [...notes.entries()],
      events
    });
  }

  function schedulePersist() {
    clearTimeout(timer);
    timer = setTimeout(() => { flush().catch((error) => console.error('ECHO could not save', error)); }, saveDelayMs);
  }

  function flush() {
    clearTimeout(timer);
    timer = null;
    const payload = serialise();
    pending = pending.then(() => adapter.set(payload));
    return pending;
  }

  function hydrate(raw) {
    investigations = [];
    notes = new Map();
    const parsed = raw && typeof raw === 'object' ? raw : {};
    seeded = parsed.seeded === true;
    settings = normalizeSettings(parsed.settings);
    for (const item of Array.isArray(parsed.investigations) ? parsed.investigations : []) {
      try {
        const inv = normalizeInvestigation(item);
        if (!investigations.some((existing) => existing.id === inv.id)) investigations.push(inv);
      } catch { /* skip damaged records, keep the rest */ }
    }
    for (const entry of Array.isArray(parsed.notes) ? parsed.notes : []) {
      if (!Array.isArray(entry) || !investigations.some((inv) => inv.id === entry[0])) continue;
      const list = (Array.isArray(entry[1]) ? entry[1] : []).map(normalizeNote).filter(Boolean).slice(0, MAX_NOTES_PER_INVESTIGATION);
      if (list.length) notes.set(entry[0], list);
    }
    const items = Array.isArray(parsed.events?.items) ? parsed.events.items : [];
    events = { fetchedAt: toIsoDate(parsed.events?.fetchedAt) ? parsed.events.fetchedAt : null, items: items.slice(0, MAX_CACHED_EVENTS) };
    if (!seeded) {
      investigations.push(...demoInvestigations().filter((demo) => !investigations.some((i) => i.id === demo.id)));
      seeded = true;
    }
    activeId = investigations.some((i) => i.id === parsed.activeId) ? parsed.activeId : investigations[0]?.id ?? null;
  }

  const store = {
    async load() {
      let parsed = null;
      try {
        const text = await adapter.get();
        parsed = text ? JSON.parse(text) : null;
      } catch (error) {
        console.error('ECHO could not read saved data; starting fresh', error);
      }
      hydrate(parsed);
      emit('load');
      return store;
    },

    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    flush,

    /* ---- investigations ---- */
    list() { return investigations.slice(); },
    get(id) { return investigations.find((inv) => inv.id === id) || null; },
    active() { return store.get(activeId) || investigations[0] || null; },
    setActive(id) {
      if (!store.get(id) || id === activeId) return;
      activeId = id;
      schedulePersist();
      emit('active', { id });
    },

    add(raw, { activate = true } = {}) {
      if (investigations.length >= MAX_INVESTIGATIONS) throw new ValidationError(`You can keep up to ${MAX_INVESTIGATIONS} investigations. Delete one to make room.`);
      const inv = normalizeInvestigation(raw);
      if (investigations.some((existing) => existing.id === inv.id)) inv.id = uid('inv');
      investigations.unshift(inv);
      if (activate) activeId = inv.id;
      schedulePersist();
      emit('add', { id: inv.id });
      return inv;
    },

    update(id, patch) {
      const index = investigations.findIndex((inv) => inv.id === id);
      if (index < 0) return null;
      const allowed = {};
      for (const key of ['title', 'topic', 'radiusKm', 'summary']) if (patch[key] !== undefined) allowed[key] = patch[key];
      const next = normalizeInvestigation({ ...investigations[index], ...allowed, updatedAt: now().toISOString() });
      investigations[index] = next;
      schedulePersist();
      emit('update', { id });
      return next;
    },

    remove(id) {
      const index = investigations.findIndex((inv) => inv.id === id);
      if (index < 0) return false;
      investigations.splice(index, 1);
      notes.delete(id);
      if (activeId === id) activeId = investigations[0]?.id ?? null;
      schedulePersist();
      emit('remove', { id });
      return true;
    },

    duplicate(id) {
      const source = store.get(id);
      if (!source) return null;
      return store.add({ ...source, id: uid('inv'), kind: source.kind === 'demo' ? 'custom' : source.kind, title: `${source.title} (copy)`.slice(0, 80), createdAt: now().toISOString(), updatedAt: now().toISOString() });
    },

    /** Re-adds the two demonstration investigations if they were deleted. */
    restoreDemos() {
      let added = 0;
      for (const demo of demoInvestigations()) {
        if (!investigations.some((inv) => inv.id === demo.id)) { investigations.push(demo); added += 1; }
      }
      if (added) { schedulePersist(); emit('add', {}); }
      return added;
    },
    isDemoId: (id) => DEMO_IDS.includes(id),

    /* ---- notes ---- */
    notes(id) { return (notes.get(id) || []).slice(); },
    addNote(id, { text, lat, lng, dateIndex } = {}) {
      if (!store.get(id)) throw new ValidationError('That investigation no longer exists.');
      const note = normalizeNote({ text, lat, lng, dateIndex, createdAt: now().toISOString() });
      if (!note) throw new ValidationError('Write something first.');
      const list = notes.get(id) || [];
      if (list.length >= MAX_NOTES_PER_INVESTIGATION) throw new ValidationError('This investigation has reached its note limit.');
      notes.set(id, [note, ...list]);
      schedulePersist();
      emit('notes', { id });
      return note;
    },
    removeNote(id, noteId) {
      const list = notes.get(id) || [];
      const next = list.filter((note) => note.id !== noteId);
      if (next.length === list.length) return false;
      if (next.length) notes.set(id, next); else notes.delete(id);
      schedulePersist();
      emit('notes', { id });
      return true;
    },
    noteCount() { let n = 0; for (const list of notes.values()) n += list.length; return n; },

    /* ---- settings ---- */
    settings() { return { ...settings }; },
    setSettings(patch) {
      const next = { ...settings, ...patch };
      next.chatEndpoint = normalizeEndpoint(next.chatEndpoint);
      settings = normalizeSettings(next);
      schedulePersist();
      emit('settings');
      return { ...settings };
    },

    /* ---- event feed cache (so Planet Pulse still shows something offline) ---- */
    cacheEvents(items, fetchedAt = now().toISOString()) {
      events = { fetchedAt, items: items.slice(0, MAX_CACHED_EVENTS) };
      schedulePersist();
    },
    cachedEvents() { return { fetchedAt: events.fetchedAt, items: events.items.slice() }; },

    /* ---- backup ---- */
    exportBundle() {
      return {
        app: 'ECHO',
        kind: 'echo-workspace',
        schema: SCHEMA_VERSION,
        exportedAt: now().toISOString(),
        investigations: investigations.map((inv) => ({ ...inv })),
        notes: Object.fromEntries(notes.entries())
      };
    },

    /** Adds investigations from a bundle made by exportBundle(). Never overwrites existing ones. */
    importBundle(bundle) {
      if (!bundle || bundle.kind !== 'echo-workspace' || !Array.isArray(bundle.investigations)) {
        throw new ValidationError('That file is not an ECHO workspace export.');
      }
      const result = { added: 0, skipped: [] };
      const importedNotes = bundle.notes && typeof bundle.notes === 'object' ? bundle.notes : {};
      for (const raw of bundle.investigations.slice(0, MAX_INVESTIGATIONS)) {
        try {
          if (investigations.length >= MAX_INVESTIGATIONS) throw new ValidationError('Investigation limit reached.');
          const normalised = normalizeInvestigation(raw);
          const originalId = normalised.id;
          const clash = investigations.some((inv) => inv.id === originalId);
          if (clash && raw.kind === 'demo') { result.skipped.push({ title: normalised.title, reason: 'already in this workspace' }); continue; }
          if (clash) normalised.id = uid('inv');
          investigations.push(normalised);
          const own = Object.prototype.hasOwnProperty.call(importedNotes, originalId) ? importedNotes[originalId] : [];
          const list = (Array.isArray(own) ? own : []).map(normalizeNote).filter(Boolean).slice(0, MAX_NOTES_PER_INVESTIGATION);
          if (list.length) notes.set(normalised.id, list);
          result.added += 1;
        } catch (error) {
          result.skipped.push({ title: clampText(raw?.title, 80) || 'Untitled', reason: error.message });
        }
      }
      if (result.added) { schedulePersist(); emit('add', {}); }
      return result;
    },

    /** Wipes everything and starts again with the demo investigations. */
    reset() {
      hydrate(null);
      schedulePersist();
      emit('load');
    }
  };

  return store;
}
