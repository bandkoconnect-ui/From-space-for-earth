// Unit tests for the web app's pure modules: clustering, routing, search parsing,
// imagery sources, the day/night line and the Field Report model.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { clusterPoints, clusterRadius, nearestLng } from '../app/cluster.js';
import { formatHash, parseHash } from '../app/router.js';
import { coordinatePlace, dedupePlaces, inBounds, parseOpenMeteo, parsePhoton, providerUrl, searchPlaces } from '../app/geocode.js';
import { geostationaryFor, gibsSnapshotUrl, liveSources, sourceName } from '../app/sources.js';
import { isNight, nightPolygon, subsolarPoint } from '../app/terminator.js';
import { eventInvestigation, eventReport, eventSummary, findHotspots, investigationReport, isRecent, placeFromTitle } from '../app/subjects.js';
import { normaliseEvent } from '../../../packages/core/src/eonet.js';
import { demoInvestigations } from '../../../packages/core/src/seed.js';

const NOW = new Date('2026-10-19T12:00:00Z');

function rawEvent(overrides = {}) {
  return {
    id: 'EONET_1', title: 'Wildfire Alpha, Portugal', description: null, link: 'https://eonet.gsfc.nasa.gov/api/v3/events/EONET_1', closed: null,
    categories: [{ id: 'wildfires', title: 'Wildfires' }],
    sources: [{ id: 'IRWIN', url: 'https://example.org/fire' }],
    geometry: [
      { magnitudeValue: 100, magnitudeUnit: 'acres', date: '2026-10-10T00:00:00Z', type: 'Point', coordinates: [-8.1, 40.2] },
      { magnitudeValue: 250, magnitudeUnit: 'acres', date: '2026-10-14T00:00:00Z', type: 'Point', coordinates: [-8.05, 40.25] },
      { magnitudeValue: 400, magnitudeUnit: 'acres', date: '2026-10-18T00:00:00Z', type: 'Point', coordinates: [-8.0, 40.3] }
    ],
    ...overrides
  };
}
const event = (o) => normaliseEvent(rawEvent(o));

describe('clustering', () => {
  it('groups nearby pins and keeps far ones apart', () => {
    const groups = clusterPoints([{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 10, y: 10 }, { id: 'c', x: 300, y: 300 }], { radius: 40 });
    assert.equal(groups.length, 2);
    const cluster = groups.find((g) => g.ids.length === 2);
    assert.deepEqual(cluster.ids.sort(), ['a', 'b']);
    assert.equal(cluster.x, 5);
    assert.match(cluster.key, /^c:/);
  });
  it('never clusters a kept (selected) pin', () => {
    const groups = clusterPoints([{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 5, y: 5 }], { radius: 40, keep: new Set(['b']) });
    assert.equal(groups.length, 2);
    assert.ok(groups.every((g) => g.ids.length === 1));
  });
  it('lets the highest-ranked point lead its cluster', () => {
    const [g] = clusterPoints([{ id: 'old', x: 0, y: 0, rank: 5 }, { id: 'new', x: 3, y: 0, rank: 1 }], { radius: 40 });
    assert.equal(g.lead, 'new');
  });
  it('gives stable keys and ignores bad coordinates', () => {
    const pts = [{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 1, y: 1 }, { id: 'z', x: NaN, y: 0 }];
    assert.deepEqual(clusterPoints(pts).map((g) => g.key), clusterPoints(pts.slice().reverse()).map((g) => g.key));
    assert.equal(clusterPoints(pts).flatMap((g) => g.ids).includes('z'), false);
  });
  it('tightens the radius as you zoom in', () => {
    assert.ok(clusterRadius(2) > clusterRadius(9));
    assert.ok(clusterRadius(9) > clusterRadius(12));
    assert.ok(clusterRadius(2, { coarse: true }) > clusterRadius(2));
  });
  it('places pins on the world copy nearest the view', () => {
    assert.equal(nearestLng(170, -170), -190);
    assert.equal(nearestLng(10, 370), 370);
    assert.equal(nearestLng(10, 0), 10);
  });
});

