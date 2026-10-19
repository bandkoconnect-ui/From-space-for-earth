// Small, dependency-free text and id helpers shared by both apps.

export function clampText(value, max) {
  return String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max);
}

/** Returns the URL only when it is plain http(s); otherwise an empty string. */
export function safeUrl(value) {
  try {
    const url = new URL(String(value ?? ''));
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : '';
  } catch {
    return '';
  }
}

let counter = 0;
/** Short unique id: base-36 timestamp + counter + random. Good enough for local records. */
export function uid(prefix = 'id') {
  counter = (counter + 1) % 1296;
  const random = Math.floor(Math.random() * 46656).toString(36).padStart(3, '0');
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36).padStart(2, '0')}${random}`;
}

/** Stable 32-bit hash, used to pick deterministic variations and artwork seeds. */
export function hashString(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function pluralise(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function slugify(text) {
  return String(text).toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_-]+/g, '-').replace(/^-+|-+$/g, '') || 'investigation';
}
