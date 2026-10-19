// Screen-space clustering for event pins. Pure: no DOM, no Leaflet, so it is unit-tested.
//
// Points arrive already projected to screen pixels for the current zoom. Greedy clustering:
// the most important point (newest first) claims every unclaimed point within `radius`
// pixels, then the next unclaimed point does the same. The result is stable for a given
// view, and the newest event in an area is always the one that stays visible.

/**
 * @param {{ id: string, x: number, y: number, rank?: number }[]} points
 * @param {{ radius?: number, keep?: Set<string> }} options  `keep`: ids never clustered (the selected pin)
 * @returns {{ key: string, ids: string[], x: number, y: number, lead: string }[]}
 */
export function clusterPoints(points, { radius = 44, keep = new Set() } = {}) {
  const ordered = points
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
    .slice()
    .sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0) || a.id.localeCompare(b.id));
  const claimed = new Set();
  const groups = [];
  const r2 = radius * radius;

  for (const p of ordered) {
    if (!keep.has(p.id)) continue;
    claimed.add(p.id);
    groups.push({ key: p.id, ids: [p.id], x: p.x, y: p.y, lead: p.id });
  }

  // A uniform grid keeps this fast when there are a few hundred pins.
  const cell = radius;
  const grid = new Map();
  const cellKey = (x, y) => `${Math.floor(x / cell)}:${Math.floor(y / cell)}`;
  for (const p of ordered) {
    if (claimed.has(p.id)) continue;
    const k = cellKey(p.x, p.y);
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(p);
  }

  for (const lead of ordered) {
    if (claimed.has(lead.id)) continue;
    claimed.add(lead.id);
    const members = [lead];
    const cx = Math.floor(lead.x / cell);
    const cy = Math.floor(lead.y / cell);
    for (let gx = cx - 1; gx <= cx + 1; gx += 1) {
      for (let gy = cy - 1; gy <= cy + 1; gy += 1) {
        for (const other of grid.get(`${gx}:${gy}`) || []) {
          if (claimed.has(other.id)) continue;
          const dx = other.x - lead.x;
          const dy = other.y - lead.y;
          if (dx * dx + dy * dy <= r2) { claimed.add(other.id); members.push(other); }
        }
      }
    }
    if (members.length === 1) {
      groups.push({ key: lead.id, ids: [lead.id], x: lead.x, y: lead.y, lead: lead.id });
    } else {
      // Draw the cluster at the members' centre so it sits over the area it stands for.
      const x = members.reduce((s, m) => s + m.x, 0) / members.length;
      const y = members.reduce((s, m) => s + m.y, 0) / members.length;
      const ids = members.map((m) => m.id);
      groups.push({ key: `c:${ids.slice().sort().join('|')}`, ids, x, y, lead: lead.id });
    }
  }
  return groups;
}

/** Clustering radius in pixels for a zoom level: generous for the whole world, tight up close. */
export function clusterRadius(zoom, { coarse = false } = {}) {
  const base = coarse ? 50 : 42;
  if (zoom >= 11) return 14;
  if (zoom >= 8) return Math.round(base * 0.6);
  return base;
}

/**
 * The copy of a longitude nearest to the map's centre, so pins are drawn on the world copy
 * the person is looking at rather than one 360° away.
 */
export function nearestLng(lng, centerLng) {
  return lng + 360 * Math.round((centerLng - lng) / 360);
}