describe('address bar', () => {
  it('round-trips a selection and a view', () => {
    const hash = formatHash({ selection: { kind: 'event', id: 'EONET_123' }, view: { lat: 40.3, lng: -8, zoom: 6.1 } });
    assert.equal(hash, '#event=EONET_123&map=40.30,-8.00,6');
    assert.deepEqual(parseHash(hash), { selection: { kind: 'event', id: 'EONET_123' }, view: { lat: 40.3, lng: -8, zoom: 6 } });
  });
  it('ignores junk and wraps longitudes', () => {
    assert.deepEqual(parseHash('#event=<script>&map=999,0,3'), { selection: null, view: null });
    assert.equal(parseHash('#map=10,370,2').view.lng, 10);
    assert.deepEqual(parseHash('#inv=demo-nepal').selection, { kind: 'inv', id: 'demo-nepal' });
    assert.equal(formatHash({}), '');
  });
});

describe('place search', () => {
  const photon = { features: [
    { geometry: { coordinates: [9.73, 52.37] }, properties: { name: 'Hannover', state: 'Lower Saxony', country: 'Germany', osm_key: 'place', osm_value: 'city', type: 'city', osm_type: 'R', osm_id: 59418, extent: [9.6, 52.45, 9.9, 52.3] } },
    { geometry: { coordinates: [84.1, 28.3] }, properties: { name: 'Nepal', country: 'Nepal', osm_key: 'place', osm_value: 'country', type: 'country', osm_id: 184633, extent: [80.05, 30.45, 88.2, 26.34] } },
    { geometry: { coordinates: [999, 0] }, properties: { name: 'Broken' } },
    { geometry: { coordinates: [13.4, 52.5] }, properties: { street: 'Unter den Linden', housenumber: '1', city: 'Berlin', country: 'Germany', type: 'house' } }
  ] };
  it('parses Photon results, with bounds and kinds', () => {
    const places = parsePhoton(photon);
    assert.equal(places.length, 3);
    assert.equal(places[0].label, 'Hannover');
    assert.equal(places[0].detail, 'Lower Saxony, Germany');
    assert.deepEqual(places[0].bounds, [[52.3, 9.6], [52.45, 9.9]]);
    assert.equal(places[1].type, 'country');
    assert.equal(places[1].detail, '');
    assert.equal(places[2].label, 'Unter den Linden 1');
    assert.equal(places[2].type, 'address');
  });
  it('parses Open-Meteo results', () => {
    const places = parseOpenMeteo({ results: [
      { id: 1, name: 'Kathmandu', latitude: 27.7, longitude: 85.3, feature_code: 'PPLC', admin1: 'Bagmati', country: 'Nepal' },
      { id: 2, name: 'Nepal', latitude: 28, longitude: 84, feature_code: 'PCLI', country: 'Nepal' },
      { id: 3, name: 'Nowhere', latitude: 'x', longitude: 1 }
    ] });
    assert.deepEqual(places.map((p) => [p.label, p.type, p.detail]), [['Kathmandu', 'city', 'Bagmati, Nepal'], ['Nepal', 'country', '']]);
  });
  it('understands typed coordinates', () => {
    assert.equal(coordinatePlace('27.7172, 85.3240').lat, 27.7172);
    assert.equal(coordinatePlace('Hannover'), null);
  });
  it('drops duplicates and checks bounds across the date line', () => {
    assert.equal(dedupePlaces([{ label: 'A', lat: 1, lng: 1 }, { label: 'a', lat: 1.001, lng: 1 }, { label: 'A', lat: 5, lng: 5 }]).length, 2);
    assert.ok(inBounds([[-20, 170], [0, -170]], -10, 179));
    assert.ok(inBounds([[-20, 170], [0, -170]], -10, -175));
    assert.ok(!inBounds([[-20, 170], [0, -170]], -10, 0));
  });
  it('builds provider URLs without leaking anything but the query', () => {
    assert.equal(providerUrl({ id: 'photon', url: 'https://photon.komoot.io/api/' }, 'kathmandu'), 'https://photon.komoot.io/api/?q=kathmandu&limit=6&lang=en');
    assert.match(providerUrl({ id: 'open-meteo', url: 'https://geocoding-api.open-meteo.com/v1/search' }, 'nepal'), /name=nepal&count=6/);
  });
  it('falls back to the next provider, and throws when all fail', async () => {
    const calls = [];
    const fetchImpl = async (url) => {
      calls.push(url);
      if (url.includes('photon')) return { ok: false, status: 503 };
      return { ok: true, json: async () => ({ results: [{ id: 1, name: 'Kathmandu', latitude: 27.7, longitude: 85.3, feature_code: 'PPLC' }] }) };
    };
    const result = await searchPlaces('kath', { fetchImpl });
    assert.equal(result.provider.id, 'open-meteo');
    assert.equal(result.places[0].label, 'Kathmandu');
    assert.equal(calls.length, 2);
    await assert.rejects(() => searchPlaces('kath', { fetchImpl: async () => { throw new Error('offline'); } }), /offline/);
    assert.deepEqual(await searchPlaces('k', { fetchImpl }), { places: [], provider: null });
  });
});

