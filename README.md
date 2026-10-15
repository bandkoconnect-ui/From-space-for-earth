# ECHO — Earth Intelligence for Everyone (v3)

An iPad-first, responsive Earth-observation investigation prototype. This version adds a real date-specific NASA satellite-imagery swipe, a personal investigations dashboard, a create-investigation flow, and a live NASA EONET active-events feed.

## Run / publish

1. Extract the ZIP.
2. Upload the contents of this folder to the root of a GitHub repository (replace the prior `index.html`, `styles.css`, `app.js`, and `README.md`).
3. In GitHub, open **Settings → Pages**, select **Deploy from a branch**, choose `main` and `/(root)`, then save.
4. Open the published URL in iPad Safari. Use **Share → Add to Home Screen** to install the web app shortcut.

No build step or API key is required. The app needs an internet connection for Leaflet, Esri satellite tiles, NASA GIBS imagery and the NASA EONET feed.

## What changed in v3

- **Satellite imagery comparison:** the swipe uses dated NASA GIBS MODIS Terra corrected-reflectance true-colour daily composites. The before side uses the first investigation date; the after side follows the timeline selection. Swipe clipping is applied to a Leaflet map pane, so moving the date slider changes the imagery date but does not pan or zoom the map.
- **Satellite-first map:** the English street-map layer has been removed from the layer picker. Esri World Imagery is the default basemap.
- **Dashboard:** “My investigations” includes cards for saved investigations, counts, a new-investigation action and Planet Pulse.
- **Create an investigation:** enter a title, topic and latitude/longitude. The workspace is saved in browser local storage and can be revisited on the same browser/device.
- **Planet Pulse:** loads active Earth events from NASA EONET when online and links out to the event source. This is an event feed, not a journalistic news feed.
- **Ask ECHO:** the existing evidence-led chat UI remains. Responses are still predefined demo responses, not a live language model.
- **Export:** download a JSON snapshot of the active investigation and selected layers.

## Data and limitations

NASA GIBS provides actual date-specific **MODIS true-colour daily composite imagery**, not high-resolution Sentinel-2 scene products. MODIS native resolution is coarse (about 250–500 m depending on bands); cloud cover, missing daily coverage and composite processing can obscure details. The image layer is useful for broad context, not precise flood boundaries. The selected dates may show little or no useful local detail if coverage is cloudy or missing.

The Nepal flood polygon, Amazon focus-area polygon, rainfall circles, and some investigation points remain **illustrative**. They are not generated from satellite pixels and are not validated flood, damage, rainfall or forest-change results. The app does not run segmentation, change detection, area calculations or operational forecasts. Higher-resolution Sentinel-2/Sentinel-1 analysis would require a proper scene search/download and processing workflow (for example via Copernicus Data Space/STAC); authenticated commercial imagery may require a service account and license.

New investigations are saved in browser local storage only. They are not synced to GitHub, across devices, or across browsers. The EONET feed and imagery rely on external services, so availability and response time may vary. Do not use this prototype for emergency response or operational decisions.

## Sources

- NASA GIBS documentation: https://nasa-gibs.github.io/gibs-api-docs/
- NASA Worldview: https://worldview.earthdata.nasa.gov/
- NASA EONET active events: https://eonet.gsfc.nasa.gov/
- Copernicus Data Space: https://dataspace.copernicus.eu/
- ESA Nepal event report: https://www.esa.int/Applications/Observing_the_Earth/Copernicus/Sentinel-2/Nepal_flash_flood_imaged_by_satellites
- NASA GPM / IMERG: https://gpm.nasa.gov/data/imerg
- Esri World Imagery: https://www.esri.com/en-us/arcgis/products/arcgis-imagery
- Planet Data API documentation: https://docs.planet.com/develop/apis/data/

## Licensing

Third-party libraries, map tiles, imagery and event data remain subject to their respective licenses, terms and attribution requirements.
