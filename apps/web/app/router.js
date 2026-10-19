// The address bar mirrors what is on screen, so a link (or a reload) brings back the same
// place and report. Hash-based, because GitHub Pages cannot route paths to one page.
//
//   #event=EONET_1234&map=40.30,-8.00,6
//   #inv=demo-nepal
//   #map=20.0,10.0,2.5

const ID = /^[A-Za-z0-9_.:-]{1,64}$/;

/** @returns {{ selection: { kind: 'event'|'inv', id: string } | null, view: { lat, lng, zoom } | null }} */
export function parseHash(hash) {
  const params = new URLSearchParams(String(hash || '').replace(/^#/, ''));
  let selection = null;
  const event = params.get('event');
  const inv = params.get('inv');
  if (event && ID.test(event)) selection = { kind: 'event', id: event };
  else if (inv && ID.test(inv)) selection = { kind: 'inv', id: inv };

  let view = null;
  const map = params.get('map');
  if (map) {
    const [lat, lng, zoom] = map.split(',').map(Number);
    if (Number.isFinite(lat) && Number.isFinite(lng) && Number.isFinite(zoom) && Math.abs(lat) <= 85 && Math.abs(lng) <= 540 && zoom >= 0 && zoom <= 20) {
      view = { lat, lng: ((((lng + 180) % 360) + 360) % 360) - 180, zoom };
    }
  }
  return { selection, view };
}

export function formatHash({ selection = null, view = null } = {}) {
  const parts = [];
  if (selection && ID.test(selection.id)) parts.push(`${selection.kind === 'event' ? 'event' : 'inv'}=${encodeURIComponent(selection.id)}`);
  if (view) parts.push(`map=${view.lat.toFixed(2)},${view.lng.toFixed(2)},${Math.round(view.zoom * 4) / 4}`);
  return parts.length ? `#${parts.join('&')}` : '';
}
