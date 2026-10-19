# Notes from the original web prototype (v3.1 to v5)

These are the notes that used to be the project README. They describe the single-page web prototype that still lives in the repository root (`index.html`, `app.js`, `styles.css`) and is still what GitHub Pages and Netlify publish. The desktop and phone apps replace it as the product; see the main [README](../README.md).

Note: the prototype's community mock-up (featured note, threads, campfire chat) and its Nepal demo text predate the apps. In the apps, the community mock-up is replaced by private notes plus Planet Pulse, and the Nepal demo is rewritten around what ESA actually reported.

---

An iPad-first, responsive Earth-observation investigation prototype. This version preserves the v3 investigation workflow and adds a separated Dashboard / My investigations navigation, hides the map layers and field report while browsing dashboard views, lists Planet Labs as a data source, and repairs the in-map NASA imagery comparison.

## Run / publish

1. Extract the ZIP.
2. Upload the contents of this folder to the root of a GitHub repository (replace the prior `index.html`, `styles.css`, `app.js`, and `README.md`).
3. In GitHub, open **Settings → Pages**, select **Deploy from a branch**, choose `main` and `/(root)`, then save.
4. Open the published URL in iPad Safari. Use **Share → Add to Home Screen** to install the web app shortcut.

No build step or API key is required. The app needs an internet connection for Leaflet, Esri satellite tiles, NASA GIBS imagery and the NASA EONET feed.

## What changed in v3.1

- **NASA comparison repair:** the before/after layers now use NASA GIBS WMS with its documented TIME parameter. The comparison controls are transparent across the map so they no longer cover the imagery with an opaque card. The before side uses the first investigation date; the after side follows the timeline selection. Moving the date slider changes the requested imagery date only and does not pan or zoom the map.
- **Satellite-first map:** the English street-map layer has been removed from the layer picker. Esri World Imagery is the default basemap.
- **Dashboard navigation:** click the top-left ECHO mark for the full dashboard (investigations, summary and Planet Pulse). Click the bookmark/investigations icon for a focused My investigations view. Both dashboard views hide the map-layer sidebar and field report. The data-source summary includes NASA, Esri and Planet Labs; Planet imagery is commercial and requires appropriate access/licensing.
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


## Known limits

- NASA GIBS imagery is served online and may be unavailable for a specific date, tile or region; clouds and missing observations can occur. The comparison uses MODIS Terra imagery, which is coarse compared with Sentinel-2 or commercial Planet imagery.
- Planet Labs is listed as a potential source, but this static GitHub Pages app is not connected to a Planet API or account.
- The flood and forest polygons remain illustrative. No verified flood delineation, deforestation detection, or live AI analysis is performed.

## ECHO v5 — visual polish, community preview and chat upgrade

- **Editorial investigation imagery:** investigation cards and the sidebar use real Unsplash-hosted photography with dark overlays for readable labels. Images are remotely hosted and need an internet connection.
- **Community preview:** added a featured field note, discussion threads, a campfire-style chat panel, and a small interactive local reply demo. This is a visual/product prototype only: messages are not public, persisted, moderated, or synced to a community server.
- **Ask ECHO is now conversation-aware:** the front-end preserves recent turns, uses the active investigation/date context, responds to more question types, shows a thinking state, and provides varied fallback guidance instead of returning the same canned answer every time.
- **Optional live AI chat:** a secure Netlify Function (`netlify/functions/echo-chat.js`) proxies chat requests to the OpenAI Responses API. The API key stays server-side and is never embedded in browser JavaScript.

### Enable live AI chat

GitHub Pages is static hosting and cannot run the included serverless function. On GitHub Pages, Ask ECHO falls back to contextual research guidance. To enable genuine model-generated responses:

1. Deploy this folder as a site on Netlify (the included `netlify.toml` configures the site root and function folder).
2. In Netlify site settings, add an environment variable named `OPENAI_API_KEY` with your own API key. Optionally set `OPENAI_MODEL` to a model available to your account; the default is `gpt-4.1-mini`.
3. Redeploy the site. Test Ask ECHO and check that its footer says **Live AI connected** after the first successful response.
4. Never place an API key in `app.js`, HTML, GitHub commits, or local browser storage. The AI provider may charge usage fees; review account limits and privacy terms.

The chat uses the current investigation title, topic, selected date, caveats and evidence links as context. It does not independently fetch or analyze satellite pixels; answers should be checked against source data.

### Community preview limitations

Community content is sample content designed to demonstrate the experience. The chat sends a simulated in-browser response and is not a real public room. A production community would need user accounts, a database/realtime service, moderation/reporting, privacy controls and abuse prevention.

### Images

Photography is hotlinked from `images.unsplash.com`; image availability depends on Unsplash's image hosting and internet connectivity. The images are illustrative editorial photography, not evidence or satellite observations. For an app using the official Unsplash API, follow its API hotlinking and attribution requirements.


## ECHO interface correction (v6)

- Community is a dedicated page opened from the new Community icon in the left rail. It is not shown anywhere on the dashboard.
- Investigation cards, sidebar thumbnails and the featured Community image use Unsplash photography when available. Local PNG terrain illustrations are used automatically if a remote image cannot load, so these image areas never remain blank. The local illustrations are visual fallbacks, not satellite evidence.
- Existing map, timeline, layer controls, investigation selection, export and Ask ECHO flows are retained.
- Community conversations are still a local interaction preview, not a shared real-time network.

For the next product phase, persistent cross-device investigations require an authenticated backend and database; actual change analysis requires a processing pipeline built around licensed/accessible source scenes, quality masks and validation; a connected community requires accounts, shared storage/realtime messaging, reporting/moderation and privacy controls. These are not enabled by this interface-only update.
