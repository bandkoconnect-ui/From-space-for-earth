// Investigation topics: wording, starting evidence and a sensible first set of steps.
// This is guidance for how to investigate. It never claims that anything has been measured.

const COPERNICUS = { badge: 'EU', title: 'Copernicus Data Space', detail: 'Sentinel-1 radar and Sentinel-2 optical archives', url: 'https://dataspace.copernicus.eu/' };
const WORLDVIEW = { badge: 'NASA', title: 'NASA Worldview', detail: 'Browse daily satellite imagery and data layers', url: 'https://worldview.earthdata.nasa.gov/' };
const GPM = { badge: 'GPM', title: 'NASA GPM / IMERG', detail: 'Satellite precipitation estimates', url: 'https://gpm.nasa.gov/data/imerg' };
const EARTHDATA = { badge: 'NASA', title: 'NASA Earthdata', detail: 'Earth observation data access', url: 'https://earthdata.nasa.gov/' };
const EONET = { badge: 'EONET', title: 'NASA EONET', detail: 'Active natural events', url: 'https://eonet.gsfc.nasa.gov/' };
const GFW = { badge: 'GFW', title: 'Global Forest Watch', detail: 'Forest monitoring context and datasets', url: 'https://www.globalforestwatch.org/' };
const FIRMS = { badge: 'FIRMS', title: 'NASA FIRMS', detail: 'Active fire data from MODIS and VIIRS', url: 'https://firms.modaps.eosdis.nasa.gov/' };
const EFFIS = { badge: 'EU', title: 'EFFIS', detail: 'European Forest Fire Information System', url: 'https://effis.jrc.ec.europa.eu/' };
const GVP = { badge: 'GVP', title: 'Smithsonian Global Volcanism Program', detail: 'Volcano reports and eruption history', url: 'https://volcano.si.edu/' };
const OSM = { badge: 'OSM', title: 'OpenStreetMap', detail: 'Roads, buildings and places for exposure checks', url: 'https://www.openstreetmap.org/' };

export const TOPIC_ORDER = ['environment', 'flood', 'forest', 'fire', 'urban', 'storm', 'volcano', 'other'];

export const TOPICS = {
  environment: {
    label: 'Environmental change',
    headline: ['A new question.', 'A changing planet.'],
    legend: { title: 'Area to investigate', subtitle: 'No automated change detection has been run' },
    callout: 'A place to investigate.',
    evidence: [WORLDVIEW, COPERNICUS, EONET],
    steps: [
      { title: 'Inspect available imagery', detail: 'Check dates, cloud cover and native resolution.' },
      { title: 'Compare like with like', detail: 'Use the same season and sensor before reading anything into a difference.' },
      { title: 'Validate with another source', detail: 'Treat visible differences as hypotheses until independent data agrees.' }
    ]
  },
  flood: {
    label: 'Water and floods',
    headline: ['Where did', 'the water go?'],
    legend: { title: 'Area to investigate', subtitle: 'Imagery only. No flood extent has been mapped' },
    callout: 'Water on the move.',
    evidence: [COPERNICUS, GPM, WORLDVIEW],
    steps: [
      { title: 'Find clear scenes', detail: 'Optical imagery is blocked by cloud; radar (Sentinel-1) sees through it.' },
      { title: 'Separate permanent water', detail: 'Mask rivers and lakes that are normally there before calling anything a flood.' },
      { title: 'Add rainfall context', detail: 'Compare satellite precipitation with local gauges and official reports.' }
    ]
  },
  forest: {
    label: 'Forest change',
    headline: ['A forest in', 'transition.'],
    legend: { title: 'Area to investigate', subtitle: 'Seasonal change is not forest loss' },
    callout: 'A forest under observation.',
    evidence: [GFW, COPERNICUS, EARTHDATA],
    steps: [
      { title: 'Find comparable scenes', detail: 'Same season, similar sun angle, low cloud.' },
      { title: 'Separate change from seasonality', detail: 'Compare like-for-like periods before drawing conclusions.' },
      { title: 'Validate potential loss', detail: 'Cross-check a change signal against trusted reference data.' }
    ]
  },
  fire: {
    label: 'Wildfire',
    headline: ['Fire and', 'its footprint.'],
    legend: { title: 'Area to investigate', subtitle: 'Turn on Fires to see satellite detections' },
    callout: 'Heat and smoke.',
    evidence: [FIRMS, EFFIS, WORLDVIEW],
    steps: [
      { title: 'Check thermal detections', detail: 'Compare MODIS and VIIRS fire detections across the timeline.' },
      { title: 'Look for the burn scar', detail: 'Compare imagery before and after, allowing for smoke and cloud.' },
      { title: 'Confirm with official reports', detail: 'Fire agencies publish perimeters and status updates.' }
    ]
  },
  urban: {
    label: 'Urban growth',
    headline: ['How a place', 'grows.'],
    legend: { title: 'Area to investigate', subtitle: 'Coarse imagery shows broad patterns only' },
    callout: 'A city in motion.',
    evidence: [COPERNICUS, OSM, EARTHDATA],
    steps: [
      { title: 'Choose a resolution that fits', detail: 'Daily MODIS cannot resolve buildings. Use Sentinel-2 or finer for detail.' },
      { title: 'Compare multi-year scenes', detail: 'Pick the same season in each year.' },
      { title: 'Check against maps', detail: 'Use OpenStreetMap or official records to confirm what changed.' }
    ]
  },
  storm: {
    label: 'Severe storm',
    headline: ['Following', 'the storm.'],
    legend: { title: 'Recorded track', subtitle: 'Positions reported to NASA EONET' },
    callout: 'A system in motion.',
    evidence: [GPM, WORLDVIEW, EONET],
    steps: [
      { title: 'Follow the reported track', detail: 'Step through the timeline to see where the event was recorded.' },
      { title: 'Add rainfall', detail: 'Turn on Precipitation to see satellite rain-rate estimates.' },
      { title: 'Check official warnings', detail: 'National weather services publish authoritative forecasts and warnings.' }
    ]
  },
  volcano: {
    label: 'Volcano',
    headline: ['A volcano', 'under watch.'],
    legend: { title: 'Recorded location', subtitle: 'Positions reported to NASA EONET' },
    callout: 'A restless landscape.',
    evidence: [GVP, WORLDVIEW, COPERNICUS],
    steps: [
      { title: 'Look for plumes and heat', detail: 'Compare imagery and thermal detections across the dates.' },
      { title: 'Read the weekly reports', detail: 'The Smithsonian GVP summarises activity from observatories.' },
      { title: 'Follow official guidance', detail: 'Local volcano observatories decide hazard levels.' }
    ]
  },
  other: {
    label: 'Something else',
    headline: ['A new question.', 'A changing planet.'],
    legend: { title: 'Area to investigate', subtitle: 'No automated change detection has been run' },
    callout: 'A place to investigate.',
    evidence: [WORLDVIEW, COPERNICUS, EONET],
    steps: [
      { title: 'Define the question', detail: 'Write down what you expect to see, and what would change your mind.' },
      { title: 'Collect comparable imagery', detail: 'Record the date, sensor and cloud conditions for every image.' },
      { title: 'Validate before you share', detail: 'Check a second source before reporting a finding.' }
    ]
  }
};

export function topicInfo(topic) {
  return TOPICS[topic] || TOPICS.other;
}

export function isTopic(topic) {
  return Object.prototype.hasOwnProperty.call(TOPICS, topic);
}
