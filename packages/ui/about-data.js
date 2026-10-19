// What ECHO's data is, and is not. One copy, rendered by both apps, so the wording that sets
// expectations (resolution limits, no automated analysis, privacy) cannot drift apart.

export function aboutDataContent(device = 'computer') {
  return {
    lead: 'ECHO shows real satellite imagery and real event records. It does not tell you what they mean. That part is the investigation.',
    items: [
      { title: 'Satellite imagery (NASA GIBS)', text: 'Daily true-colour MODIS (Terra, Aqua) and VIIRS imagery, roughly 250 m per pixel. Good for regional context and fast-moving events, too coarse for buildings or small fields. Clouds, swath gaps and recent days that are still being processed can all look like change. Always check the date.' },
      { title: 'Base map (Esri World Imagery)', text: 'High-resolution background imagery that is not tied to a date. It gives context; it is not evidence for the selected day.' },
      { title: 'Events (NASA EONET)', text: 'A curated feed of natural events with source links. It can be incomplete or delayed, and positions are as reported by the source, so follow the links before relying on one.' },
      { title: 'What ECHO does not do', text: 'It runs no automated change detection. Areas marked illustrative are examples of how to outline a study area, not measurements. Ask ECHO’s built-in guide gives research advice; a connected AI service can be wrong, so check its claims.' },
      { title: 'Privacy', text: `Your investigations and notes stay on this ${device}. Map tiles are loaded straight from Esri and NASA, so they can see the map area you view. The event feed is loaded from NASA. Questions go to an AI service only if you set one up in Settings.` }
    ],
    links: [
      { label: 'NASA GIBS', url: 'https://gibs.earthdata.nasa.gov/' },
      { label: 'NASA EONET', url: 'https://eonet.gsfc.nasa.gov/' },
      { label: 'NASA Worldview', url: 'https://worldview.earthdata.nasa.gov/' },
      { label: 'Copernicus Data Space', url: 'https://dataspace.copernicus.eu/' }
    ]
  };
}
