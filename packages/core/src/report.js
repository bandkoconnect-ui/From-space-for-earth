// Exports. A JSON snapshot for tools, and a Markdown field report a person can read, print,
// or hand to someone who needs to check the work.

import { formatDate, formatDateLong, toIsoDate } from './dates.js';
import { formatLatLng } from './geo.js';
import { topicInfo } from './topics.js';
import { slugify } from './text.js';

export function buildSnapshot(investigation, { notes = [], dateIndex = investigation.defaultIndex, layers = {}, now = new Date() } = {}) {
  const stop = investigation.timeline[dateIndex] || investigation.timeline[0];
  return {
    app: 'ECHO · Earth Intelligence for Everyone',
    kind: 'echo-snapshot',
    exportedAt: now.toISOString(),
    investigation: { id: investigation.id, title: investigation.title, topic: investigation.topic, center: investigation.center },
    selectedDate: stop.date,
    layers,
    evidence: investigation.evidence.map((e) => e.url),
    notes: notes.map((n) => ({ text: n.text, createdAt: n.createdAt, lat: n.lat ?? null, lng: n.lng ?? null })),
    limits: 'Imagery is NASA MODIS/VIIRS at about 250 m. ECHO runs no automated analysis. Overlays marked illustrative are not measurements.'
  };
}

export function toMarkdownReport(investigation, { notes = [], now = new Date() } = {}) {
  const topic = topicInfo(investigation.topic);
  const lines = [];
  lines.push(`# ${investigation.title}`);
  lines.push('');
  lines.push(`*${topic.label} · centred on ${formatLatLng(investigation.center[0], investigation.center[1], 3)} · exported ${formatDateLong(toIsoDate(now))}*`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(investigation.summary || 'No summary.');
  lines.push('');
  lines.push('## Timeline');
  lines.push('');
  for (const stop of investigation.timeline) lines.push(`- **${formatDate(stop.date)}**${stop.desc ? ` — ${stop.desc}` : ''}`);
  lines.push('');
  lines.push('## Evidence trail');
  lines.push('');
  for (const e of investigation.evidence) lines.push(`- [${e.title}](${e.url})${e.detail ? ` — ${e.detail}` : ''}`);
  lines.push('');
  lines.push('## Next steps');
  lines.push('');
  investigation.steps.forEach((s, i) => lines.push(`${i + 1}. **${s.title}.** ${s.detail}`));
  lines.push('');
  lines.push('## Field notes');
  lines.push('');
  if (!notes.length) lines.push('_No notes yet._');
  for (const note of [...notes].reverse()) {
    const where = note.lat !== undefined ? ` (${formatLatLng(note.lat, note.lng, 3)})` : '';
    const when = note.dateIndex !== undefined && investigation.timeline[note.dateIndex] ? ` · imagery ${formatDate(investigation.timeline[note.dateIndex].date)}` : '';
    lines.push(`- ${formatDateLong(toIsoDate(note.createdAt))}${where}${when}: ${note.text.replace(/\n+/g, ' ')}`);
  }
  lines.push('');
  lines.push('---');
  lines.push('*Imagery from NASA GIBS (MODIS/VIIRS, about 250 m). ECHO runs no automated analysis; treat visible differences as hypotheses to validate.*');
  lines.push('');
  return lines.join('\n');
}

export function exportFileName(investigation, extension) {
  return `echo-${slugify(investigation.title)}.${extension}`;
}
