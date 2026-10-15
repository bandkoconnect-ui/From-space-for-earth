# ECHO — Earth Intelligence for Everyone

An iPad-first, responsive front-end prototype for exploring satellite evidence. Built as a static website so it can be uploaded directly to GitHub and published with GitHub Pages.

## Run it

1. Extract the ZIP.
2. Open `index.html` in a browser, or upload all files to the root of a GitHub repository.
3. In GitHub, open **Settings → Pages**, select **Deploy from a branch**, choose `main` and `/ (root)`, then save.
4. Open the published URL on iPad Safari. Use **Share → Add to Home Screen** to install it as a web app shortcut.

The app uses Leaflet from a CDN and OpenStreetMap tiles, so an internet connection is needed. There is no build step and no API key required for the demo.

## What works in this prototype

- Interactive pan/zoom map centered on Nepal
- Toggleable basemap, illustrative flood polygon, place markers, and a relief-style visual filter
- Event timeline with dates, map movement, and playback
- Before/after source modal linking to the official ESA imagery
- Evidence panel with links to ESA, Copernicus, NASA GPM/IMERG, Planet and OpenStreetMap
- Evidence-led assistant demo with topic-specific responses and source links
- Exportable JSON investigation snapshot
- Responsive iPad, desktop, and mobile layouts

## Important data honesty note

The map's blue flood polygon and place markers are **illustrative UI demo geometry**. They are not derived from satellite pixels, are not validated flood boundaries, and must not be used for emergency decisions. The time slider is a conceptual investigation timeline, not a live archive query. The assistant uses predefined, source-grounded responses; it is not connected to a language model or satellite-processing backend. Planet data is commercial and is not accessed by this prototype.

## Suggested next engineering milestone

Connect to a real STAC/Copernicus data source, retrieve an actual pre-event and post-event Sentinel-1 or Sentinel-2 pair for a documented Nepal event, implement reproducible flood/change detection, and replace the illustrative geometry with a versioned result that records source scene IDs, acquisition timestamps, processing parameters, validation notes, and uncertainty.

## Data links

- ESA Nepal flash-flood report: https://www.esa.int/Applications/Observing_the_Earth/Copernicus/Sentinel-2/Nepal_flash_flood_imaged_by_satellites
- Copernicus Data Space: https://dataspace.copernicus.eu/
- NASA GPM / IMERG: https://gpm.nasa.gov/data/imerg
- Planet Data API documentation: https://docs.planet.com/develop/apis/data/
- OpenStreetMap attribution and license: https://www.openstreetmap.org/copyright

## License

The original ECHO prototype code is provided for personal experimentation. Third-party map tiles, libraries, fonts, and data remain subject to their respective licenses and attribution requirements.
