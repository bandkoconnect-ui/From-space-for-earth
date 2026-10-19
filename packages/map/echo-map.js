// EchoMap: the Leaflet map shared by the desktop and phone apps.
//
// It owns everything geographic (basemap, NASA imagery for the selected date, the before/after
// swipe, event tracks, notes, investigation points) and knows nothing about either UI. The UIs
// call its methods and listen to its events.
//
// Requires window.L (see vendor/leaflet/leaflet.js).

import { DATA_OVERLAYS, imageryLayer, overlayLayer, wmsOptions, GIBS_WMS_URL } from '../core/src/gibs.js';
import { formatDateLong } from '../core/src/dates.js';
import { geometryCenter, lonLatRingToLatLng, formatLatLng } from '../core/src/geo.js';
import { categoryInfo } from '../core/src/eonet.js';
import { h } from '../ui/dom.js';

const ESRI_IMAGERY = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const ESRI_LABELS = 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}';

const TONE_STYLE = {
  water: { color: '#86e4ff', fillColor: '#3cbde8' },
  forest: { color: '#a7e8ae', fillColor: '#6abf7b' },
  fire: { color: '#ffb27a', fillColor: '#ff8f5a' },
  neutral: { color: '#9af3c6', fillColor: '#9af3c6' }
};

export const DEFAULT_LAYERS = Object.freeze({
  satellite: true, // the Esri base imagery
  labels: true,
  nasa: true, // NASA GIBS imagery for the selected date
  compare: false, // split the NASA imagery between the first date and the selected date
  overlay: true,
  points: true,
  notes: true,
  fires: false,
  precip: false
});

export class EchoMap {
  /**
   * @param {HTMLElement} element
   * @param {{ compact?: boolean, imagery?: string, now?: () => Date, minZoom?: number, zoomSnap?: number,
   *   zoomDelta?: number, layers?: Partial<typeof DEFAULT_LAYERS>, view?: { center: [number, number], zoom: number } }} [options]
   */
  constructor(element, { compact = false, imagery = 'terra', now = () => new Date(), minZoom = 2, zoomSnap, zoomDelta, layers = {}, view = { center: [20, 10], zoom: 2 } } = {}) {
    const L = window.L;
    if (!L) throw new Error('Leaflet is not loaded');
    this.L = L;
    this.compact = compact;
    this.now = now;
    this.listeners = new Map();
    this.layers = { ...DEFAULT_LAYERS, ...layers };
    this.imageryId = imagery;
    this.investigation = null;
    this.notes = [];
    this.dateIndex = 0;
    this.split = 50;
    this.tileErrors = 0;
    this.lastErrorEmit = 0;
    this.reducedMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

    const map = L.map(element, {
      zoomControl: false,
      attributionControl: false,
      preferCanvas: true,
      worldCopyJump: true,
      minZoom,
      maxZoom: 18,
      zoomSnap: zoomSnap ?? (compact ? 0.5 : 1),
      zoomDelta: zoomDelta ?? 1,
      tap: true
    });
    this.map = map;
    L.control.attribution({ prefix: false, position: 'bottomright' }).addTo(map);

    // Stacking: basemap < NASA imagery < data layers < place labels < vectors < markers.
    this.pane('compareBefore', 210);
    this.pane('compareAfter', 211);
    this.pane('dataPane', 250);
    this.pane('labelsPane', 300, true);

    this.basemap = L.tileLayer(ESRI_IMAGERY, { maxZoom: 18, maxNativeZoom: 17, attribution: 'Imagery © Esri and its data providers', className: 'echo-basemap' });
    this.labelsLayer = L.tileLayer(ESRI_LABELS, { maxZoom: 18, maxNativeZoom: 13, pane: 'labelsPane', attribution: 'Labels © Esri' });
    this.pointsGroup = L.layerGroup();
    this.overlayGroup = L.layerGroup();
    this.eventGroup = L.layerGroup();
    this.notesGroup = L.layerGroup();
    this.pulseGroup = L.layerGroup();
    this.draftGroup = L.layerGroup();
    this.userGroup = L.layerGroup();
    this.compareBefore = null;
    this.compareAfter = null;
    this.dataLayers = new Map();

    if (this.layers.satellite) this.basemap.addTo(map);
    if (this.layers.labels) this.labelsLayer.addTo(map);
    [this.pulseGroup, this.draftGroup, this.userGroup].forEach((group) => group.addTo(map));
    if (this.layers.overlay) { this.overlayGroup.addTo(map); this.eventGroup.addTo(map); }
    if (this.layers.points) this.pointsGroup.addTo(map);
    if (this.layers.notes) this.notesGroup.addTo(map);

    map.on('mousemove', (e) => this.emit('coords', { lat: e.latlng.lat, lng: e.latlng.lng }));
    map.on('moveend', () => { const c = map.getCenter(); this.emit('moveend', { lat: c.lat, lng: c.lng, zoom: map.getZoom() }); });
    map.on('move zoom resize', () => this.updateClip());
    map.on('click', (e) => this.emit('mapclick', { lat: e.latlng.lat, lng: e.latlng.lng }));
    map.setView(view.center, view.zoom);
  }

