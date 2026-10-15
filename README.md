# ECHO — Earth Intelligence for Everyone

An iPad-first, responsive front-end prototype for exploring investigation workflows around Earth-observation data. This iteration improves the map controls, makes the timeline visible and interactive, adds an in-map draggable before/after reveal, and includes a second Amazon forest-change case study.

## Run it

1. Extract the ZIP.
2. Open `index.html` in a browser, or upload all files to the root of a GitHub repository.
3. In GitHub, open **Settings → Pages**, select **Deploy from a branch**, choose `main` and `/ (root)`, then save.
4. Open the published URL on iPad Safari. Use **Share → Add to Home Screen** to install it as a web app shortcut.

The app uses Leaflet, CARTO basemap tiles and Esri World Imagery from external CDNs/services, so an internet connection is needed. There is no build step and no API key required for this demo. English-forward map styling is used where supported; proper place names may remain in their locally established form.

## What works in this prototype

- Pan and zoom the map for two selectable investigations: Nepal flood and Amazon forest-change case study
- Map layer toggles for an English-forward street map, Esri satellite imagery, an illustrative event overlay, investigation points and illustrative rainfall context
- Visible, draggable event timeline with date labels, map movement and playback
- Before/after comparison revealed by a slider directly over the map (no separate tab or modal)
- Expanded right-side investigation report with evidence links, interpretation notes and clickable next-step investigation points
- Evidence-led Ask ECHO panel preserved, with predefined responses and source links
- Exportable JSON investigation snapshot
- Responsive iPad, desktop and mobile layouts

## Important data honesty note

The flood polygon, Amazon focus-area polygon, rainfall circles, and before/after comparison artwork are **illustrative UI demo graphics**. They are not satellite imagery, are not generated from satellite pixels, and are not validated flood or forest-change results. The timeline is a conceptual investigation timeline, not a live archive query. The assistant uses predefined demo responses; it is not connected to a language model or satellite-processing backend. The satellite imagery layer is a third-party basemap, not a specific event's before/after imagery. Do not use this prototype for emergency decisions or operational analysis.

The Nepal report links to ESA's published event context. The Amazon case is a sample workflow only and does not claim that deforestation occurred in the displayed focus areas.

## Suggested next engineering milestone

Connect a real STAC/Copernicus data source, retrieve actual pre-event and post-event scenes, implement reproducible flood/change detection, and replace illustrative geometry with a versioned result recording source scene IDs, acquisition timestamps, processing parameters, validation notes and uncertainty.

## Data links

- ESA Nepal flash-flood report: https://www.esa.int/Applications/Observing_the_Earth/Copernicus/Sentinel-2/Nepal_flash_flood_imaged_by_satellites
- Copernicus Data Space: https://dataspace.copernicus.eu/
- NASA GPM / IMERG: https://gpm.nasa.gov/data/imerg
- Global Forest Watch: https://www.globalforestwatch.org/
- Planet Data API documentation: https://docs.planet.com/develop/apis/data/
- OpenStreetMap attribution and license: https://www.openstreetmap.org/copyright
- CARTO attribution: https://carto.com/attributions
- Esri World Imagery attribution: https://www.esri.com/en-us/legal/terms/full-master-agreement

## License

The original ECHO prototype code is provided for personal experimentation. Third-party map tiles, libraries, imagery and data remain subject to their respective licenses, terms and attribution requirements.
