// Generated "terrain" artwork. Every investigation gets its own contour-line picture,
// drawn from its id, so the apps need no stock photos, no hotlinked images and no network.

import { hashString } from '../core/src/text.js';

const TONES = {
  water: { from: '#173a4a', to: '#0c2230', line: '#79d4f1' },
  forest: { from: '#1c4034', to: '#0e241f', line: '#9fe2b0' },
  fire: { from: '#4a2a1b', to: '#241410', line: '#ffb27a' },
  urban: { from: '#2b3342', to: '#141a24', line: '#aab9d6' },
  storm: { from: '#2f2c52', to: '#16152d', line: '#b7aaff' },
  volcano: { from: '#4a2323', to: '#231112', line: '#ff9b8f' },
  neutral: { from: '#1f3c3f', to: '#0e2127', line: '#9af3c6' }
};

const TOPIC_TONE = { flood: 'water', forest: 'forest', fire: 'fire', urban: 'urban', storm: 'storm', volcano: 'volcano', environment: 'neutral', other: 'neutral' };

function random(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Returns an SVG element (as markup-free DOM) with contour lines unique to `seed`. */
export function terrainArt(seed, topic = 'other', { width = 320, height = 160 } = {}) {
  const ns = 'http://www.w3.org/2000/svg';
  const tone = TONES[TOPIC_TONE[topic] || 'neutral'];
  const rand = random(hashString(String(seed)));
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid slice');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'terrain-art');

  const id = `g${hashString(`${seed}${topic}`).toString(36)}`;
  const defs = document.createElementNS(ns, 'defs');
  const gradient = document.createElementNS(ns, 'linearGradient');
  gradient.setAttribute('id', id);
  gradient.setAttribute('x1', '0'); gradient.setAttribute('y1', '0'); gradient.setAttribute('x2', '1'); gradient.setAttribute('y2', '1');
  for (const [offset, color] of [[0, tone.from], [1, tone.to]]) {
    const stop = document.createElementNS(ns, 'stop');
    stop.setAttribute('offset', String(offset));
    stop.setAttribute('stop-color', color);
    gradient.append(stop);
  }
  defs.append(gradient);
  const bg = document.createElementNS(ns, 'rect');
  bg.setAttribute('width', String(width)); bg.setAttribute('height', String(height)); bg.setAttribute('fill', `url(#${id})`);
  svg.append(defs, bg);

  // Two or three "hills": nested wobbly rings around a random centre.
  const hills = 2 + Math.floor(rand() * 2);
  for (let h = 0; h < hills; h += 1) {
    const cx = width * (0.15 + rand() * 0.7);
    const cy = height * (0.2 + rand() * 0.6);
    const base = 18 + rand() * 26;
    const rings = 5 + Math.floor(rand() * 4);
    const phase = rand() * Math.PI * 2;
    const squash = 0.55 + rand() * 0.4;
    for (let r = 1; r <= rings; r += 1) {
      const radius = base * r * 0.9;
      const points = [];
      for (let step = 0; step <= 36; step += 1) {
        const angle = (step / 36) * Math.PI * 2;
        const wobble = 1 + 0.12 * Math.sin(angle * 3 + phase + r * 0.4) + 0.07 * Math.sin(angle * 5 - phase);
        points.push(`${(cx + Math.cos(angle) * radius * wobble).toFixed(1)},${(cy + Math.sin(angle) * radius * wobble * squash).toFixed(1)}`);
      }
      const path = document.createElementNS(ns, 'polyline');
      path.setAttribute('points', points.join(' '));
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', tone.line);
      path.setAttribute('stroke-opacity', String(Math.max(0.08, 0.5 - r * 0.045)));
      path.setAttribute('stroke-width', r % 4 === 0 ? '1.3' : '0.8');
      svg.append(path);
    }
  }
  return svg;
}

export function toneForTopic(topic) {
  return TOPIC_TONE[topic] || 'neutral';
}
