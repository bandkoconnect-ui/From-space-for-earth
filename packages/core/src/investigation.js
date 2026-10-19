// The investigation model: creating, deriving from a live event, and normalising stored or
// imported data. Everything that leaves this module is plain JSON.

import { addDays, buildTimeline, clampToToday, formatDateLong, relativeDays, todayIso, toIsoDate } from './dates.js';
import { MAX_LAT, clamp, formatLatLng, geometryCenter, isValidLatLng, zoomForRadiusKm } from './geo.js';
import { worldviewUrl } from './gibs.js';
import { categoryInfo } from './eonet.js';
import { isTopic, topicInfo } from './topics.js';
import { clampText, safeUrl, uid } from './text.js';

export const LIMITS = { title: 80, summary: 900, points: 40, timeline: 12, evidence: 12, steps: 8, geometry: 250 };

export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
  }
}

/** Throws a ValidationError with a message that can be shown to the person as-is. */
export function validateNewInvestigation({ title, lat, lng, radiusKm }) {
  if (!clampText(title, LIMITS.title)) throw new ValidationError('Give your investigation a name.');
  if (!isValidLatLng(Number(lat), Number(lng))) {
    throw new ValidationError(`Enter a latitude between -${MAX_LAT} and ${MAX_LAT} and a longitude between -180 and 180.`);
  }
  if (radiusKm !== undefined && !(Number(radiusKm) >= 0.5 && Number(radiusKm) <= 500)) {
    throw new ValidationError('Choose an area radius between 0.5 and 500 km.');
  }
}

/** A new, user-created investigation around a point. */
export function createInvestigation({ title, topic = 'environment', lat, lng, radiusKm = 25, now = new Date() }) {
  validateNewInvestigation({ title, lat, lng, radiusKm });
  const topicKey = isTopic(topic) ? topic : 'other';
  const info = topicInfo(topicKey);
  const center = [Number(lat), Number(lng)];
  const end = todayIso(now);
  const timeline = buildTimeline(addDays(end, -48), end, 4).map((date, i, all) => ({
    date,
    desc: i === all.length - 1 ? 'Latest imagery · inspect what is visible now' : i === 0 ? 'Earliest window · use as the baseline' : 'Comparison window · look for differences'
  }));
  const stamp = now.toISOString();
  return normalizeInvestigation({
    id: uid('inv'),
    kind: 'custom',
    title,
    topic: topicKey,
    createdAt: stamp,
    updatedAt: stamp,
    center,
    radiusKm: Number(radiusKm),
    timeline,
    defaultIndex: timeline.length - 1,
    points: [{ name: 'Area of interest', lat: center[0], lng: center[1], type: 'Your location' }],
    overlay: { kind: 'circle', tone: 'neutral', illustrative: false },
    evidence: info.evidence,
    steps: info.steps,
    summary: 'A workspace you created. NASA MODIS imagery gives broad context, but no change detection has been run here. Treat what you see as a question to investigate.'
  });
}

function eventTimeline(event, now) {
  const today = todayIso(now);
  const start = event.firstDate;
  const end = clampToToday(event.closed || event.date, now);
  const baseline = addDays(start, -10);
  const stops = buildTimeline(baseline, end > start ? end : addDays(start, 5), 4);
  const last = stops.length - 1;
  return stops.map((date, i) => ({
    date: clampToToday(date, now),
    desc: i === 0 ? 'Baseline · before the event was first recorded' : i === last ? (event.closed ? 'Latest recorded observation' : 'Most recent observation window') : 'During the recorded event'
  })).filter((stop, i, all) => all.findIndex((s) => s.date === stop.date) === i && stop.date <= today);
}

