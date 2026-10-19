// Place search. Keyless public services, tried in order, so a GitHub Pages site can search
// the whole planet without an API key in the page:
//
//   1. Photon (komoot), built on OpenStreetMap: countries, regions, cities, streets, addresses.
//   2. Open-Meteo Geocoding, built on GeoNames: cities and named places. Used if Photon fails.
//
// Both are free shared services with fair-use limits (see docs/WEB_APP.md). Results are turned
// into one shape here; parsing is pure and unit-tested.

import { parseCoordinates, formatLatLng, isValidLatLng } from '../../../packages/core/src/geo.js';
import { clampText } from '../../../packages/core/src/text.js';

/**
 * @typedef {{ id: string, label: string, detail: string, lat: number, lng: number,
 *   bounds: [[number, number], [number, number]] | null, type: string, source: string }} Place
 */

const PHOTON_TYPES = { country: 'country', state: 'region', county: 'region', city: 'city', district: 'district', locality: 'locality', street: 'street', house: 'address', other: 'place' };

/** Map zoom that suits a kind of place when it has no bounding box. */
export function zoomForPlace(type) {
  return { country: 5, region: 7, city: 11, district: 13, locality: 13, street: 16, address: 17, coords: 10 }[type] ?? 12;
}

/** Radius (km) around a point result inside which an event counts as "here". */
export function nearbyRadiusKm(type) {
  return { country: 0, region: 0, city: 60, district: 25, locality: 25, street: 15, address: 15, coords: 60 }[type] ?? 60;
}

function unique(parts) {
  const seen = new Set();
  return parts.filter((part) => {
    const key = String(part || '').trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Photon GeoJSON -> Place[] */
export function parsePhoton(payload) {
  const features = Array.isArray(payload?.features) ? payload.features : [];
  return features.map((f, i) => {
    const p = f?.properties || {};
    const [lng, lat] = Array.isArray(f?.geometry?.coordinates) ? f.geometry.coordinates.map(Number) : [NaN, NaN];
    if (!isValidLatLng(lat, lng)) return null;
    const street = [p.street, p.housenumber].filter(Boolean).join(' ');
    const label = clampText(p.name || street || p.city || p.state || p.country, 90);
    if (!label) return null;
    let type = PHOTON_TYPES[p.type] || (p.osm_key === 'place' ? PHOTON_TYPES[p.osm_value] : null) || (p.osm_value === 'country' ? 'country' : 'place');
    if (p.osm_key === 'boundary' && p.osm_value === 'administrative' && !p.city && !p.state && p.country === p.name) type = 'country';
    const detail = clampText(unique([p.name && street !== p.name ? street : '', p.city !== label ? p.city : '', p.state !== label ? p.state : '', p.country !== label ? p.country : '']).join(', '), 120);
    let bounds = null;
    if (Array.isArray(p.extent) && p.extent.length === 4 && p.extent.every(Number.isFinite)) {
      const [a, b, c, d] = p.extent.map(Number); // Photon: [west, north, east, south]
      const south = Math.max(-85, Math.min(b, d));
      const north = Math.min(85, Math.max(b, d));
      const west = Math.min(a, c);
      const east = Math.max(a, c);
      if (north > south && east > west) bounds = [[south, west], [north, east]];
    }
    return { id: `photon:${p.osm_type || ''}${p.osm_id || i}`, label, detail, lat, lng, bounds, type, source: 'photon' };
  }).filter(Boolean);
}

/** Open-Meteo geocoding JSON -> Place[] */
export function parseOpenMeteo(payload) {
  const results = Array.isArray(payload?.results) ? payload.results : [];
  return results.map((r) => {
    const lat = Number(r?.latitude);
    const lng = Number(r?.longitude);
    if (!isValidLatLng(lat, lng)) return null;
    const label = clampText(r?.name, 90);
    if (!label) return null;
    const code = String(r?.feature_code || '');
    const type = /^PCL/.test(code) ? 'country' : /^ADM[12]/.test(code) ? 'region' : /^PPL/.test(code) ? 'city' : 'place';
    const detail = clampText(unique([r.admin1 !== label ? r.admin1 : '', r.country !== label ? r.country : '']).join(', '), 120);
    return { id: `open-meteo:${r.id ?? `${lat},${lng}`}`, label, detail, lat, lng, bounds: null, type, source: 'open-meteo' };
  }).filter(Boolean);
}

/** "27.7, 85.3" typed straight into search. */
export function coordinatePlace(text) {
  const c = parseCoordinates(text);
  if (!c) return null;
  return { id: `coords:${c.lat},${c.lng}`, label: formatLatLng(c.lat, c.lng, 4), detail: 'Coordinates', lat: c.lat, lng: c.lng, bounds: null, type: 'coords', source: 'coords' };
}

/** Removes repeats (the same name within about 2 km). */
export function dedupePlaces(places) {
  const kept = [];
  for (const place of places) {
    const twin = kept.find((k) => k.label.toLowerCase() === place.label.toLowerCase() && Math.abs(k.lat - place.lat) < 0.02 && Math.abs(k.lng - place.lng) < 0.02);
    if (!twin) kept.push(place);
  }
  return kept;
}

export const DEFAULT_PROVIDERS = [
  { id: 'photon', url: 'https://photon.komoot.io/api/', attribution: 'Search by Photon · © OpenStreetMap contributors' },
  { id: 'open-meteo', url: 'https://geocoding-api.open-meteo.com/v1/search', attribution: 'Search by Open-Meteo · GeoNames' }
];

export function providerUrl(provider, query, { limit = 6, lang = 'en', near = null } = {}) {
  if (provider.id === 'photon') {
    const params = new URLSearchParams({ q: query, limit: String(limit), lang });
    if (near) { params.set('lat', near.lat.toFixed(3)); params.set('lon', near.lng.toFixed(3)); params.set('zoom', String(Math.round(near.zoom ?? 6))); }
    return `${provider.url}?${params}`;
  }
  if (provider.id === 'open-meteo') return `${provider.url}?${new URLSearchParams({ name: query, count: String(limit), language: lang, format: 'json' })}`;
  throw new Error(`Unknown search provider ${provider.id}`);
}

/**
 * Searches with the first provider that answers. Resolves { places, provider } or throws
 * when every provider failed (the UI then says so plainly). Aborts with `signal`.
 */
export async function searchPlaces(query, { providers = DEFAULT_PROVIDERS, fetchImpl = globalThis.fetch, signal, timeoutMs = 6000, near = null, limit = 6 } = {}) {
  const text = String(query || '').trim();
  if (text.length < 2) return { places: [], provider: null };
  let lastError = null;
  for (const provider of providers) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const onAbort = () => controller.abort();
    signal?.addEventListener('abort', onAbort, { once: true });
    try {
      const response = await fetchImpl(providerUrl(provider, text, { near, limit }), { headers: { Accept: 'application/json' }, signal: controller.signal });
      if (!response.ok) throw new Error(`${provider.id} responded with ${response.status}`);
      const data = await response.json();
      const places = dedupePlaces(provider.id === 'photon' ? parsePhoton(data) : parseOpenMeteo(data)).slice(0, limit);
      return { places, provider };
    } catch (error) {
      if (signal?.aborted) throw error;
      lastError = error;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }
  }
  throw lastError || new Error('No search provider is configured');
}

/** True when a point lies inside [[s, w], [n, e]] (handles boxes that cross the date line). */
export function inBounds(bounds, lat, lng) {
  const [[s, w], [n, e]] = bounds;
  if (lat < s || lat > n) return false;
  return w <= e ? lng >= w && lng <= e : lng >= w || lng <= e;
}
