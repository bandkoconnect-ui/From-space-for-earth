// Date helpers. Everything is calendar-date based and uses UTC, so a timeline stop means
// the same day for every user regardless of their time zone.

export const MS_PER_DAY = 86400000;
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const pad = (n) => String(n).padStart(2, '0');

/**
 * Accepts a Date, an ISO string ("2026-08-12" or a full timestamp) or the legacy display
 * format used by the prototype ("12 AUG 2026"). Returns "YYYY-MM-DD" or null.
 */
export function toIsoDate(input) {
  if (input instanceof Date) {
    return Number.isNaN(input.getTime()) ? null : `${input.getUTCFullYear()}-${pad(input.getUTCMonth() + 1)}-${pad(input.getUTCDate())}`;
  }
  if (typeof input !== 'string') return null;
  const text = input.trim();
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|[T\s])/);
  if (iso) return validParts(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const legacy = text.toUpperCase().match(/^(\d{1,2}) ([A-Z]{3}) (\d{4})$/);
  if (legacy) {
    const month = MONTHS.indexOf(legacy[2]);
    return month < 0 ? null : validParts(Number(legacy[3]), month + 1, Number(legacy[1]));
  }
  return null;
}

function validParts(y, m, d) {
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

export function parseIso(iso) {
  const clean = toIsoDate(iso);
  if (!clean) throw new RangeError(`Invalid date: ${iso}`);
  const [y, m, d] = clean.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function todayIso(now = new Date()) {
  return toIsoDate(now);
}

export function addDays(iso, days) {
  return toIsoDate(new Date(parseIso(iso).getTime() + days * MS_PER_DAY));
}

export function daysBetween(fromIso, toIso) {
  return Math.round((parseIso(toIso).getTime() - parseIso(fromIso).getTime()) / MS_PER_DAY);
}

/** "12 AUG 2026" */
export function formatDate(iso) {
  const date = parseIso(iso);
  return `${pad(date.getUTCDate())} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

/** "12 August 2026" */
export function formatDateLong(iso) {
  const date = parseIso(iso);
  return `${date.getUTCDate()} ${MONTHS_LONG[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

/** "12 AUG" (used for compact timeline labels) */
export function formatDateShort(iso) {
  const date = parseIso(iso);
  return `${pad(date.getUTCDate())} ${MONTHS[date.getUTCMonth()]}`;
}

/** Relative wording for feeds: "today", "3 days ago". */
export function relativeDays(iso, now = new Date()) {
  const days = daysBetween(iso, todayIso(now));
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 60) return `${days} days ago`;
  const months = Math.round(days / 30);
  return months < 24 ? `${months} months ago` : `${Math.round(days / 365)} years ago`;
}

/** Never ask an imagery service for a day in the future. */
export function clampToToday(iso, now = new Date()) {
  const today = todayIso(now);
  return daysBetween(iso, today) < 0 ? today : iso;
}

/**
 * Evenly spaced ISO dates from start to end (inclusive). Duplicate days are collapsed,
 * so a very short window returns fewer than `count` stops instead of repeated dates.
 */
export function buildTimeline(startIso, endIso, count = 4) {
  const total = daysBetween(startIso, endIso);
  if (total <= 0 || count < 2) return [toIsoDate(startIso)];
  const stops = [];
  for (let i = 0; i < count; i += 1) stops.push(addDays(startIso, Math.round((total * i) / (count - 1))));
  return [...new Set(stops)];
}
