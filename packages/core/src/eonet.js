// NASA EONET (Earth Observatory Natural Event Tracker) client.
// Docs: https://eonet.gsfc.nasa.gov/docs/v3
//
// EONET is an event feed, not a news service. Events can be incomplete or delayed, so the UI
// always links to the original source.

import { geometryCenter } from './geo.js';
import { toIsoDate } from './dates.js';
import { clampText, safeUrl } from './text.js';

export const EONET_EVENTS_URL = 'https://eonet.gsfc.nasa.gov/api/v3/events';

/** Display data and the investigation topic for each EONET category id. */
export const EVENT_CATEGORIES = {
  wildfires: { label: 'Wildfires', color: '#ff8f5a', topic: 'fire' },
  severeStorms: { label: 'Severe storms', color: '#a595ff', topic: 'storm' },
  volcanoes: { label: 'Volcanoes', color: '#ff6b6b', topic: 'volcano' },
  floods: { label: 'Floods', color: '#4fbded', topic: 'flood' },
  landslides: { label: 'Landslides', color: '#c9a36a', topic: 'flood' },
  drought: { label: 'Drought', color: '#e6c15a', topic: 'environment' },
  dustHaze: { label: 'Dust and haze', color: '#d1b38a', topic: 'environment' },
  earthquakes: { label: 'Earthquakes', color: '#f08fb0', topic: 'other' },
  seaLakeIce: { label: 'Sea and lake ice', color: '#9fd8ff', topic: 'environment' },
  snow: { label: 'Snow', color: '#cfe8ff', topic: 'environment' },
  tempExtremes: { label: 'Temperature extremes', color: '#ffb36b', topic: 'environment' },
  waterColor: { label: 'Water colour', color: '#6fd6c5', topic: 'environment' },
  manmade: { label: 'Human-made events', color: '#b8c4cc', topic: 'other' }
};

const FALLBACK_CATEGORY = { label: 'Earth event', color: '#9af3c6', topic: 'other' };

export function categoryInfo(categoryId) {
  return EVENT_CATEGORIES[categoryId] || FALLBACK_CATEGORY;
}

export function buildEventsUrl({ status = 'open', limit = 50, days = null, category = null } = {}) {
  const params = new URLSearchParams({ status, limit: String(limit) });
  if (days) params.set('days', String(days));
  if (category) params.set('category', category);
  return `${EONET_EVENTS_URL}?${params.toString()}`;
}

/**
 * Turns one raw EONET event into the shape the apps use. Returns null if the event has no
 * usable location, since an event we cannot place on a map is not useful here.
 */
export function normaliseEvent(raw) {
  if (!raw || typeof raw !== 'object' || !raw.id) return null;
  const geometry = (Array.isArray(raw.geometry) ? raw.geometry : [])
    .map((g) => ({
      date: toIsoDate(g?.date),
      type: g?.type,
      coordinates: g?.coordinates,
      magnitude: Number.isFinite(g?.magnitudeValue) ? { value: g.magnitudeValue, unit: clampText(g.magnitudeUnit, 24) } : null
    }))
    .filter((g) => g.date && geometryCenter(g))
    .sort((a, b) => a.date.localeCompare(b.date));
  if (!geometry.length) return null;

  const category = Array.isArray(raw.categories) ? raw.categories[0] : null;
  const categoryId = category?.id || '';
  const info = categoryInfo(categoryId);
  const latest = geometry[geometry.length - 1];
  const [lat, lng] = geometryCenter(latest);
  return {
    id: clampText(raw.id, 64),
    title: clampText(raw.title, 160) || 'Untitled event',
    description: clampText(raw.description, 600),
    link: safeUrl(raw.link),
    closed: toIsoDate(raw.closed),
    categoryId,
    category: clampText(category?.title, 60) || info.label,
    color: info.color,
    topic: info.topic,
    sources: (Array.isArray(raw.sources) ? raw.sources : [])
      .map((s) => ({ id: clampText(s?.id, 30), url: safeUrl(s?.url) }))
      .filter((s) => s.url),
    geometry,
    lat,
    lng,
    firstDate: geometry[0].date,
    date: latest.date
  };
}

export function normaliseEvents(payload) {
  const events = Array.isArray(payload?.events) ? payload.events : [];
  return events.map(normaliseEvent).filter(Boolean).sort((a, b) => b.date.localeCompare(a.date));
}

/**
 * Fetches and normalises active events. `fetchImpl` is injectable for tests and for native
 * HTTP stacks. Throws on network or HTTP errors so callers can fall back to cached data.
 */
export async function fetchEvents({ fetchImpl = globalThis.fetch, timeoutMs = 12000, signal, ...query } = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('No fetch implementation available');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    const response = await fetchImpl(buildEventsUrl(query), { headers: { Accept: 'application/json' }, signal: controller.signal });
    if (!response.ok) throw new Error(`NASA EONET responded with ${response.status}`);
    return normaliseEvents(await response.json());
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}