describe('imagery and live sources', () => {
  it('builds a GIBS GetMap URL with the date clamped to today', () => {
    const url = new URL(gibsSnapshotUrl({ lat: 0, lng: 0, date: '2030-01-01', spanKm: 100, width: 400, height: 200, now: NOW }));
    assert.equal(url.origin + url.pathname, 'https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi');
    assert.equal(url.searchParams.get('TIME'), '2026-10-19');
    assert.equal(url.searchParams.get('SRS'), 'EPSG:3857');
    assert.equal(url.searchParams.get('LAYERS'), 'MODIS_Terra_CorrectedReflectance_TrueColor');
    const [x0, y0, x1, y1] = url.searchParams.get('BBOX').split(',').map(Number);
    assert.equal(x1 - x0, 100000);
    assert.equal(y1 - y0, 50000);
  });
  it('picks the geostationary satellite that sees a longitude', () => {
    assert.equal(geostationaryFor(-75).family, 'GOES');
    assert.equal(geostationaryFor(10).family, 'Meteosat');
    assert.equal(geostationaryFor(140).family, 'Himawari');
    assert.equal(geostationaryFor(-170).family, 'Himawari');
  });
  it('lists only real viewers and never a webcam', () => {
    const list = liveSources({ lat: 40, lng: -100, categoryId: 'wildfires', date: '2026-10-18', now: NOW });
    assert.deepEqual(list.map((s) => s.id), ['gibs-latest', 'slider', 'goes', 'firms', 'worldview']);
    assert.ok(list.every((s) => !/webcam|stream/i.test(s.title)));
    assert.match(list[0].detail, /not live/);
  });
  it('names EONET sources', () => {
    assert.equal(sourceName('JTWC'), 'Joint Typhoon Warning Center');
    assert.equal(sourceName('XYZ'), 'XYZ');
  });
});

describe('day and night', () => {
  it('puts the Sun over the Tropic of Cancer at the June solstice, near Greenwich at noon UTC', () => {
    const sun = subsolarPoint(new Date('2026-06-21T12:00:00Z'));
    assert.ok(Math.abs(sun.lat - 23.4) < 0.6, `lat ${sun.lat}`);
    assert.ok(Math.abs(sun.lng) < 3, `lng ${sun.lng}`);
  });
  it('knows where it is night', () => {
    const noonGreenwich = new Date('2026-03-20T12:00:00Z');
    assert.equal(isNight(51.5, 0, noonGreenwich), false);
    assert.equal(isNight(0, 180, noonGreenwich), true);
  });
  it('draws a closed ring across all longitudes', () => {
    const ring = nightPolygon(new Date('2026-06-21T12:00:00Z'));
    assert.equal(ring[0][1], -180);
    assert.equal(ring[ring.length - 3][1], 180);
    assert.equal(ring[ring.length - 1][0], -85); // northern summer: the south pole is dark
  });
});

