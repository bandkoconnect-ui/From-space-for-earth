// Field Report models. Turns a NASA EONET event or an ECHO investigation into the sections the
// report shows. Pure (no DOM), so every claim the report makes can be unit-tested.
//
// The rule throughout: facts come only from the source data, interpretation is labelled as
// general guidance for this kind of event, and anything ECHO has not measured says so.

import { addDays, clampToToday, daysBetween, formatDateLong, relativeDays, todayIso } from '../../../packages/core/src/dates.js';
import { formatLatLng, geometryCenter, haversineKm } from '../../../packages/core/src/geo.js';
import { categoryInfo } from '../../../packages/core/src/eonet.js';
import { topicInfo } from '../../../packages/core/src/topics.js';
import { createFromEvent, normalizeInvestigation, describeInvestigation } from '../../../packages/core/src/investigation.js';
import { pluralise } from '../../../packages/core/src/text.js';
import { liveSources, snapshotSpanKm, sourceName } from './sources.js';

export const LIVE_DAYS = 2; // an event updated within this many days gets the "recently updated" pulse

/** General guidance per EONET category: what such evidence can mean, and what it cannot show. */
const READINGS = {
  wildfires: {
    meaning: 'Repeated position reports usually mean a fire that is still active or still being monitored. Growth in the reported area, where the source gives one, suggests spread. Smoke can hide the ground in true-colour imagery for days.',
    unknown: ['How much has burned (ECHO has not mapped a burn scar)', 'Damage to buildings or people affected', 'Containment, which only the fire agency reports']
  },
  severeStorms: {
    meaning: 'The track shows where forecasting agencies placed the storm centre over time. Wind speed, where reported, is the agency estimate at each position. Rain and damage often extend far from the centre line.',
    unknown: ['Where rain and wind actually caused damage', 'Rainfall totals on the ground', 'The official forecast, which only the national weather service issues']
  },
  volcanoes: {
    meaning: 'An open volcano event means an observatory has reported activity such as eruption, ash or unrest. Plumes and heat can show in daily imagery when skies are clear.',
    unknown: ['The current hazard level, which the local observatory sets', 'Ash dispersion and its effect on flights', 'Ground deformation or gas output']
  },
  floods: {
    meaning: 'A flood event marks where an organisation reported flooding. Daily optical imagery is often blocked by cloud during floods; radar imagery sees through cloud but is not shown in ECHO.',
    unknown: ['The flooded extent (ECHO has not mapped water)', 'People and places affected', 'Whether water is rising or receding']
  },
  landslides: {
    meaning: 'A landslide event marks a reported slope failure. Fresh scars can show in imagery as bare ground, but most are smaller than a 250 m imagery pixel.',
    unknown: ['The size of the slide', 'Whether more slope movement is likely', 'Roads, rivers or homes affected']
  },
  drought: {
    meaning: 'Drought builds over months. Daily imagery can show browning vegetation or shrinking water, but seasonal change looks similar.',
    unknown: ['Soil moisture and rainfall deficit', 'Effects on crops and water supply']
  },
  dustHaze: {
    meaning: 'Dust and haze show as tan or grey veils in true-colour imagery. They move quickly, so the daily image is a snapshot of one moment.',
    unknown: ['Air quality on the ground', 'Where the dust or smoke came from']
  },
  earthquakes: {
    meaning: 'An earthquake event marks the reported epicentre. Satellite imagery rarely shows shaking itself; landslides or damage may appear later in higher-resolution imagery.',
    unknown: ['Shaking intensity and damage', 'Aftershocks']
  },
  seaLakeIce: {
    meaning: 'Ice events track large icebergs or unusual ice. The position is reported by an ice database and drifts over time.',
    unknown: ['Ice thickness', 'Future drift']
  },
  snow: {
    meaning: 'Snow events mark unusual snow cover. In true-colour imagery snow and cloud can look alike.',
    unknown: ['Snow depth', 'Effects on transport and power']
  },
  tempExtremes: {
    meaning: 'A temperature extreme marks an unusual heat or cold episode reported for an area. Imagery does not show air temperature directly.',
    unknown: ['Measured temperatures', 'Health effects']
  },
  waterColor: {
    meaning: 'Water-colour events mark unusual colour in lakes or seas, often algae or sediment. Colour alone cannot tell the two apart.',
    unknown: ['What is causing the colour', 'Whether the water is harmful']
  },
  manmade: {
    meaning: 'A human-made event marks something such as an industrial incident reported to the feed.',
    unknown: ['Cause and scale', 'Effects on people and the environment']
  }
};