  pane(name, zIndex, passThrough = false) {
    const pane = this.map.createPane(name);
    pane.style.zIndex = String(zIndex);
    if (passThrough) pane.style.pointerEvents = 'none';
    return pane;
  }

  /* ---- events ---- */
  on(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(listener);
    return () => this.listeners.get(type)?.delete(listener);
  }

  emit(type, detail) {
    this.listeners.get(type)?.forEach((fn) => fn(detail));
  }

  /* ---- investigation ---- */
  setInvestigation(investigation, { dateIndex = investigation.defaultIndex, notes = [], fly = true } = {}) {
    this.investigation = investigation;
    this.notes = notes;
    this.dateIndex = Math.min(dateIndex, investigation.timeline.length - 1);
    this.clearPulse();
    this.drawPoints();
    this.drawOverlay();
    this.drawNotes();
    this.syncImagery();
    this.refreshImagery();
    const status = this.drawEvent();
    if (fly) this.goHome();
    return status;
  }

  goHome() {
    const inv = this.investigation;
    if (!inv) return;
    const bounds = this.eventBounds();
    if (bounds) this.map.fitBounds(bounds, { padding: [48, 48], maxZoom: 9, animate: !this.reducedMotion && this.hasSize() });
    else this.moveTo(inv.center, inv.zoom);
  }

  /** True when the map has a real size. A hidden map is 0 x 0, and animating one produces NaN coordinates. */
  hasSize() {
    const el = this.map.getContainer();
    return el.clientWidth > 0 && el.clientHeight > 0;
  }

  moveTo(center, zoom, { animate = true } = {}) {
    if (animate && !this.reducedMotion && this.hasSize()) this.map.flyTo(center, zoom, { duration: 0.7 });
    else this.map.setView(center, zoom, { animate: false });
  }

  eventBounds() {
    const geometry = this.investigation?.event?.geometry;
    if (!geometry || geometry.length < 2) return null;
    const points = geometry.map((g) => geometryCenter(g)).filter(Boolean);
    const lats = points.map((p) => p[0]);
    const lngs = points.map((p) => p[1]);
    const span = Math.max(Math.max(...lats) - Math.min(...lats), Math.max(...lngs) - Math.min(...lngs));
    if (span < 0.05) return null;
    return [[Math.min(...lats), Math.min(...lngs)], [Math.max(...lats), Math.max(...lngs)]];
  }

  /** Returns { visible, total, label } describing event positions up to the selected date. */
  setDateIndex(index) {
    if (!this.investigation) return null;
    this.dateIndex = Math.max(0, Math.min(index, this.investigation.timeline.length - 1));
    this.refreshImagery();
    return this.drawEvent();
  }

  currentDate() {
    return this.investigation?.timeline[this.dateIndex]?.date;
  }

  /* ---- layers ---- */
  setLayer(name, enabled) {
    this.layers[name] = Boolean(enabled);
    const map = this.map;
    const toggle = (layer) => { if (enabled) layer.addTo(map); else map.removeLayer(layer); };
    switch (name) {
      case 'satellite': toggle(this.basemap); break;
      case 'labels': toggle(this.labelsLayer); break;
      case 'overlay': toggle(this.overlayGroup); toggle(this.eventGroup); break;
      case 'points': toggle(this.pointsGroup); break;
      case 'notes': toggle(this.notesGroup); break;
      case 'nasa': this.syncImagery(); break;
      case 'compare':
        this.syncImagery();
        this.emit('compare', { open: Boolean(this.layers.compare && this.investigation), ...this.compareDates() });
        break;
      case 'fires':
      case 'precip': this.applyDataLayer(name); break;
      default: break;
    }
  }

