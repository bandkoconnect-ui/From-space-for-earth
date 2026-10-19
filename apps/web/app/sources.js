// Where evidence and imagery come from: readable names for NASA EONET's source ids, NASA GIBS
// snapshot images, and the near-real-time satellite viewers that cover a location.
//
// Nothing here claims a live video or webcam exists. The only "live-ish" sources listed are
// real, public satellite viewers, described by what they are and how fresh they are.

import { GIBS_WMS_URL, imageryLayer, worldviewUrl } from '../../../packages/core/src/gibs.js';
import { clampToToday, toIsoDate } from '../../../packages/core/src/dates.js';

/** Readable names for the reporting organisations NASA EONET links to. */
export const SOURCE_NAMES = {
  AVO: 'Alaska Volcano Observatory',
  ABFIRE: 'Alberta Wildfire',
  AU_BOM: 'Australian Bureau of Meteorology',
  BCWILDFIRE: 'BC Wildfire Service',
  BYU_ICE: 'Brigham Young University ice database',
  CALFIRE: 'CAL FIRE',
  CEMS: 'Copernicus Emergency Management Service',
  EO: 'NASA Earth Observatory',
  Earthdata: 'NASA Earthdata',
  FEMA: 'US Federal Emergency Management Agency',
  FloodList: 'FloodList',
  GDACS: 'Global Disaster Alert and Coordination System',
  GLIDE: 'GLIDE disaster number',
  IDC: 'International Charter Space and Major Disasters',
  InciWeb: 'InciWeb (US wildfire incidents)',
  IRWIN: 'IRWIN (US wildland fire reporting)',
  JTWC: 'Joint Typhoon Warning Center',
  MBFIRE: 'Manitoba Wildfire Service',
  MRR: 'LANCE Rapid Response',
  NASA_DISP: 'NASA Disasters Program',
  NASA_ESRS: 'NASA Earth Science Disasters',
  NASA_HURR: 'NASA Hurricane Portal',
  NOAA_CPC: 'NOAA Climate Prediction Center',
  NOAA_NHC: 'NOAA National Hurricane Center',
  PDC: 'Pacific Disaster Center',
  ReliefWeb: 'ReliefWeb',
  SIVolcano: 'Smithsonian Global Volcanism Program',
  UNISYS: 'Unisys Weather',
  USGS_CMT: 'USGS earthquake moment tensor',
  USGS_EHP: 'USGS Earthquake Hazards Program',
  HDDS: 'USGS Hazards Data Distribution System',
  DFES_WA: 'Department of Fire and Emergency Services, Western Australia'
};

export function sourceName(id) {
  return SOURCE_NAMES[id] || id || 'Original report';
}

/** Ground span (km) for an imagery snapshot, by the kind of thing being looked at. */
export function snapshotSpanKm(categoryOrTopic) {
  return {
    severeStorms: 900, storm: 900, seaLakeIce: 500, drought: 400, dustHaze: 600, snow: 300, tempExtremes: 600,
    floods: 160, flood: 160, wildfires: 90, fire: 90, volcanoes: 70, volcano: 70, landslides: 60, earthquakes: 120
  }[categoryOrTopic] ?? 200;
}

const R = 6378137; // Web Mercator sphere radius (m)
const mercX = (lng) => (R * lng * Math.PI) / 180;
const mercY = (lat) => R * Math.log(Math.tan(Math.PI / 4 + (Math.max(-85, Math.min(85, lat)) * Math.PI) / 360));

/**
 * A NASA GIBS WMS GetMap URL for one still image centred on a point: the same protocol and
 * parameters the map's imagery tiles use, so it shows exactly what the map would.
 */
export function gibsSnapshotUrl({ lat, lng, date, imagery = 'terra', spanKm = 200, width = 480, height = 300, now = new Date() }) {
  const iso = toIsoDate(date);
  if (!iso) throw new RangeError(`Invalid imagery date: ${date}`);
  const layer = imageryLayer(imagery);
  // Mercator stretches distances by 1/cos(lat); scale the box so it covers spanKm on the ground.
  const stretch = 1 / Math.max(0.2, Math.cos((lat * Math.PI) / 180));
  const halfW = (spanKm * 1000 * stretch) / 2;
  const halfH = halfW * (height / width);
  const x = mercX(lng);
  const y = mercY(lat);
  const params = new URLSearchParams({
    SERVICE: 'WMS', REQUEST: 'GetMap', VERSION: '1.1.1', LAYERS: layer.gibs, STYLES: '',
    SRS: 'EPSG:3857', BBOX: [x - halfW, y - halfH, x + halfW, y + halfH].map((n) => n.toFixed(0)).join(','),
    WIDTH: String(width), HEIGHT: String(height), FORMAT: 'image/jpeg', TIME: clampToToday(iso, now)
  });
  return `${GIBS_WMS_URL}?${params.toString().replace(/%2C/g, ',')}`;
}

/** The geostationary weather satellite family that sees a longitude best. */
export function geostationaryFor(lng) {
  const x = ((((lng + 180) % 360) + 360) % 360) - 180;
  if (x >= -150 && x < -30) return { family: 'GOES', operator: 'NOAA', region: 'the Americas' };
  if (x >= -30 && x < 60) return { family: 'Meteosat', operator: 'EUMETSAT', region: 'Europe, Africa and the Atlantic' };
  return { family: 'Himawari', operator: 'JMA', region: 'Asia and the western Pacific' };
}

/**
 * Near-real-time visual sources for a place. Each entry says what it is, how fresh it is and
 * whether it opens in ECHO or another site. No webcams or streams are listed, because none
 * are verified for arbitrary locations.
 */
export function liveSources({ lat, lng, categoryId = '', date, now = new Date() }) {
  const today = toIsoDate(now.toISOString());
  const geo = geostationaryFor(lng);
  const highLatitude = Math.abs(lat) > 70;
  const list = [
    {
      id: 'gibs-latest',
      kind: 'in-app',
      title: 'Latest daily satellite image',
      detail: 'NASA GIBS true-colour composite. Daily, not live: it is built from passes over the past day and can have cloud or gaps.',
      freshness: 'Updated daily',
      date: today
    },
    {
      id: 'slider',
      kind: 'external',
      title: `${geo.family} geostationary loop`,
      detail: highLatitude
        ? `CIRA SLIDER. Near-real-time ${geo.family} imagery of ${geo.region}. This far north or south the view is very oblique.`
        : `CIRA SLIDER. Near-real-time ${geo.family} imagery of ${geo.region}, refreshed every few minutes.`,
      freshness: 'Every few minutes',
      url: 'https://slider.cira.colostate.edu/'
    }
  ];
  if (geo.family === 'GOES') {
    list.push({ id: 'goes', kind: 'external', title: 'NOAA GOES Image Viewer', detail: 'NOAA’s near-real-time GOES-East and GOES-West imagery for the Americas.', freshness: 'Near real time', url: 'https://www.star.nesdis.noaa.gov/GOES/index.php' });
  }
  if (categoryId === 'wildfires' || categoryId === 'volcanoes') {
    list.push({ id: 'firms', kind: 'external', title: 'NASA FIRMS fire map', detail: 'Satellite fire detections (MODIS and VIIRS), usually within hours of a satellite pass.', freshness: 'Within hours', url: 'https://firms.modaps.eosdis.nasa.gov/map/' });
  }
  list.push({ id: 'worldview', kind: 'external', title: 'NASA Worldview at this place', detail: 'Browse every daily NASA layer for this location and date.', freshness: 'Updated daily', url: worldviewUrl(lat, lng, date || today) });
  return list;
}