const FALLBACK_READING = {
  meaning: 'NASA EONET lists this as an active natural event. Use the sources and imagery to understand what is happening.',
  unknown: ['Impact on people and places', 'What happens next']
};

export function readingFor(categoryId) {
  return READINGS[categoryId] || FALLBACK_READING;
}

/** True when an event was updated recently enough to call it "recently updated". */
export function isRecent(event, now = new Date()) {
  return !event.closed && daysBetween(event.date, todayIso(now)) <= LIVE_DAYS;
}

/** A short factual line for lists: built only from what the feed says. */
export function eventSummary(event, now = new Date()) {
  if (event.description) return event.description;
  const reports = event.geometry.length;
  const latest = event.geometry[reports - 1];
  const magnitude = latest.magnitude ? `${formatNumber(latest.magnitude.value)} ${latest.magnitude.unit}` : '';
  if (reports === 1) return `Reported ${relativeDays(event.firstDate, now)}${magnitude ? `, ${magnitude}` : ''}.`;
  return `${reports} position reports since ${formatDateLong(event.firstDate)}${magnitude ? `; latest ${magnitude}` : ''}.`;
}

/** The place part of an EONET title ("Fire Alpha, Portugal" -> "Portugal"), if it has one. */
export function placeFromTitle(title) {
  const parts = String(title || '').split(',').map((s) => s.trim()).filter(Boolean);
  return parts.length > 1 ? parts[parts.length - 1] : '';
}

export function formatNumber(value) {
  if (!Number.isFinite(value)) return String(value);
  return Math.abs(value) >= 1000 ? Math.round(value).toLocaleString('en-US') : String(Math.round(value * 10) / 10);
}

/** Picks up to `max` items spread evenly, always keeping the first and the last. */
function spread(items, max) {
  if (items.length <= max) return items.slice();
  const step = (items.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => items[Math.round(i * step)]);
}

/**
 * The investigation ECHO works with behind an event's report: the standard one from the shared
 * core, with the imagery timeline set to the event's own dates (a baseline before it began,
 * the reported dates, and the latest report).
 */
export function eventInvestigation(event, { now = new Date() } = {}) {
  const base = createFromEvent(event, { now });
  const reported = [...new Set(event.geometry.map((g) => g.date))];
  const dates = [clampToToday(addDays(event.firstDate, -10), now), ...spread(reported, 10).map((d) => clampToToday(d, now))];
  const unique = [...new Set(dates)].sort();
  const timeline = unique.map((date, i) => ({
    date,
    desc: i === 0 ? 'Baseline: ten days before the first report' : date === event.firstDate ? 'First report' : i === unique.length - 1 ? 'Latest report' : 'Reported position'
  }));
  return normalizeInvestigation({ ...base, id: `event:${event.id}`, timeline, defaultIndex: timeline.length - 1 });
}