  setLayers(layers) {
    Object.entries(layers).forEach(([name, enabled]) => this.setLayer(name, enabled));
  }

  setImagery(id) {
    this.imageryId = id;
    this.removeImageryLayers();
    this.syncImagery();
  }

  compareDates() {
    const timeline = this.investigation?.timeline || [];
    return { before: timeline[0]?.date, after: timeline[this.dateIndex]?.date };
  }

  refreshImagery() {
    if (!this.investigation) return;
    const { before, after } = this.compareDates();
    if (this.compareBefore && before) this.compareBefore.setParams({ time: wmsOptions(imageryLayer(this.imageryId), before, { now: this.now() }).time }, true);
    if (this.compareAfter && after) this.compareAfter.setParams({ time: wmsOptions(imageryLayer(this.imageryId), after, { now: this.now() }).time }, true);
    this.compareBefore?.redraw();
    this.compareAfter?.redraw();
    for (const [name, layer] of this.dataLayers) {
      const definition = overlayLayer(name);
      if (definition && after) { layer.setParams({ time: wmsOptions(definition, after, { now: this.now() }).time }, true); layer.redraw(); }
    }
  }

  wire(layer) {
    layer.on('tileerror', () => {
      this.tileErrors += 1;
      const t = Date.now();
      if (t - this.lastErrorEmit > 4000) { this.lastErrorEmit = t; this.emit('tileerror', {}); }
    });
    layer.on('tileload', () => { if (this.tileErrors) { this.tileErrors = 0; this.emit('tileok', {}); } });
    return layer;
  }

  /**
   * Makes the NASA layers match the layer switches. The "after" layer (the selected date) exists
   * whenever NASA imagery or compare is on; the "before" layer (the first date) only for compare.
   */
  syncImagery() {
    const have = Boolean(this.investigation);
    const wantAfter = have && (this.layers.nasa || this.layers.compare);
    const wantBefore = have && this.layers.compare;
    const { before, after } = this.compareDates();
    const definition = imageryLayer(this.imageryId);
    const make = (date, pane) => this.wire(this.L.tileLayer.wms(GIBS_WMS_URL, wmsOptions(definition, date, { now: this.now(), pane }))).addTo(this.map);
    if (wantAfter && !this.compareAfter) this.compareAfter = make(after, 'compareAfter');
    if (!wantAfter && this.compareAfter) { this.map.removeLayer(this.compareAfter); this.compareAfter = null; }
    if (wantBefore && !this.compareBefore) this.compareBefore = make(before, 'compareBefore');
    if (!wantBefore && this.compareBefore) { this.map.removeLayer(this.compareBefore); this.compareBefore = null; }
    this.updateClip();
  }

  removeImageryLayers() {
    for (const key of ['compareBefore', 'compareAfter']) {
      if (this[key]) { this.map.removeLayer(this[key]); this[key] = null; }
    }
  }

  setSplit(percent) {
    this.split = Math.max(0, Math.min(100, Number(percent)));
    this.updateClip();
  }

  /** Clips the two NASA layers to either side of the divider. Re-run on every map move. */
  updateClip() {
    if (!this.compareAfter) return;
    const map = this.map;
    const nw = map.containerPointToLayerPoint([0, 0]);
    const se = map.containerPointToLayerPoint(map.getSize());
    // Without compare the divider sits at the far left, so the selected date fills the map.
    const split = this.compareBefore ? this.split : 0;
    const x = nw.x + ((se.x - nw.x) * split) / 100;
    const rect = (x0, x1) => `polygon(${x0}px ${nw.y}px, ${x1}px ${nw.y}px, ${x1}px ${se.y}px, ${x0}px ${se.y}px)`;
    const before = this.compareBefore?.getContainer();
    const after = this.compareAfter.getContainer();
    if (before) before.style.clipPath = rect(nw.x, x);
    if (after) after.style.clipPath = rect(x, se.x);
  }

  applyDataLayer(name) {
    const definition = overlayLayer(name);
    if (!definition) return;
    if (!this.layers[name]) {
      const existing = this.dataLayers.get(name);
      if (existing) { this.map.removeLayer(existing); this.dataLayers.delete(name); }
      return;
    }
    if (this.dataLayers.has(name)) return;
    const date = this.currentDate() || new Date().toISOString().slice(0, 10);
    const layer = this.wire(this.L.tileLayer.wms(GIBS_WMS_URL, wmsOptions(definition, date, { now: this.now(), pane: 'dataPane' }))).addTo(this.map);
    this.dataLayers.set(name, layer);
  }

