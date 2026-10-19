// The two demonstration investigations that ship with the app.
//
// Nepal is a real, sourced event: the dates follow the ESA article linked in its evidence.
// Amazon is a workflow demo. Its focus area is drawn by hand and labelled illustrative.

import { normalizeInvestigation } from './investigation.js';

const STAMP = '2026-08-31T00:00:00.000Z';

const NEPAL = {
  id: 'demo-nepal',
  kind: 'demo',
  title: 'Nepal · Glacier flash flood',
  topic: 'flood',
  createdAt: STAMP,
  center: [28.05, 85.33],
  zoom: 9,
  radiusKm: 60,
  headline: ['When the river', 'rewrote the map.'],
  subtitle: 'Langtang and Trishuli valleys · August 2026',
  legend: { title: 'Real imagery, no overlay', subtitle: 'Swipe NASA MODIS imagery to compare dates' },
  callout: 'A river, out of bounds.',
  timeline: [
    { date: '2026-08-12', desc: 'Before the event · date of ESA’s Sentinel-2 baseline image' },
    { date: '2026-08-24', desc: 'Pre-event · date of ESA’s Sentinel-2 infrared image' },
    { date: '2026-08-27', desc: 'After the event · date of ESA’s Sentinel-2 post-event image' },
    { date: '2026-09-03', desc: 'Follow-up window · look for persistence and recovery' }
  ],
  defaultIndex: 2,
  points: [
    { name: 'Langtang Lirung', lat: 28.25, lng: 85.52, type: 'Reported source area (ESA) · approximate' },
    { name: 'Trishuli River corridor', lat: 27.89, lng: 85.08, type: 'River corridor · inspect imagery' },
    { name: 'Nuwakot area', lat: 27.91, lng: 85.16, type: 'Area of interest · inspect imagery' },
    { name: 'Dhading corridor', lat: 27.86, lng: 84.91, type: 'River valley · inspect imagery' },
    { name: 'Kathmandu', lat: 27.7172, lng: 85.324, type: 'Capital · place context' }
  ],
  overlay: null,
  evidence: [
    { badge: 'ESA', title: 'Nepal flash flood imaged by satellites', detail: 'ESA’s account with before and after Sentinel-2 images', url: 'https://www.esa.int/Applications/Observing_the_Earth/Copernicus/Sentinel-2/Nepal_flash_flood_imaged_by_satellites' },
    { badge: 'EU', title: 'Copernicus Data Space', detail: 'Search the Sentinel archive for the same dates', url: 'https://dataspace.copernicus.eu/' },
    { badge: 'GPM', title: 'NASA GPM / IMERG', detail: 'Satellite precipitation estimates for context', url: 'https://gpm.nasa.gov/data/imerg' }
  ],
  steps: [
    { title: 'Verify the event boundary', detail: 'Compare source scenes and record each acquisition date.' },
    { title: 'Check exposed places', detail: 'Overlay roads and settlements only after the extent is validated.' },
    { title: 'Review rainfall context', detail: 'Compare satellite estimates with local reports.' }
  ],
  summary: 'ESA reports a flash flood and debris avalanche on 26 August 2026, triggered by a glacier collapse on Langtang Lirung, with floodwater travelling roughly 100 km down the Lende Khola and Trishuli valleys. ECHO shows real NASA MODIS imagery for each date. At 250 m resolution it cannot show the flood channel in detail. Read the ESA article for the high-resolution Sentinel-2 view.'
};

const AMAZON = {
  id: 'demo-amazon',
  kind: 'demo',
  title: 'Amazon · Forest change (workflow demo)',
  topic: 'forest',
  createdAt: STAMP,
  center: [-3.4653, -62.2159],
  zoom: 7,
  radiusKm: 120,
  headline: ['A forest in', 'transition.'],
  subtitle: 'Brazilian Amazon · Workflow demonstration',
  legend: { title: 'Illustrative focus area', subtitle: 'Hand-drawn. Not a deforestation map' },
  callout: 'A forest under observation.',
  timeline: [
    { date: '2025-06-01', desc: 'Baseline window · establish a comparable forest-cover reference' },
    { date: '2025-07-01', desc: 'Comparison window · inspect cloud-free optical coverage' },
    { date: '2025-08-01', desc: 'Review window · compare possible land-cover changes' },
    { date: '2025-09-01', desc: 'Follow-up window · validate any change against source data' }
  ],
  defaultIndex: 2,
  points: [
    { name: 'Manaus', lat: -3.119, lng: -60.0217, type: 'Regional hub · place context' },
    { name: 'Rio Negro corridor', lat: -2.95, lng: -62.1, type: 'River corridor · inspect imagery' },
    { name: 'Forest edge · west', lat: -3.48, lng: -63.0, type: 'Illustrative area of interest' },
    { name: 'Forest edge · south', lat: -4.1, lng: -62.4, type: 'Illustrative area of interest' }
  ],
  overlay: {
    kind: 'polygon',
    tone: 'forest',
    illustrative: true,
    label: 'Illustrative focus area · not a deforestation map',
    coords: [[-3.22, -62.78], [-3.0, -62.54], [-3.28, -62.23], [-3.18, -61.95], [-3.62, -61.8], [-3.9, -62.08], [-3.8, -62.45], [-3.52, -62.72]]
  },
  evidence: [
    { badge: 'EU', title: 'Copernicus Data Space', detail: 'Sentinel-2 optical archive', url: 'https://dataspace.copernicus.eu/' },
    { badge: 'GFW', title: 'Global Forest Watch', detail: 'Forest monitoring context and datasets', url: 'https://www.globalforestwatch.org/' },
    { badge: 'NASA', title: 'NASA Earthdata', detail: 'Earth observation data access', url: 'https://earthdata.nasa.gov/' }
  ],
  steps: [
    { title: 'Find comparable scenes', detail: 'Check acquisition dates, cloud cover and resolution.' },
    { title: 'Separate change from seasonality', detail: 'Compare like-for-like periods before drawing conclusions.' },
    { title: 'Validate potential loss', detail: 'Cross-check a change signal against trusted reference data.' }
  ],
  summary: 'A demonstration of a forest-change workflow. No deforestation detection has been run, and the focus area is drawn by hand for illustration.'
};

export const DEMO_IDS = [NEPAL.id, AMAZON.id];

export function demoInvestigations() {
  return [NEPAL, AMAZON].map((raw) => normalizeInvestigation(raw));
}
