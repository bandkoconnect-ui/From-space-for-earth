import test from 'node:test';
import assert from 'node:assert/strict';
import { addDays, buildTimeline, clampToToday, daysBetween, formatDate, formatDateLong, formatDateShort, parseIso, relativeDays, toIsoDate } from '../src/dates.js';
import { boundsOf, circleToRing, destination, formatLatLng, geometryCenter, haversineKm, isValidLatLng, ringCenter, wrapLng, zoomForRadiusKm } from '../src/geo.js';

test('toIsoDate understands ISO, timestamps, Dates and the prototype display format', () => {
  assert.equal(toIsoDate('2026-08-12'), '2026-08-12');
  assert.equal(toIsoDate('2026-08-12T23:59:59Z'), '2026-08-12');
  assert.equal(toIsoDate('12 AUG 2026'), '2026-08-12');
  assert.equal(toIsoDate('1 sep 2025'), '2025-09-01');
  assert.equal(toIsoDate(new Date(Date.UTC(2026, 0, 5))), '2026-01-05');
});

test('toIsoDate rejects impossible or malformed dates', () => {
  for (const bad of ['2026-02-31', '31 FEB 2026', '12 XYZ 2026', 'tomorrow', '', null, undefined, 42, new Date('nope')]) {
    assert.equal(toIsoDate(bad), null, String(bad));
  }
});

test('date arithmetic crosses month and year boundaries', () => {
  assert.equal(addDays('2026-12-30', 3), '2027-01-02');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(daysBetween('2026-08-12', '2026-08-27'), 15);
  assert.equal(daysBetween('2026-08-27', '2026-08-12'), -15);
  assert.throws(() => parseIso('nonsense'), RangeError);
});

test('date formatting', () => {
  assert.equal(formatDate('2026-08-05'), '05 AUG 2026');
  assert.equal(formatDateLong('2026-08-05'), '5 August 2026');
  assert.equal(formatDateShort('2026-08-05'), '05 AUG');
});

test('relativeDays and clampToToday use the supplied clock', () => {
  const now = new Date(Date.UTC(2026, 9, 19, 12));
  assert.equal(relativeDays('2026-10-19', now), 'today');
  assert.equal(relativeDays('2026-10-18', now), 'yesterday');
  assert.equal(relativeDays('2026-10-09', now), '10 days ago');
  assert.equal(relativeDays('2026-02-19', now), '8 months ago'); // 242 days
  assert.equal(relativeDays('2024-01-01', now), '3 years ago');
  assert.equal(clampToToday('2026-12-01', now), '2026-10-19');
  assert.equal(clampToToday('2026-08-01', now), '2026-08-01');
});

test('buildTimeline spreads dates evenly and collapses duplicates', () => {
  assert.deepEqual(buildTimeline('2026-08-01', '2026-08-31', 4), ['2026-08-01', '2026-08-11', '2026-08-21', '2026-08-31']);
  assert.deepEqual(buildTimeline('2026-08-01', '2026-08-03', 4), ['2026-08-01', '2026-08-02', '2026-08-03']);
  assert.deepEqual(buildTimeline('2026-08-01', '2026-08-01', 4), ['2026-08-01']);
});

test('coordinates are validated and formatted', () => {
  assert.equal(isValidLatLng(27.7, 85.3), true);
  assert.equal(isValidLatLng(86, 0), false);
  assert.equal(isValidLatLng(0, 181), false);
  assert.equal(isValidLatLng(NaN, 0), false);
  assert.equal(formatLatLng(27.7172, 85.324), '27.7172° N, 85.3240° E');
  assert.equal(formatLatLng(-3.4653, -62.2159, 2), '3.47° S, 62.22° W');
  assert.equal(wrapLng(190), -170);
  assert.equal(wrapLng(-190), 170);
});

test('distance helpers agree with each other', () => {
  assert.ok(Math.abs(haversineKm([0, 0], [0, 1]) - 111.195) < 0.05);
  const origin = [27.7172, 85.324];
  for (const bearing of [0, 90, 180, 270, 45]) {
    const moved = destination(origin, 25, bearing);
    assert.ok(Math.abs(haversineKm(origin, moved) - 25) < 0.01, `bearing ${bearing}`);
  }
  const ring = circleToRing(origin, 10, 24);
  assert.equal(ring.length, 25);
  assert.deepEqual(ring[0], ring[24]);
  assert.ok(ring.every((p) => Math.abs(haversineKm(origin, p) - 10) < 0.01));
});

test('zoomForRadiusKm gets lower as the area gets larger', () => {
  const radii = [1, 5, 15, 30, 70, 150, 300, 500];
  const zooms = radii.map(zoomForRadiusKm);
  for (let i = 1; i < zooms.length; i += 1) assert.ok(zooms[i] <= zooms[i - 1]);
  assert.ok(zooms[0] > zooms[zooms.length - 1]);
});

test('geometryCenter handles EONET Points and Polygons (lng, lat order)', () => {
  assert.deepEqual(geometryCenter({ type: 'Point', coordinates: [85.3, 27.7] }), [27.7, 85.3]);
  const polygon = { type: 'Polygon', coordinates: [[[10, 10], [12, 10], [12, 12], [10, 12], [10, 10]]] };
  assert.deepEqual(geometryCenter(polygon), [11, 11]);
  assert.equal(geometryCenter({ type: 'LineString', coordinates: [] }), null);
  assert.equal(geometryCenter({ type: 'Point', coordinates: ['x', 'y'] }), null);
  assert.equal(geometryCenter(null), null);
});

test('boundsOf and ringCenter', () => {
  assert.deepEqual(boundsOf([[1, 2], [3, -4], [-1, 5]]), [[-1, -4], [3, 5]]);
  assert.equal(boundsOf([]), null);
  assert.deepEqual(ringCenter([[0, 0], [0, 2], [2, 2], [2, 0]]), [1, 1]);
});

test('parseCoordinates accepts the formats people actually paste', async () => {
  const { parseCoordinates } = await import('../src/geo.js');
  assert.deepEqual(parseCoordinates('27.7172, 85.3240'), { lat: 27.7172, lng: 85.324 });
  assert.deepEqual(parseCoordinates('27.7172 85.3240'), { lat: 27.7172, lng: 85.324 });
  assert.deepEqual(parseCoordinates('-3.4653,-62.2159'), { lat: -3.4653, lng: -62.2159 });
  assert.deepEqual(parseCoordinates('27.7172° N, 85.3240° E'), { lat: 27.7172, lng: 85.324 });
  assert.deepEqual(parseCoordinates('3.4653 S 62.2159 W'), { lat: -3.4653, lng: -62.2159 });
  assert.deepEqual(parseCoordinates('85.324 E 27.7172 N'), { lat: 27.7172, lng: 85.324 }, 'letters decide the order');
});

test('parseCoordinates rejects anything ambiguous or out of range', async () => {
  const { parseCoordinates } = await import('../src/geo.js');
  for (const bad of ['', 'Kathmandu', '27.7', '1 2 3', '95, 10', '10, 200', '10 N, 20 N', null, undefined]) {
    assert.equal(parseCoordinates(bad), null, String(bad));
  }
});