/** An investigation seeded from a normalised EONET event (see eonet.js). */
export function createFromEvent(event, { now = new Date() } = {}) {
  if (!event?.id || !event.geometry?.length) throw new ValidationError('That event has no location to investigate.');
  const info = categoryInfo(event.categoryId);
  const topicKey = isTopic(info.topic) ? info.topic : 'other';
  const topic = topicInfo(topicKey);
  const timeline = eventTimeline(event, now);
  const stamp = now.toISOString();
  const samples = sampleGeometry(event.geometry, 12);
  const evidence = [
    ...event.sources.slice(0, 3).map((s) => ({ badge: clampText(s.id, 6).toUpperCase() || 'SRC', title: `Source: ${s.id || 'event report'}`, detail: 'Original report linked from NASA EONET', url: s.url })),
    { badge: 'NASA', title: 'Open in NASA Worldview', detail: `View ${formatDateLong(event.date)} on the full viewer`, url: worldviewUrl(event.lat, event.lng, event.date) },
    ...(event.link ? [{ badge: 'EONET', title: 'NASA EONET event record', detail: 'The machine-readable event entry', url: event.link }] : []),
    ...topic.evidence.slice(0, 2)
  ];
  return normalizeInvestigation({
    id: uid('evt'),
    kind: 'event',
    title: event.title,
    topic: topicKey,
    createdAt: stamp,
    updatedAt: stamp,
    center: [event.lat, event.lng],
    radiusKm: 40,
    timeline,
    defaultIndex: timeline.length - 1,
    points: samples.map((g, i) => ({ name: i === samples.length - 1 ? 'Latest recorded position' : `Recorded position ${i + 1}`, lat: g.center[0], lng: g.center[1], type: `Reported ${formatDateLong(g.date)}` })),
    overlay: null,
    event: { id: event.id, title: event.title, category: event.category, categoryId: event.categoryId, closed: event.closed, geometry: event.geometry.slice(-LIMITS.geometry) },
    evidence,
    steps: topic.steps,
    summary: `${event.category} reported to NASA EONET. First recorded ${formatDateLong(event.firstDate)}${event.closed ? `, closed ${formatDateLong(event.closed)}` : `, last updated ${relativeDays(event.date, now)}`}. ${event.description ? event.description + ' ' : ''}ECHO shows the recorded positions and NASA imagery for each date. It does not measure the event.`.slice(0, LIMITS.summary)
  });
}

function sampleGeometry(geometry, max) {
  const withCenter = geometry.map((g) => ({ date: g.date, center: geometryCenter(g) })).filter((g) => g.center);
  if (withCenter.length <= max) return withCenter;
  const step = (withCenter.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => withCenter[Math.round(i * step)]);
}

/**
 * Accepts anything that claims to be an investigation (older saved data, an imported file)
 * and returns a clean, bounded copy. Unknown fields are dropped. Throws ValidationError
 * when the essentials (title, a valid location, one dated stop) are missing.
 */