describe('Field Report for an event', () => {
  it('reports only what the feed says', () => {
    const report = eventReport(event(), { now: NOW });
    assert.equal(report.title, 'Wildfire Alpha, Portugal');
    assert.equal(report.place, 'Portugal');
    assert.equal(report.statusLine, 'Open · updated yesterday');
    assert.equal(report.recent, true);
    assert.deepEqual(report.window.items.map((i) => i.kind), ['context', 'start', 'update', 'latest']);
    assert.equal(report.window.items[0].date, '2026-09-30');
    assert.deepEqual(report.window.series.map((s) => s.value), [100, 250, 400]);
    assert.match(report.interpretation.observed[0], /1 organisation reported this event; 3 position reports between 10 October 2026 and 18 October 2026/);
    assert.ok(report.interpretation.observed.some((line) => /from 100 to 400/.test(line)));
    assert.equal(report.analysis[0].id, 'fires'); // the useful layer for a wildfire comes first
    assert.deepEqual(report.evidence.imagery.map((i) => i.role), ['Before', 'First report', 'Latest']);
    assert.equal(report.evidence.sources[0].label, 'IRWIN (US wildland fire reporting)');
    assert.ok(report.notRun[0].includes('No automated measurement'));
  });
  it('keeps the imagery timeline in step with the event window', () => {
    const report = eventReport(event(), { now: NOW });
    const tl = report.investigation.timeline;
    for (const item of report.window.items) if (item.timelineIndex !== null) assert.equal(tl[item.timelineIndex].date, item.date);
    assert.equal(tl.length, 4);
    assert.equal(report.investigation.id, 'event:EONET_1');
  });
  it('says plainly when the source gives no size', () => {
    const e = event({ geometry: [{ date: '2026-08-01T00:00:00Z', type: 'Point', coordinates: [10, 10] }] });
    const report = eventReport(e, { now: NOW });
    assert.equal(report.recent, false);
    const trend = report.analysis.find((a) => a.id === 'trend');
    assert.equal(trend.available, false);
    assert.match(trend.detail, /does not report/);
    assert.deepEqual(report.window.items.map((i) => i.kind), ['context', 'start']);
    assert.equal(eventSummary(e, NOW), 'Reported 3 months ago.');
  });
  it('marks closed events as closed and not recent', () => {
    const e = event({ closed: '2026-10-18T00:00:00Z' });
    assert.equal(isRecent(e, NOW), false);
    assert.match(eventReport(e, { now: NOW }).statusLine, /^Closed/);
  });
  it('builds an investigation that the shared core accepts', () => {
    const inv = eventInvestigation(event(), { now: NOW });
    assert.equal(inv.kind, 'event');
    assert.equal(inv.event.id, 'EONET_1');
  });
});

describe('Field Report for an investigation', () => {
  it('labels the Amazon demo as a workflow demo with an illustrative area', () => {
    const amazon = demoInvestigations().find((i) => i.id === 'demo-amazon');
    const report = investigationReport(amazon, { now: NOW });
    assert.equal(report.kindLabel, 'Workflow demo');
    assert.match(report.notRun[0], /drawn by hand/);
  });
  it('keeps the Nepal case study tied to its sources', () => {
    const nepal = demoInvestigations().find((i) => i.id === 'demo-nepal');
    const report = investigationReport(nepal, { now: NOW });
    assert.equal(report.kindLabel, 'Case study');
    assert.equal(report.evidence.sources[0].verified, true);
    assert.equal(report.points.length, 5);
    assert.equal(report.window.items.length, 4);
  });
});

describe('hotspots', () => {
  it('finds three or more nearby events of one kind, and nothing else', () => {
    const fires = ['a', 'b', 'c'].map((id, i) => event({ id: `F${id}`, title: `Fire ${id}, Oregon`, geometry: [{ date: '2026-10-1' + i + 'T00:00:00Z', type: 'Point', coordinates: [-122 + i * 0.5, 44] }] }));
    const lone = event({ id: 'L', title: 'Fire far away, Chile', geometry: [{ date: '2026-10-10T00:00:00Z', type: 'Point', coordinates: [-70, -35] }] });
    const spots = findHotspots([...fires, lone]);
    assert.equal(spots.length, 1);
    assert.equal(spots[0].count, 3);
    assert.equal(spots[0].place, 'Oregon');
    assert.equal(spots[0].latest, '2026-10-12');
  });
  it('reads a place from an EONET title', () => {
    assert.equal(placeFromTitle('Tropical Storm Beta'), '');
    assert.equal(placeFromTitle('Fire X, Lake County, California'), 'California');
  });
});