/** Field Report model for a NASA EONET event. */
export function eventReport(event, { now = new Date() } = {}) {
  const info = categoryInfo(event.categoryId);
  const reading = readingFor(event.categoryId);
  const topic = topicInfo(info.topic);
  const reports = event.geometry;
  const first = reports[0];
  const latest = reports[reports.length - 1];
  const [lat, lng] = [event.lat, event.lng];
  const investigation = eventInvestigation(event, { now });
  const recent = isRecent(event, now);

  const magnitudes = reports.filter((g) => g.magnitude).map((g) => ({ date: g.date, value: g.magnitude.value, unit: g.magnitude.unit }));
  const unit = magnitudes[magnitudes.length - 1]?.unit;
  const series = magnitudes.filter((m) => m.unit === unit);

  const position = (g) => geometryCenter(g);
  const firstPos = position(first);
  const lastPos = position(latest);
  const travelledKm = reports.length > 1 ? Math.round(haversineKm(firstPos, lastPos)) : 0;

  // Event window: when it began, how it developed, the latest verified update.
  const windowItems = [];
  windowItems.push({ kind: 'context', date: investigation.timeline[0].date, title: 'Before the event', detail: 'Ten days before the first report. Use it as the "before" image.', timelineIndex: 0 });
  const middle = spread(reports.slice(1, -1), 5);
  const entry = (g, kind, title) => {
    const [plat, plng] = position(g);
    const index = investigation.timeline.findIndex((s) => s.date === clampToToday(g.date, now));
    return { kind, date: g.date, title, detail: g.magnitude ? `${formatNumber(g.magnitude.value)} ${g.magnitude.unit}` : (g.type === 'Polygon' ? 'Area reported' : 'Position reported'), lat: plat, lng: plng, timelineIndex: index >= 0 ? index : null };
  };
  windowItems.push(entry(first, 'start', reports.length === 1 ? 'Reported' : 'First reported'));
  middle.forEach((g) => windowItems.push(entry(g, 'update', 'Update')));
  if (reports.length > 1) windowItems.push(entry(latest, 'latest', 'Latest verified update'));
  if (event.closed) windowItems.push({ kind: 'closed', date: event.closed, title: 'Closed by the source', detail: 'NASA EONET marked the event as ended.', timelineIndex: null });
  const hiddenUpdates = Math.max(0, reports.length - 2 - middle.length);

  const imagery = [
    { role: 'Before', date: investigation.timeline[0].date, timelineIndex: 0 },
    ...(first.date !== investigation.timeline[0].date ? [{ role: reports.length === 1 ? 'Reported' : 'First report', date: clampToToday(first.date, now), timelineIndex: investigation.timeline.findIndex((s) => s.date === clampToToday(first.date, now)) }] : []),
    ...(reports.length > 1 ? [{ role: 'Latest', date: clampToToday(latest.date, now), timelineIndex: investigation.timeline.length - 1 }] : [])
  ];

  const sources = event.sources.map((s) => ({ label: sourceName(s.id), detail: 'Report linked by NASA EONET', url: s.url, verified: true }));
  const records = [
    ...(event.link ? [{ label: 'NASA EONET event record', detail: 'The machine-readable entry this report is built from', url: event.link, verified: true }] : []),
    ...topic.evidence.filter((e) => !/EONET/.test(e.badge)).slice(0, 2).map((e) => ({ label: e.title, detail: e.detail, url: e.url, verified: false, reference: true }))
  ];

  const facts = [
    { label: 'Category', value: event.category },
    { label: 'Status', value: event.closed ? `Closed ${formatDateLong(event.closed)}` : 'Open' },
    { label: 'First reported', value: formatDateLong(event.firstDate) },
    { label: 'Last updated', value: `${formatDateLong(event.date)} (${relativeDays(event.date, now)})` },
    { label: 'Position', value: formatLatLng(lat, lng, 3), mono: true },
    ...(series.length ? [{ label: 'Latest size', value: `${formatNumber(series[series.length - 1].value)} ${unit}` }] : [])
  ];

  const observed = [
    `${event.sources.length ? `${pluralise(event.sources.length, 'organisation')} reported this event` : 'NASA EONET lists this event'}; ${pluralise(reports.length, 'position report')} between ${formatDateLong(event.firstDate)} and ${formatDateLong(event.date)}.`,
    ...(travelledKm >= 5 ? [`The reported position moved about ${formatNumber(travelledKm)} km between the first and latest report.`] : []),
    ...(series.length >= 2 ? [`The reported ${unit} went from ${formatNumber(series[0].value)} to ${formatNumber(series[series.length - 1].value)}.`] : []),
    ...(event.description ? [`Source description: “${event.description}”`] : [])
  ];

  const fires = event.categoryId === 'wildfires' || event.categoryId === 'volcanoes';
  const rain = event.categoryId === 'severeStorms' || event.categoryId === 'floods' || event.categoryId === 'landslides';
  const analysis = [
    { id: 'compare', title: 'Compare before and after', detail: `Swipe between NASA imagery from ${formatDateLong(investigation.timeline[0].date)} and any later date.`, available: true, action: 'compare' },
    { id: 'fires', title: 'Thermal anomalies', detail: 'MODIS fire and heat detections for the selected date.', available: true, action: 'layer', layer: 'fires', suggested: fires },
    { id: 'precip', title: 'Rainfall estimate', detail: 'NASA IMERG satellite rain rate for the selected date.', available: true, action: 'layer', layer: 'precip', suggested: rain },
    { id: 'trend', title: `Reported ${unit || 'size'} over time`, detail: series.length >= 2 ? 'From the values in each position report.' : 'The source does not report a size or strength for this event.', available: series.length >= 2, action: 'trend' }
  ].sort((a, b) => Number(Boolean(b.suggested)) - Number(Boolean(a.suggested)));
  const notRun = ['No automated measurement (burned area, flood extent or damage) has been run by ECHO for this event.'];

  const points = spread(reports, 6).map((g, i, all) => {
    const [plat, plng] = position(g);
    return { name: i === all.length - 1 && all.length > 1 ? 'Latest reported position' : i === 0 ? 'First reported position' : `Reported ${formatDateLong(g.date)}`, detail: formatLatLng(plat, plng, 3), lat: plat, lng: plng, date: g.date };
  }).filter((p, i, all) => all.findIndex((q) => q.lat === p.lat && q.lng === p.lng) === i);

  return {
    kind: 'event',
    id: event.id,
    title: event.title,
    category: event.category,
    categoryId: event.categoryId,
    tone: 'event',
    open: !event.closed,
    recent,
    statusLine: event.closed ? `Closed ${formatDateLong(event.closed)}` : `Open · updated ${relativeDays(event.date, now)}`,
    place: placeFromTitle(event.title),
    lat, lng,
    summary: eventSummary(event, now),
    facts,
    window: { items: windowItems, hiddenUpdates, series: series.length >= 2 ? series : [] },
    evidence: { imagery, sources, records, spanKm: snapshotSpanKm(event.categoryId) },
    analysis, notRun,
    interpretation: { observed, meaning: reading.meaning, unknown: reading.unknown },
    points,
    questions: topic.steps,
    live: liveSources({ lat, lng, categoryId: event.categoryId, date: event.date, now }),
    investigation,
    provenance: 'NASA EONET'
  };
}