export function normalizeInvestigation(raw) {
  if (!raw || typeof raw !== 'object') throw new ValidationError('Not an investigation.');
  const title = clampText(raw.title, LIMITS.title);
  if (!title) throw new ValidationError('An investigation needs a title.');
  const center = Array.isArray(raw.center) ? [Number(raw.center[0]), Number(raw.center[1])] : [NaN, NaN];
  if (!isValidLatLng(center[0], center[1])) throw new ValidationError(`"${title}" has an invalid location.`);

  const topic = isTopic(raw.topic) ? raw.topic : 'other';
  const info = topicInfo(topic);
  const radiusKm = clamp(Number(raw.radiusKm) || 25, 0.5, 500);
  const timeline = (Array.isArray(raw.timeline) ? raw.timeline : [])
    .map((stop) => ({ date: toIsoDate(stop?.date), desc: clampText(stop?.desc, 200) }))
    .filter((stop) => stop.date)
    .slice(0, LIMITS.timeline);
  if (!timeline.length) throw new ValidationError(`"${title}" has no dated timeline.`);

  const kind = raw.kind === 'demo' || raw.kind === 'event' ? raw.kind : 'custom';
  const stamp = toIsoDate(raw.createdAt) ? new Date(raw.createdAt).toISOString() : new Date().toISOString();
  return {
    id: clampText(raw.id, 64) || uid('inv'),
    kind,
    title,
    topic,
    createdAt: stamp,
    updatedAt: toIsoDate(raw.updatedAt) ? new Date(raw.updatedAt).toISOString() : stamp,
    center,
    radiusKm,
    zoom: clamp(Math.round(Number(raw.zoom) || zoomForRadiusKm(radiusKm)), 2, 18),
    headline: normalizeHeadline(raw.headline, info.headline),
    legend: {
      title: clampText(raw.legend?.title, 60) || info.legend.title,
      subtitle: clampText(raw.legend?.subtitle, 120) || info.legend.subtitle
    },
    callout: clampText(raw.callout, 80) || info.callout,
    subtitle: clampText(raw.subtitle, 120),
    timeline,
    defaultIndex: clamp(Math.round(Number(raw.defaultIndex) || 0), 0, timeline.length - 1),
    points: (Array.isArray(raw.points) ? raw.points : [])
      .map((p) => ({ name: clampText(p?.name, 60), lat: Number(p?.lat), lng: Number(p?.lng), type: clampText(p?.type, 80) }))
      .filter((p) => p.name && isValidLatLng(p.lat, p.lng))
      .slice(0, LIMITS.points),
    overlay: normalizeOverlay(raw.overlay),
    event: normalizeEvent(raw.event),
    evidence: (Array.isArray(raw.evidence) ? raw.evidence : [])
      .map((e) => ({ badge: clampText(e?.badge, 6), title: clampText(e?.title, 80), detail: clampText(e?.detail, 120), url: safeUrl(e?.url) }))
      .filter((e) => e.title && e.url)
      .slice(0, LIMITS.evidence),
    steps: (Array.isArray(raw.steps) ? raw.steps : [])
      .map((s) => ({ title: clampText(s?.title, 80), detail: clampText(s?.detail, 160) }))
      .filter((s) => s.title)
      .slice(0, LIMITS.steps),
    summary: clampText(raw.summary, LIMITS.summary)
  };
}

function normalizeHeadline(value, fallback) {
  if (Array.isArray(value) && value.length) return value.slice(0, 2).map((line) => clampText(line, 40));
  return fallback;
}

const TONES = ['neutral', 'water', 'forest', 'fire'];

function normalizeOverlay(overlay) {
  if (!overlay || typeof overlay !== 'object') return null;
  const tone = TONES.includes(overlay.tone) ? overlay.tone : 'neutral';
  const illustrative = overlay.illustrative !== false;
  if (overlay.kind === 'circle') return { kind: 'circle', tone, illustrative: overlay.illustrative === true };
  if (overlay.kind === 'polygon' && Array.isArray(overlay.coords)) {
    const coords = overlay.coords.map((c) => [Number(c?.[0]), Number(c?.[1])]).filter((c) => isValidLatLng(c[0], c[1])).slice(0, 200);
    return coords.length >= 3 ? { kind: 'polygon', tone, illustrative, coords, label: clampText(overlay.label, 100) } : null;
  }
  return null;
}

function normalizeEvent(event) {
  if (!event || typeof event !== 'object' || !event.id) return null;
  const geometry = (Array.isArray(event.geometry) ? event.geometry : [])
    .map((g) => ({ date: toIsoDate(g?.date), type: g?.type, coordinates: g?.coordinates, magnitude: g?.magnitude || null }))
    .filter((g) => g.date && geometryCenter(g))
    .slice(-LIMITS.geometry);
  if (!geometry.length) return null;
  return {
    id: clampText(event.id, 64),
    title: clampText(event.title, 160),
    category: clampText(event.category, 60),
    categoryId: clampText(event.categoryId, 40),
    closed: toIsoDate(event.closed),
    geometry
  };
}

/** Display subtitle, e.g. "27.717°, 85.324° · Water and floods". */
export function describeInvestigation(inv) {
  if (inv.subtitle) return inv.subtitle;
  if (inv.event) return `${inv.event.category} · ${formatDateLong(inv.timeline[inv.timeline.length - 1].date)}`;
  return `${formatLatLng(inv.center[0], inv.center[1], 2)} · ${topicInfo(inv.topic).label}`;
}
