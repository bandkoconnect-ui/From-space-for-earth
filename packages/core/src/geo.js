// Geographic helpers. Public API uses [lat, lng] pairs (Leaflet order).
// GeoJSON / EONET input uses [lng, lat]; use the lonLat* helpers when converting.

export const MAX_LAT = 85; // Web-Mercator maps cannot show the poles

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function isValidLatLng(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= MAX_LAT && Math.abs(lng) <= 180;
}

/** "27.7172° N, 85.3240° E" */
export function formatLatLng(lat, lng, digits = 4) {
  return `${Math.abs(lat).toFixed(digits)}° ${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lng).toFixed(digits)}° ${lng >= 0 ? 'E' : 'W'}`;
}

export function wrapLng(lng) {
  return ((((lng + 180) % 360) + 360) % 360) - 180;
}

/** Great-circle distance in kilometres. */
export function haversineKm(a, b) {
  const R = 6371.0088;
  const rad = Math.PI / 180;
  const dLat = (b[0] - a[0]) * rad;
  const dLng = (b[1] - a[1]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Point reached from `origin` after `distanceKm` along `bearingDeg`. */
export function destination(origin, distanceKm, bearingDeg) {
  const R = 6371.0088;
  const rad = Math.PI / 180;
  const d = distanceKm / R;
  const brg = bearingDeg * rad;
  const lat1 = origin[0] * rad;
  const lng1 = origin[1] * rad;
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(brg));
  const lng2 = lng1 + Math.atan2(Math.sin(brg) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
  return [lat2 / rad, wrapLng(lng2 / rad)];
}

/** Polygon ring approximating a circle (used for GeoJSON export). Returns [lat, lng] pairs. */
export function circleToRing(center, radiusKm, steps = 48) {
  const ring = [];
  for (let i = 0; i < steps; i += 1) ring.push(destination(center, radiusKm, (360 * i) / steps));
  ring.push(ring[0]);
  return ring;
}

/** Map zoom that shows a circle of the given radius comfortably on a typical screen. */
export function zoomForRadiusKm(radiusKm) {
  if (radiusKm <= 3) return 12;
  if (radiusKm <= 8) return 11;
  if (radiusKm <= 20) return 10;
  if (radiusKm <= 45) return 9;
  if (radiusKm <= 90) return 8;
  if (radiusKm <= 200) return 7;
  if (radiusKm <= 450) return 6;
  return 5;
}

/** Average of ring vertices; good enough to place a map view over a small polygon. */
export function ringCenter(ring) {
  const points = ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1] ? ring.slice(0, -1) : ring;
  const sum = points.reduce((acc, p) => [acc[0] + p[0], acc[1] + p[1]], [0, 0]);
  return [sum[0] / points.length, sum[1] / points.length];
}

/** Converts a GeoJSON ring ([lng, lat] pairs) to [lat, lng] pairs. */
export function lonLatRingToLatLng(ring) {
  return ring.map(([lng, lat]) => [lat, lng]);
}

/**
 * Centre of a GeoJSON-style geometry as [lat, lng]. Supports Point and Polygon,
 * the two shapes NASA EONET returns. Returns null for anything else.
 */
export function geometryCenter(geometry) {
  if (!geometry || !Array.isArray(geometry.coordinates)) return null;
  if (geometry.type === 'Point') {
    const [lng, lat] = geometry.coordinates;
    return Number.isFinite(lat) && Number.isFinite(lng) ? [lat, lng] : null;
  }
  if (geometry.type === 'Polygon' && Array.isArray(geometry.coordinates[0]) && geometry.coordinates[0].length) {
    const ring = lonLatRingToLatLng(geometry.coordinates[0]);
    return ring.every((p) => Number.isFinite(p[0]) && Number.isFinite(p[1])) ? ringCenter(ring) : null;
  }
  return null;
}

/** Bounding box of [lat, lng] points as [[south, west], [north, east]], or null when empty. */
export function boundsOf(points) {
  if (!points.length) return null;
  let south = 90;
  let north = -90;
  let west = 180;
  let east = -180;
  for (const [lat, lng] of points) {
    south = Math.min(south, lat);
    north = Math.max(north, lat);
    west = Math.min(west, lng);
    east = Math.max(east, lng);
  }
  return [[south, west], [north, east]];
}

/**
 * Parses pasted coordinates such as "27.7172, 85.3240", "27.7172° N, 85.3240° E" or
 * "3.4653 S 62.2159 W". Hemisphere letters win over sign and order. Returns { lat, lng }
 * or null when the text is not exactly one valid latitude and longitude.
 */
export function parseCoordinates(text) {
  const matches = [...String(text ?? '').matchAll(/(-?\d+(?:[.,]\d+)?)\s*°?\s*([NSEW])?/gi)];
  if (matches.length !== 2) return null;
  const parsed = matches.map((m) => ({ value: Number(m[1].replace(',', '.')), hemisphere: m[2] ? m[2].toUpperCase() : null }));
  if (parsed.some((p) => !Number.isFinite(p.value))) return null;
  let lat;
  let lng;
  for (const p of parsed) {
    const signed = p.hemisphere === 'S' || p.hemisphere === 'W' ? -Math.abs(p.value) : p.hemisphere ? Math.abs(p.value) : p.value;
    if (p.hemisphere === 'N' || p.hemisphere === 'S') lat = lat === undefined ? signed : NaN;
    else if (p.hemisphere === 'E' || p.hemisphere === 'W') lng = lng === undefined ? signed : NaN;
  }
  if (parsed.every((p) => !p.hemisphere)) [lat, lng] = [parsed[0].value, parsed[1].value];
  else if (lat === undefined || lng === undefined) return null;
  return isValidLatLng(lat, lng) ? { lat, lng } : null;
}