const KIND_LABEL = { demo: 'Case study', event: 'Saved from an event', custom: 'Your investigation' };

/** Field Report model for an investigation (a case study or one the person saved). */
export function investigationReport(inv, { notes = [], now = new Date() } = {}) {
  const topic = topicInfo(inv.topic);
  const tl = inv.timeline;
  const illustrative = Boolean(inv.overlay?.illustrative);
  const demoWorkflow = inv.id === 'demo-amazon';
  const reading = inv.event ? readingFor(inv.event.categoryId) : null;
  return {
    kind: 'inv',
    id: inv.id,
    title: inv.title,
    category: topic.label,
    categoryId: inv.event?.categoryId || inv.topic,
    tone: inv.kind === 'custom' ? 'mine' : 'case',
    kindLabel: demoWorkflow ? 'Workflow demo' : KIND_LABEL[inv.kind] || 'Investigation',
    open: false,
    recent: false,
    statusLine: `${formatDateLong(tl[0].date)} to ${formatDateLong(tl[tl.length - 1].date)}`,
    place: inv.subtitle || describeInvestigation(inv),
    lat: inv.center[0], lng: inv.center[1],
    summary: inv.summary,
    facts: [
      { label: 'Topic', value: topic.label },
      { label: 'Type', value: demoWorkflow ? 'Workflow demo with an illustrative area' : KIND_LABEL[inv.kind] || 'Investigation' },
      { label: 'Imagery dates', value: `${pluralise(tl.length, 'date')}, ${formatDateLong(tl[0].date)} to ${formatDateLong(tl[tl.length - 1].date)}` },
      { label: 'Centre', value: formatLatLng(inv.center[0], inv.center[1], 3), mono: true },
      { label: 'Area watched', value: `${formatNumber(inv.radiusKm)} km radius` }
    ],
    window: {
      items: tl.map((stop, i) => ({ kind: i === 0 ? 'context' : i === tl.length - 1 ? 'latest' : 'update', date: stop.date, title: stop.desc.split(/ · |: /)[0] || formatDateLong(stop.date), detail: stop.desc.split(/ · |: /).slice(1).join(' · ') || '', timelineIndex: i })),
      hiddenUpdates: 0,
      series: []
    },
    evidence: {
      imagery: spread(tl.map((stop, i) => ({ role: i === 0 ? 'Before' : i === tl.length - 1 ? 'Latest' : formatDateLong(stop.date), date: clampToToday(stop.date, now), timelineIndex: i })), 3),
      sources: inv.evidence.map((e) => ({ label: e.title, detail: e.detail, url: e.url, verified: inv.kind !== 'custom' && !/Copernicus|Earthdata|Worldview|Global Forest|IMERG/.test(e.title), reference: inv.kind === 'custom' || /Copernicus|Earthdata|Worldview|Global Forest|IMERG/.test(e.title) })),
      records: [],
      spanKm: Math.max(60, Math.min(600, inv.radiusKm * 4))
    },
    analysis: [
      { id: 'compare', title: 'Compare before and after', detail: `Swipe between ${formatDateLong(tl[0].date)} and any later date.`, available: tl.length > 1, action: 'compare' },
      { id: 'fires', title: 'Thermal anomalies', detail: 'MODIS fire and heat detections for the selected date.', available: true, action: 'layer', layer: 'fires', suggested: inv.topic === 'fire' || inv.topic === 'volcano' },
      { id: 'precip', title: 'Rainfall estimate', detail: 'NASA IMERG satellite rain rate for the selected date.', available: true, action: 'layer', layer: 'precip', suggested: inv.topic === 'flood' || inv.topic === 'storm' }
    ].sort((a, b) => Number(Boolean(b.suggested)) - Number(Boolean(a.suggested))),
    notRun: [illustrative ? 'The outlined area is drawn by hand for illustration. It is not a measurement.' : 'No automated change detection has been run by ECHO here.'],
    interpretation: {
      observed: [
        `${inv.legend.title}. ${inv.legend.subtitle}.`,
        'Daily NASA imagery is about 250 m per pixel: it shows broad patterns, not individual buildings or narrow channels.'
      ],
      meaning: reading?.meaning || inv.summary,
      unknown: reading?.unknown || ['Cause, exact extent and impact, until independent data confirms them.']
    },
    points: inv.points.map((p) => ({ name: p.name, detail: p.type, lat: p.lat, lng: p.lng })),
    notes,
    questions: inv.steps,
    live: liveSources({ lat: inv.center[0], lng: inv.center[1], categoryId: inv.event?.categoryId || '', date: tl[tl.length - 1].date, now }),
    investigation: inv,
    provenance: inv.kind === 'custom' ? 'Saved on this device' : 'ECHO case study'
  };
}

