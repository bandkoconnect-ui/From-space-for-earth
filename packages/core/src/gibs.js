// NASA GIBS (Global Imagery Browse Services) layer catalogue.
// Docs: https://nasa-gibs.github.io/gibs-api-docs/
//
// Imagery is requested through GIBS' WMS endpoint with the documented TIME parameter, as in
// the original prototype. Layers are data: adding a layer to a catalogue is one entry here.

import { clampToToday, toIsoDate } from './dates.js';

export const GIBS_WMS_URL = 'https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi';

/** Base "true colour" imagery used for the before / after swipe. */
export const IMAGERY_LAYERS = [
  { id: 'terra', gibs: 'MODIS_Terra_CorrectedReflectance_TrueColor', label: 'MODIS Terra', detail: 'True colour · about 250 m · daily', attribution: 'NASA GIBS · MODIS Terra' },
  { id: 'aqua', gibs: 'MODIS_Aqua_CorrectedReflectance_TrueColor', label: 'MODIS Aqua', detail: 'True colour · about 250 m · daily', attribution: 'NASA GIBS · MODIS Aqua' },
  { id: 'viirs', gibs: 'VIIRS_SNPP_CorrectedReflectance_TrueColor', label: 'VIIRS Suomi NPP', detail: 'True colour · about 250 to 375 m · daily', attribution: 'NASA GIBS · VIIRS Suomi NPP' }
];

/** Transparent data layers drawn over the selected date. */
export const DATA_OVERLAYS = [
  { id: 'fires', gibs: 'MODIS_Terra_Thermal_Anomalies_All', label: 'Fires and thermal anomalies', detail: 'MODIS Terra · daily detections', opacity: 0.95, attribution: 'NASA GIBS · MODIS thermal anomalies' },
  { id: 'precip', gibs: 'IMERG_Precipitation_Rate', label: 'Precipitation rate', detail: 'NASA IMERG · satellite estimate', opacity: 0.7, attribution: 'NASA GIBS · GPM IMERG' }
];

export const DEFAULT_IMAGERY_ID = 'terra';

export function imageryLayer(id) {
  return IMAGERY_LAYERS.find((layer) => layer.id === id) || IMAGERY_LAYERS[0];
}

export function overlayLayer(id) {
  return DATA_OVERLAYS.find((layer) => layer.id === id) || null;
}

/**
 * Leaflet `L.tileLayer.wms` options for a GIBS layer on a given day.
 * The date is clamped so a timeline stop in the future never requests missing imagery.
 */
export function wmsOptions(layer, dateIso, { transparent = false, now = new Date(), pane } = {}) {
  const iso = toIsoDate(dateIso);
  if (!iso) throw new RangeError(`Invalid imagery date: ${dateIso}`);
  const isOverlay = layer.opacity !== undefined;
  const options = {
    layers: layer.gibs,
    styles: '',
    format: 'image/png',
    transparent: transparent || isOverlay,
    version: '1.1.1',
    time: clampToToday(iso, now),
    uppercase: false,
    attribution: layer.attribution,
    keepBuffer: 2
  };
  if (isOverlay) options.opacity = layer.opacity;
  if (pane) options.pane = pane;
  return options;
}

/** A NASA Worldview permalink centred on a point, for opening the same day in the full viewer. */
export function worldviewUrl(lat, lng, dateIso, spanDegrees = 2) {
  const iso = toIsoDate(dateIso);
  const bbox = [lng - spanDegrees, lat - spanDegrees, lng + spanDegrees, lat + spanDegrees].map((n) => n.toFixed(3)).join(',');
  const params = new URLSearchParams({ v: bbox });
  if (iso) params.set('t', `${iso}-T00:00:00Z`);
  return `https://worldview.earthdata.nasa.gov/?${params.toString().replace(/%2C/g, ',')}`;
}
