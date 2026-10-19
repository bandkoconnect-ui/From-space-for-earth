// Atlas: the web app's map. Builds on the shared EchoMap (base imagery, NASA imagery by date,
// before/after swipe, investigation drawings, notes) and adds what the living-planet view needs:
// red event pins with clustering, the selected event's track, the searched place, a day/night
// shading, and camera moves that keep the subject clear of the floating panels.

import { EchoMap } from '../../../packages/map/echo-map.js';
import { geometryCenter, lonLatRingToLatLng } from '../../../packages/core/src/geo.js';
import { formatDateLong } from '../../../packages/core/src/dates.js';
import { h } from '../../../packages/ui/dom.js';
import { clusterPoints, clusterRadius, nearestLng } from './cluster.js';
import { nightPolygon } from './terminator.js';
import { isRecent } from './subjects.js';

const TRACK_STYLE = { color: '#ffffff', weight: 1.6, opacity: 0.7, dashArray: '3 6', interactive: false };

/** Leaflet makes markers focusable but not keyboard-operable; Enter and Space activate them here. */
function keyboardActivate(marker) {
  const el = marker.getElement();
  if (!el) return;
  el.onkeydown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); marker.fire('click'); }
  };
}

export class Atlas {
  /**
   * @param {HTMLElement} element
   * @param {{ imagery?: string, insets?: () => {top:number,right:number,bottom:number,left:number}, coarse?: boolean, now?: () => Date }} options
   */
  constructor(element, { imagery = 'terra', insets = () => ({ top: 0, right: 0, bottom: 0, left: 0 }), coarse = false, now = () => new Date() } = {}) {
    this.element = element;
    this.getInsets = insets;
    this.coarse = coarse;
    this.hit = coarse ? 40 : 30; // touch target size of a pin, in pixels
    this.now = now;
    this.listeners = new Map();
    this.reducedMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

    const world = this.worldView({ useInsets: false }); // panels are not laid out yet; main.js re-frames once they are
    this.echo = new EchoMap(element, {
      imagery, now, minZoom: 1, zoomSnap: 0.25, zoomDelta: 0.5,
      layers: { nasa: false, overlay: true, points: true, notes: true },
      view: { center: [world.lat, world.lng], zoom: world.zoom }
    });
    const L = (this.L = window.L);
    const map = (this.map = this.echo.map);
    // Keep the planet on screen vertically. (Leaflet's own maxBounds animates its corrections,
    // and those animations can override the app's camera moves, so this clamp never animates.)
    map.on('moveend', () => this.clampVertical());
    map.options.wheelPxPerZoomLevel = 90;
    map.options.zoomAnimation = !this.reducedMotion;
    map.options.fadeAnimation = !this.reducedMotion;

    this.echo.pane('nightPane', 240, true);
    this.echo.pane('trackPane', 420, true);
    this.nightLayer = L.layerGroup().addTo(map);
    this.trackLayer = L.layerGroup().addTo(map);
    this.placeLayer = L.layerGroup().addTo(map);
    this.eventLayer = L.layerGroup().addTo(map);
    this.invLayer = L.layerGroup().addTo(map);

    this.events = [];
    this.investigations = [];
    this.visibleIds = null; // null = all events; otherwise a Set of ids that pass the filters
    this.highlight = new Set();
    this.selected = null; // { kind, id }
    this.markers = new Map(); // key -> L.marker for event pins and clusters
    this.invMarkers = new Map();
    this.night = true;

    let frame = 0;
    this.scheduleRender = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => this.render()); };
    map.on('zoomend moveend resize viewreset', this.scheduleRender);
    map.on('zoomend', () => this.updateNightOpacity());
    map.on('click', (e) => this.emit('mapclick', { lat: e.latlng.lat, lng: e.latlng.lng }));
    map.on('moveend', () => { const c = map.getCenter(); this.emit('moveend', { lat: c.lat, lng: ((((c.lng + 180) % 360) + 360) % 360) - 180, zoom: map.getZoom() }); });
    map.on('contextmenu', (e) => this.emit('contextmenu', { lat: e.latlng.lat, lng: ((((e.latlng.lng + 180) % 360) + 360) % 360) - 180 }));

    this.drawNight();
    this.nightTimer = setInterval(() => this.drawNight(), 5 * 60 * 1000);
  }

  on(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(fn);
    return () => this.listeners.get(type)?.delete(fn);
  }

  emit(type, detail) { this.listeners.get(type)?.forEach((fn) => fn(detail)); }

  /* ---------------- camera ---------------- */

  /** The opening view: the whole planet, centred on the person's own part of the world. */
  worldView({ useInsets = true } = {}) {
    // Fit the whole planet into the part of the map that panels do not cover.
    const ins = useInsets ? this.getInsets() : { top: 0, right: 0, bottom: 0, left: 0 };
    const w = (this.element.clientWidth || window.innerWidth) - ins.left - ins.right;
    const hgt = (this.element.clientHeight || window.innerHeight) - ins.top - ins.bottom;
    const zoom = Math.max(1, Math.min(3, Math.floor(Math.log2(Math.max(w, hgt * 0.9) / 256) * 4) / 4));
    // A guess from the time zone, not the person's location: no permission needed and nothing leaves the device.
    const offset = -new Date(new Date().getFullYear(), 0, 1).getTimezoneOffset();
    const lng = Math.max(-150, Math.min(150, offset / 4));
    return { lat: 22, lng, zoom };
  }

  goWorld({ animate = true } = {}) {
    const v = this.worldView();
    this.flyTo([v.lat, v.lng], v.zoom, { animate, keepInsets: true });
  }

  /** Stops the view drifting past the poles into empty space. */
  clampVertical() {
    if (this.clamping || !this.hasSize()) return;
    const map = this.map;
    const z = map.getZoom();
    const ins = this.getInsets();
    const size = map.getSize();
    const top = map.project([85, 0], z).y;
    const bottom = map.project([-85, 0], z).y;
    const c = map.project(map.getCenter(), z);
    const viewTop = c.y - size.y / 2 + ins.top;
    const viewBottom = c.y + size.y / 2 - ins.bottom;
    let dy = 0;
    if (bottom - top <= viewBottom - viewTop) dy = (top + bottom) / 2 - (viewTop + viewBottom) / 2;
    else if (viewTop < top) dy = top - viewTop;
    else if (viewBottom > bottom) dy = bottom - viewBottom;
    if (Math.abs(dy) > 1) {
      this.clamping = true;
      map.panBy([0, Math.round(dy)], { animate: false });
      this.clamping = false;
    }
  }

  /** Centre of the part of the map that is not covered by panels, for a target zoom. */
  centerFor(latlng, zoom) {
    const ins = this.getInsets();
    const dx = (ins.left - ins.right) / 2;
    const dy = (ins.top - ins.bottom) / 2;
    const p = this.map.project(latlng, zoom).subtract([dx, dy]);
    return this.map.unproject(p, zoom);
  }

  flyTo(latlng, zoom, { animate = true, keepInsets = true } = {}) {
    const map = this.map;
    map.stop(); // a pan still animating would otherwise finish on top of this move
    const target = keepInsets ? this.centerFor(latlng, zoom) : this.L.latLng(latlng);
    if (!this.hasSize() || !animate || this.reducedMotion) { map.setView(target, zoom, { animate: false }); return; }
    const from = map.getCenter();
    const far = Math.abs(from.lng - target.lng) > 40 || Math.abs(from.lat - target.lat) > 25 || Math.abs(map.getZoom() - zoom) > 3;
    map.flyTo(target, zoom, { duration: far ? 1.5 : 0.8, easeLinearity: 0.2 });
  }

  fitBounds(bounds, { maxZoom = 9, animate = true } = {}) {
    const ins = this.getInsets();
    const pad = 48;
    const options = { paddingTopLeft: [ins.left + pad, ins.top + pad], paddingBottomRight: [ins.right + pad, ins.bottom + pad], maxZoom };
    this.map.stop();
    if (!this.hasSize() || !animate || this.reducedMotion) this.map.fitBounds(bounds, { ...options, animate: false });
    else this.map.flyToBounds(bounds, { ...options, duration: 1.1 });
  }

  /** Brings a point into the clear area without changing zoom, if it is hidden or near an edge. */
  reveal(lat, lng) {
    const map = this.map;
    const p = map.latLngToContainerPoint([lat, nearestLng(lng, map.getCenter().lng)]);
    const size = map.getSize();
    const ins = this.getInsets();
    const margin = 40;
    if (p.x < ins.left + margin || p.x > size.x - ins.right - margin || p.y < ins.top + margin || p.y > size.y - ins.bottom - margin) {
      this.flyTo([lat, nearestLng(lng, map.getCenter().lng)], map.getZoom());
    }
  }

  hasSize() { return this.element.clientWidth > 0 && this.element.clientHeight > 0; }
  zoomIn() { this.map.zoomIn(); }
  zoomOut() { this.map.zoomOut(); }
  getZoom() { return this.map.getZoom(); }
  getCenter() { const c = this.map.getCenter(); return { lat: c.lat, lng: ((((c.lng + 180) % 360) + 360) % 360) - 180 }; }
  /** The geographic point under the centre of the clear (unobstructed) area. */
  clearCenter() {
    const ins = this.getInsets();
    const size = this.map.getSize();
    const ll = this.map.containerPointToLatLng([ins.left + (size.x - ins.left - ins.right) / 2, ins.top + (size.y - ins.top - ins.bottom) / 2]);
    return { lat: ll.lat, lng: ((((ll.lng + 180) % 360) + 360) % 360) - 180 };
  }
  invalidateSize() { this.echo.invalidateSize(); this.scheduleRender(); }

  /* ---------------- data ---------------- */

  setEvents(events) {
    this.events = events;
    this.byId = new Map(events.map((e) => [e.id, e]));
    this.render();
  }

  setInvestigations(list) {
    this.investigations = list;
    this.renderInvestigations();
  }

  /** Which events pass the sidebar filters (null shows all). */
  setVisible(ids) { this.visibleIds = ids ? new Set(ids) : null; this.render(); }

  /** Events to emphasise, e.g. the ones inside a searched area. */
  setHighlight(ids) { this.highlight = new Set(ids || []); this.render(); }

  select(selection) {
    this.selected = selection;
    this.element.classList.toggle('has-selection', Boolean(selection));
    this.render();
    this.renderInvestigations();
  }

  /* ---------------- event pins ---------------- */

  render() {
    if (!this.hasSize()) return;
    const map = this.map;
    const L = this.L;
    const size = map.getSize();
    const centerLng = map.getCenter().lng;
    const zoom = map.getZoom();
    const margin = 80;
    const selectedId = this.selected?.kind === 'event' ? this.selected.id : null;
    const now = this.now();

    const points = [];
    this.events.forEach((event, rank) => {
      if (this.visibleIds && !this.visibleIds.has(event.id) && event.id !== selectedId) return;
      const lng = nearestLng(event.lng, centerLng);
      const p = map.latLngToContainerPoint([event.lat, lng]);
      if (p.x < -margin || p.y < -margin || p.x > size.x + margin || p.y > size.y + margin) return;
      points.push({ id: event.id, x: p.x, y: p.y, rank, lng });
    });
    const pos = new Map(points.map((p) => [p.id, p]));
    const groups = clusterPoints(points, { radius: clusterRadius(zoom, { coarse: this.coarse }), keep: new Set(selectedId ? [selectedId] : []) });

    const seen = new Set();
    for (const group of groups) {
      const single = group.ids.length === 1;
      const key = single ? `e:${group.ids[0]}` : group.key;
      seen.add(key);
      const latlng = single ? [this.byId.get(group.ids[0]).lat, pos.get(group.ids[0]).lng] : map.containerPointToLatLng([group.x, group.y]);
      let marker = this.markers.get(key);
      if (!marker) {
        marker = single ? this.makePin(this.byId.get(group.ids[0])) : this.makeCluster(group);
        marker.setLatLng(latlng).addTo(this.eventLayer);
        this.markers.set(key, marker);
      } else {
        marker.setLatLng(latlng);
      }
      marker.ids = group.ids;
      this.stylePin(marker, group, now);
    }
    for (const [key, marker] of this.markers) {
      if (!seen.has(key)) { this.eventLayer.removeLayer(marker); this.markers.delete(key); }
    }
  }

  makePin(event) {
    const L = this.L;
    const dot = h('span', { class: 'flare' }, h('span', { class: 'flare-core' }));
    const marker = L.marker([event.lat, event.lng], {
      icon: L.divIcon({ className: 'pin', html: dot, iconSize: [this.hit, this.hit], iconAnchor: [this.hit / 2, this.hit / 2] }),
      keyboard: true,
      riseOnHover: true
    });
    marker.on('add', () => {
      const el = marker.getElement();
      if (!el) return;
      el.setAttribute('role', 'button');
      el.setAttribute('aria-label', `${event.title}. ${event.category}, updated ${formatDateLong(event.date)}`);
      el.dataset.id = event.id;
      keyboardActivate(marker);
    });
    if (!this.coarse) marker.bindTooltip(event.title, { direction: 'top', offset: [0, -10], className: 'pin-tip', opacity: 1 });
    marker.on('click', () => this.emit('select', { kind: 'event', id: event.id, source: 'map' }));
    return marker;
  }

  makeCluster(group) {
    const L = this.L;
    const count = h('span', { class: 'cluster-count' });
    const marker = L.marker([0, 0], {
      icon: L.divIcon({ className: 'pin pin-cluster', html: h('span', { class: 'cluster' }, count), iconSize: [this.hit + 12, this.hit + 12], iconAnchor: [(this.hit + 12) / 2, (this.hit + 12) / 2] }),
      keyboard: true,
      riseOnHover: true
    });
    marker.countEl = count;
    marker.on('add', () => { marker.getElement()?.setAttribute('role', 'button'); keyboardActivate(marker); });
    marker.on('click', () => this.openCluster(marker.ids));
    return marker;
  }

  stylePin(marker, group, now) {
    const el = marker.getElement();
    if (!el) return;
    const ids = group.ids;
    const selectedId = this.selected?.kind === 'event' ? this.selected.id : null;
    if (ids.length === 1) {
      const event = this.byId.get(ids[0]);
      el.classList.toggle('is-selected', ids[0] === selectedId);
      el.classList.toggle('is-recent', isRecent(event, now) && !this.reducedMotion);
      el.classList.toggle('is-highlight', this.highlight.has(ids[0]));
      marker.setZIndexOffset(ids[0] === selectedId ? 1000 : 0);
    } else {
      const n = ids.length;
      marker.countEl.textContent = String(n);
      el.classList.toggle('is-highlight', ids.some((id) => this.highlight.has(id)));
      el.classList.toggle('is-large', n >= 10);
      el.classList.toggle('is-recent', ids.some((id) => isRecent(this.byId.get(id), now)) && !this.reducedMotion);
      el.setAttribute('aria-label', `${n} events here. Select to zoom in.`);
    }
  }

  /** A cluster click zooms in to split it; at street level it offers a list instead. */
  openCluster(ids) {
    const events = ids.map((id) => this.byId.get(id)).filter(Boolean);
    const lats = events.map((e) => e.lat);
    const centerLng = this.map.getCenter().lng;
    const lngs = events.map((e) => nearestLng(e.lng, centerLng));
    const span = Math.max(Math.max(...lats) - Math.min(...lats), Math.max(...lngs) - Math.min(...lngs));
    if (span < 0.02 || this.map.getZoom() >= 13) { this.emit('choose', { ids }); return; }
    const bounds = [[Math.min(...lats), Math.min(...lngs)], [Math.max(...lats), Math.max(...lngs)]];
    this.fitBounds(bounds, { maxZoom: Math.min(14, Math.max(this.map.getZoom() + 2, 5)) });
  }

  pinElement(id) { return this.markers.get(`e:${id}`)?.getElement() || null; }

  /* ---------------- investigation pins (case studies, the person's own) ---------------- */

  renderInvestigations() {
    const L = this.L;
    const seen = new Set();
    for (const inv of this.investigations) {
      if (inv.kind === 'event') continue; // saved events already have a red pin while they are open
      seen.add(inv.id);
      let marker = this.invMarkers.get(inv.id);
      if (!marker) {
        marker = L.marker(inv.center, {
          icon: L.divIcon({ className: 'pin pin-inv', html: h('span', { class: 'ring' }), iconSize: [this.hit, this.hit], iconAnchor: [this.hit / 2, this.hit / 2] }),
          keyboard: true
        });
        marker.on('add', () => { const el = marker.getElement(); if (el) { el.setAttribute('role', 'button'); el.setAttribute('aria-label', `${inv.title}. ${inv.kind === 'custom' ? 'Your investigation' : 'Case study'}`); el.dataset.id = inv.id; keyboardActivate(marker); } });
        if (!this.coarse) marker.bindTooltip(inv.title, { direction: 'top', offset: [0, -10], className: 'pin-tip', opacity: 1 });
        marker.on('click', () => this.emit('select', { kind: 'inv', id: inv.id, source: 'map' }));
        marker.addTo(this.invLayer);
        this.invMarkers.set(inv.id, marker);
      } else {
        marker.setLatLng(inv.center);
      }
      const el = marker.getElement();
      el?.classList.toggle('is-selected', this.selected?.kind === 'inv' && this.selected.id === inv.id);
      el?.classList.toggle('is-mine', inv.kind === 'custom');
    }
    for (const [id, marker] of this.invMarkers) if (!seen.has(id)) { this.invLayer.removeLayer(marker); this.invMarkers.delete(id); }
  }

  /* ---------------- the selected subject ---------------- */

  /** Shows an investigation's drawings (and its imagery timeline) without moving the camera. */
  showInvestigation(investigation, { notes = [], dateIndex, isEvent = false } = {}) {
    this.echo.setLayer('points', !isEvent);
    this.echo.setLayer('overlay', !isEvent);
    this.echo.setInvestigation(investigation, { notes, dateIndex: dateIndex ?? investigation.defaultIndex, fly: false });
  }

  clearInvestigation() {
    this.echo.setLayer('compare', false);
    this.echo.setLayer('nasa', false);
    this.echo.clearInvestigation();
    this.clearTrack();
  }

  /** The reported positions of an event: a dashed path and small dots, on the copy in view. */
  showTrack(event) {
    this.clearTrack();
    const L = this.L;
    const ref = nearestLng(event.lng, this.map.getCenter().lng) - event.lng;
    const pts = event.geometry.map((g) => geometryCenter(g)).filter(Boolean).map(([lat, lng]) => [lat, lng + ref]);
    if (pts.length > 1) L.polyline(pts, { ...TRACK_STYLE, pane: 'trackPane' }).addTo(this.trackLayer);
    pts.slice(0, -1).forEach((p) => L.circleMarker(p, { radius: 2.5, color: '#fff', weight: 0, fillColor: '#fff', fillOpacity: 0.85, interactive: false, pane: 'trackPane' }).addTo(this.trackLayer));
    const last = event.geometry[event.geometry.length - 1];
    if (last.type === 'Polygon') {
      const ring = lonLatRingToLatLng(last.coordinates[0]).map(([lat, lng]) => [lat, lng + ref]);
      L.polygon(ring, { color: '#fff', weight: 1.2, opacity: 0.8, fillColor: '#ff453a', fillOpacity: 0.12, interactive: false, pane: 'trackPane' }).addTo(this.trackLayer);
    }
  }

  trackBounds(event) {
    const pts = event.geometry.map((g) => geometryCenter(g)).filter(Boolean);
    if (pts.length < 2) return null;
    const ref = nearestLng(event.lng, this.map.getCenter().lng) - event.lng;
    const lats = pts.map((p) => p[0]);
    const lngs = pts.map((p) => p[1] + ref);
    const span = Math.max(Math.max(...lats) - Math.min(...lats), Math.max(...lngs) - Math.min(...lngs));
    return span > 0.3 ? [[Math.min(...lats), Math.min(...lngs)], [Math.max(...lats), Math.max(...lngs)]] : null;
  }

  clearTrack() { this.trackLayer.clearLayers(); }

  /** A searched place: a white marker, plus its outline when the search returned one. */
  showPlace(place) {
    this.clearPlace();
    const L = this.L;
    const lng = nearestLng(place.lng, this.map.getCenter().lng);
    if (place.bounds && (place.type === 'country' || place.type === 'region')) {
      L.rectangle(place.bounds, { color: '#ffffff', weight: 1, opacity: 0.45, dashArray: '2 5', fill: false, interactive: false }).addTo(this.placeLayer);
    }
    const marker = L.marker([place.lat, lng], { icon: L.divIcon({ className: 'pin pin-place', html: h('span', { class: 'place-dot' }), iconSize: [24, 24], iconAnchor: [12, 12] }), interactive: false, keyboard: false });
    marker.addTo(this.placeLayer);
  }

  clearPlace() { this.placeLayer.clearLayers(); }

  /* ---------------- imagery ---------------- */

  setImageryDate(index) { return this.echo.setDateIndex(index); }
  setNasa(on) { this.echo.setLayer('nasa', on); }
  setCompare(on) { this.echo.setLayer('compare', on); }
  setSplit(percent) { this.echo.setSplit(percent); }
  setDataLayer(name, on) {
    // Data overlays follow the selected date; re-adding refreshes them when the date changes.
    if (on && this.echo.dataLayers.has(name)) this.echo.setLayer(name, false);
    this.echo.setLayer(name, on);
  }
  setLabels(on) { this.echo.setLayer('labels', on); }
  setImagery(id) { this.echo.setImagery(id); }
  drawNotes(notes) { this.echo.drawNotes(notes); }
  setDraftPin(point) { this.echo.setDraftPin(point); }
  setUserLocation(point) { this.echo.setUserLocation(point); }
  on2(type, fn) { return this.echo.on(type, fn); }

  /* ---------------- day and night ---------------- */

  setNight(on) {
    this.night = on;
    if (on) this.drawNight();
    else this.nightLayer.clearLayers();
  }

  drawNight() {
    if (!this.night) return;
    this.nightLayer.clearLayers();
    const ring = nightPolygon(this.now(), { step: 2 });
    for (const offset of [-360, 0, 360]) {
      this.L.polygon(ring.map(([lat, lng]) => [lat, lng + offset]), { pane: 'nightPane', stroke: false, fillColor: '#020611', fillOpacity: 1, interactive: false, className: 'night-shade', smoothFactor: 1.5 }).addTo(this.nightLayer);
    }
    this.updateNightOpacity();
  }

  updateNightOpacity() {
    const z = this.map.getZoom();
    const opacity = z <= 3 ? 0.42 : z <= 5 ? 0.42 * (1 - (z - 3) / 2.5) : 0;
    const pane = this.map.getPane('nightPane');
    if (pane) pane.style.opacity = String(Math.max(0, opacity));
  }

  destroy() { clearInterval(this.nightTimer); this.echo.destroy(); }
}