/**
 * Hotspots: three or more open events of one category close together. Derived only from the
 * feed, so each one is a real cluster of reports, never an invented place.
 */
export function findHotspots(events, { radiusKm = 450, minSize = 3 } = {}) {
  const byCategory = new Map();
  for (const e of events) {
    if (e.closed) continue;
    if (!byCategory.has(e.categoryId)) byCategory.set(e.categoryId, []);
    byCategory.get(e.categoryId).push(e);
  }
  const spots = [];
  for (const [categoryId, list] of byCategory) {
    const left = new Set(list);
    while (left.size) {
      const seed = left.values().next().value;
      left.delete(seed);
      const group = [seed];
      for (let i = 0; i < group.length; i += 1) {
        for (const other of [...left]) {
          if (haversineKm([group[i].lat, group[i].lng], [other.lat, other.lng]) <= radiusKm) { left.delete(other); group.push(other); }
        }
      }
      if (group.length >= minSize) {
        const places = group.map((e) => placeFromTitle(e.title)).filter(Boolean);
        const counts = new Map();
        places.forEach((p) => counts.set(p, (counts.get(p) || 0) + 1));
        const place = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '';
        const latest = group.reduce((a, b) => (a.date >= b.date ? a : b));
        spots.push({
          id: `hot:${categoryId}:${group.map((e) => e.id).sort()[0]}`,
          categoryId,
          label: categoryInfo(categoryId).label,
          count: group.length,
          place,
          ids: group.map((e) => e.id),
          latest: latest.date,
          bounds: [[Math.min(...group.map((e) => e.lat)), Math.min(...group.map((e) => e.lng))], [Math.max(...group.map((e) => e.lat)), Math.max(...group.map((e) => e.lng))]]
        });
      }
    }
  }
  return spots.sort((a, b) => b.count - a.count || b.latest.localeCompare(a.latest));
}
