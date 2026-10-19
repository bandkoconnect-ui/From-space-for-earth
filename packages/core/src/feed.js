// Planet Pulse data: the live NASA EONET feed with an offline cache.
//
// load() returns { items, fetchedAt, stale, error }. When the network fails it falls back
// to the last successful result stored on this device, with stale: true, so the screen is
// never empty just because the person is offline.

import { fetchEvents, normaliseEvent } from './eonet.js';

/** Re-validates an event that was stored by cacheEvents() (a tampered file must not break the UI). */
export function restoreEvent(saved) {
  if (!saved || typeof saved !== 'object') return null;
  return normaliseEvent({
    id: saved.id,
    title: saved.title,
    description: saved.description,
    link: saved.link,
    closed: saved.closed,
    categories: [{ id: saved.categoryId, title: saved.category }],
    sources: saved.sources,
    geometry: (Array.isArray(saved.geometry) ? saved.geometry : []).map((g) => ({
      date: g?.date,
      type: g?.type,
      coordinates: g?.coordinates,
      magnitudeValue: g?.magnitude?.value,
      magnitudeUnit: g?.magnitude?.unit
    }))
  });
}

export function createEventFeed({ store, fetcher = fetchEvents, now = () => new Date(), ttlMs = 10 * 60 * 1000, limit = 60 } = {}) {
  let inflight = null;
  let last = null;

  function cached() {
    const { items, fetchedAt } = store.cachedEvents();
    return { items: items.map(restoreEvent).filter(Boolean), fetchedAt };
  }

  const feed = {
    /** Events from the last successful load on this device, without touching the network. */
    cached,

    async load({ force = false } = {}) {
      const started = now().getTime();
      if (!force && last && started - last.at < ttlMs) return last.result;
      if (inflight) return inflight;
      inflight = (async () => {
        try {
          const items = await fetcher({ status: 'open', limit });
          const fetchedAt = now().toISOString();
          store.cacheEvents(items, fetchedAt);
          const result = { items, fetchedAt, stale: false, error: null };
          last = { at: started, result };
          return result;
        } catch (error) {
          const fallback = cached();
          return { items: fallback.items, fetchedAt: fallback.fetchedAt, stale: true, error };
        } finally {
          inflight = null;
        }
      })();
      return inflight;
    },

    find(id) {
      return (last?.result.items || cached().items).find((event) => event.id === id) || null;
    }
  };
  return feed;
}