  /** Active layer attributions are shown by Leaflet's attribution control automatically. */
  availableDataLayers() { return DATA_OVERLAYS; }

  /* ---- drawing ---- */
  drawPoints() {
    this.pointsGroup.clearLayers();
    const L = this.L;
    (this.investigation?.points || []).forEach((point, i) => {
      const marker = L.marker([point.lat, point.lng], {
        icon: L.divIcon({ className: 'echo-pin-wrap', html: `<span class="echo-pin${i === 0 ? ' echo-pin-primary' : ''}"></span>`, iconSize: [18, 18], iconAnchor: [9, 9] }),
        keyboard: false,
        title: point.name
      });
      marker.bindPopup(() => h('div', { class: 'echo-popup-body' }, h('strong', null, point.name), h('span', null, point.type), h('small', null, formatLatLng(point.lat, point.lng, 3))), { className: 'echo-popup', closeButton: false });
      marker.on('click', () => this.emit('pointclick', { point }));
      marker.addTo(this.pointsGroup);
    });
  }

  drawOverlay() {
    this.overlayGroup.clearLayers();
    const overlay = this.investigation?.overlay;
    if (!overlay) return;
    const L = this.L;
    const style = TONE_STYLE[overlay.tone] || TONE_STYLE.neutral;
    if (overlay.kind === 'polygon') {
      L.polygon(overlay.coords, { ...style, weight: 1.4, opacity: 0.85, fillOpacity: 0.2, dashArray: overlay.illustrative ? '6 5' : null, interactive: true })
        .bindTooltip(overlay.label || 'Illustrative area', { sticky: true, className: 'echo-tooltip' })
        .addTo(this.overlayGroup);
    } else if (overlay.kind === 'circle') {
      L.circle(this.investigation.center, { ...style, radius: this.investigation.radiusKm * 1000, weight: 1.4, opacity: 0.9, fillOpacity: 0.07, dashArray: '2 6', interactive: true })
        .bindTooltip(`Area of interest · ${this.investigation.radiusKm} km radius`, { sticky: true, className: 'echo-tooltip' })
        .addTo(this.overlayGroup);
    }
  }

  /** Recorded event positions up to the selected date: a track, polygons and a latest marker. */
  drawEvent() {
    this.eventGroup.clearLayers();
    const event = this.investigation?.event;
    if (!event) return null;
    const L = this.L;
    const cutoff = this.currentDate();
    const color = categoryInfo(event.categoryId).color;
    const visible = event.geometry.filter((g) => g.date <= cutoff);
    if (!visible.length) return { visible: 0, total: event.geometry.length, label: `Before the first recorded position (${formatDateLong(event.geometry[0].date)})` };

    const centers = visible.map((g) => geometryCenter(g));
    if (centers.length > 1) L.polyline(centers, { color, weight: 2, opacity: 0.8, dashArray: '4 6', interactive: false }).addTo(this.eventGroup);
    visible.forEach((g, i) => {
      const latest = i === visible.length - 1;
      if (g.type === 'Polygon') {
        L.polygon(lonLatRingToLatLng(g.coordinates[0]), { color, weight: latest ? 2 : 1, opacity: latest ? 0.95 : 0.4, fillColor: color, fillOpacity: latest ? 0.22 : 0.05, interactive: false }).addTo(this.eventGroup);
      }
      const marker = L.circleMarker(centers[i], { radius: latest ? 8 : 4, color: '#06131a', weight: 1.5, fillColor: color, fillOpacity: latest ? 1 : 0.7 });
      marker.bindTooltip(`${formatDateLong(g.date)}${g.magnitude ? ` · ${g.magnitude.value} ${g.magnitude.unit}` : ''}`, { className: 'echo-tooltip' });
      marker.addTo(this.eventGroup);
    });
    const last = visible[visible.length - 1];
    return { visible: visible.length, total: event.geometry.length, label: `Latest recorded position: ${formatDateLong(last.date)}` };
  }

