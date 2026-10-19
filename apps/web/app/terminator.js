// The day/night line, computed from the Sun's position (no data feed). Pure and unit-tested.
// Accuracy is about a degree, which is plenty for a world map.

const RAD = Math.PI / 180;

/** Sub-solar point { lat, lng } (where the Sun is directly overhead) for a moment. */
export function subsolarPoint(date = new Date()) {
  const jd = date.getTime() / 86400000 + 2440587.5;
  const n = jd - 2451545.0;
  const L = (280.46 + 0.9856474 * n) % 360;
  const g = ((357.528 + 0.9856003 * n) % 360) * RAD;
  const lambda = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD;
  const epsilon = (23.439 - 0.0000004 * n) * RAD;
  const declination = Math.asin(Math.sin(epsilon) * Math.sin(lambda));
  const rightAscension = Math.atan2(Math.cos(epsilon) * Math.sin(lambda), Math.cos(lambda));
  const gmst = (18.697374558 + 24.06570982441908 * n) % 24; // hours
  const lng = ((rightAscension / RAD - gmst * 15) % 360 + 540) % 360 - 180;
  return { lat: declination / RAD, lng };
}

/**
 * The night side as a [lat, lng] ring, for longitudes from `fromLng` to `fromLng + 360`.
 * Closed through the pole that is in darkness.
 */
export function nightPolygon(date = new Date(), { step = 2, fromLng = -180, maxLat = 85 } = {}) {
  const sun = subsolarPoint(date);
  const dec = sun.lat * RAD;
  const ring = [];
  for (let lng = fromLng; lng <= fromLng + 360 + 1e-9; lng += step) {
    const hourAngle = (lng - sun.lng) * RAD;
    // tan(lat) = -cos(H) / tan(dec): the latitude where the Sun is on the horizon.
    const t = Math.abs(dec) < 1e-6 ? 1e-6 : Math.tan(dec);
    const lat = Math.atan(-Math.cos(hourAngle) / t) / RAD;
    ring.push([Math.max(-maxLat, Math.min(maxLat, lat)), lng]);
  }
  const darkPole = sun.lat >= 0 ? -maxLat : maxLat; // the pole tilted away from the Sun
  ring.push([darkPole, fromLng + 360], [darkPole, fromLng]);
  return ring;
}

/** True when it is night (Sun below the horizon) at a point. */
export function isNight(lat, lng, date = new Date()) {
  const sun = subsolarPoint(date);
  const cosZenith = Math.sin(lat * RAD) * Math.sin(sun.lat * RAD) + Math.cos(lat * RAD) * Math.cos(sun.lat * RAD) * Math.cos((lng - sun.lng) * RAD);
  return cosZenith < 0;
}