  drawNotes(notes = this.notes) {
    this.notes = notes;
    this.notesGroup.clearLayers();
    const L = this.L;
    notes.filter((n) => n.lat !== undefined).forEach((note) => {
      const marker = L.marker([note.lat, note.lng], { icon: L.divIcon({ className: 'echo-pin-wrap', html: '<span class="echo-note-pin"></span>', iconSize: [20, 20], iconAnchor: [10, 10] }), keyboard: false });
      marker.bindPopup(() => h('div', { class: 'echo-popup-body' }, h('strong', null, 'Field note'), h('span', null, note.text), h('small', null, formatLatLng(note.lat, note.lng, 3))), { className: 'echo-popup', closeButton: false });
      marker.on('click', () => this.emit('noteclick', { id: note.id }));
      marker.addTo(this.notesGroup);
    });
  }

  /** Shows the person's own position (a dot and an accuracy circle). null clears it. */
  setUserLocation(point) {
    this.userGroup.clearLayers();
    if (!point) return;
    const L = this.L;
    if (point.accuracy > 0) L.circle([point.lat, point.lng], { radius: Math.min(point.accuracy, 5000), color: '#7cb8ff', weight: 1, opacity: 0.6, fillColor: '#7cb8ff', fillOpacity: 0.12, interactive: false }).addTo(this.userGroup);
    L.circleMarker([point.lat, point.lng], { radius: 7, color: '#ffffff', weight: 2.5, fillColor: '#3d8bff', fillOpacity: 1, interactive: false }).addTo(this.userGroup);
  }

  /** A temporary pin showing where the next note will be attached (null clears it). */
  setDraftPin(point) {
    this.draftGroup.clearLayers();
    if (!point) return;
    this.L.marker([point.lat, point.lng], {
      icon: this.L.divIcon({ className: 'echo-pin-wrap', html: '<span class="echo-note-pin echo-note-draft"></span>', iconSize: [20, 20], iconAnchor: [10, 10] }),
      interactive: false,
      keyboard: false
    }).addTo(this.draftGroup);
  }

  /** Shows no investigation: clears its drawings and NASA imagery, leaving the plain base map. */
  clearInvestigation() {
    this.investigation = null;
    this.notes = [];
    for (const group of [this.pointsGroup, this.overlayGroup, this.eventGroup, this.notesGroup, this.draftGroup]) group.clearLayers();
    this.syncImagery();
  }

  /* ---- Planet Pulse (event overview) ---- */
  showEvents(events) {
    this.pulseGroup.clearLayers();
    this.pulseMarkers = new Map();
    const L = this.L;
    for (const event of events) {
      const marker = L.circleMarker([event.lat, event.lng], { radius: 7, color: '#06131a', weight: 1.5, fillColor: event.color, fillOpacity: 0.95 });
      marker.bindTooltip(event.title, { className: 'echo-tooltip' });
      marker.on('click', () => this.emit('eventclick', { id: event.id }));
      marker.addTo(this.pulseGroup);
      this.pulseMarkers.set(event.id, marker);
    }
  }

  highlightEvent(id, { fly = true } = {}) {
    for (const [key, marker] of this.pulseMarkers || []) marker.setStyle({ radius: key === id ? 11 : 7, weight: key === id ? 3 : 1.5, color: key === id ? '#ffffff' : '#06131a' });
    const marker = this.pulseMarkers?.get(id);
    if (marker) {
      marker.bringToFront();
      if (fly) this.moveTo(marker.getLatLng(), Math.max(this.map.getZoom(), 5));
    }
  }

  fitEvents(events) {
    if (!events.length) { this.map.setView([20, 10], 2); return; }
    this.map.fitBounds(events.map((e) => [e.lat, e.lng]), { padding: [40, 40], maxZoom: 6, animate: false });
  }

  clearPulse() {
    this.pulseGroup.clearLayers();
    this.pulseMarkers = new Map();
  }

  /* ---- misc ---- */
  zoomIn() { this.map.zoomIn(); }
  zoomOut() { this.map.zoomOut(); }
  getCenter() { const c = this.map.getCenter(); return { lat: c.lat, lng: c.lng }; }
  /** Re-measures the container. Ignored while the map is hidden, so it keeps its last good size. */
  invalidateSize() {
    if (!this.hasSize()) return;
    this.map.invalidateSize({ animate: false });
    this.updateClip();
  }
  openPopupForNote(id) { const index = this.notes.filter((n) => n.lat !== undefined).findIndex((n) => n.id === id); if (index >= 0) this.notesGroup.getLayers()[index]?.openPopup(); }
  destroy() { this.map.remove(); this.listeners.clear(); }
}
