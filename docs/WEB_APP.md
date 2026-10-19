# ECHO on the web (GitHub Pages)

The web app is the page at the root of this repository (`index.html`). GitHub Pages serves it exactly as it is: no build step, no server, no API keys.

Live address once deployed: https://bandkoconnect-ui.github.io/From-space-for-earth/

## What it is

- **The map is the product.** It opens on the whole planet, framed beside the panels and centred on your part of the world (guessed from your time zone, so no permission is needed). The night side of Earth is shaded, calculated on the device from the Sun's position.
- **Red pins** are open natural events from NASA EONET. Nearby pins merge into clusters with a count; a click zooms in until they separate, and events at the very same spot offer a list instead. Events updated in the last two days pulse gently (not when reduced motion is on). Mint rings are investigations: the case studies and your own.
- **Left panel:** search, *New developments* (newest first, filter by kind), and *Places worth investigating*: clusters of real activity found in the feed, the case studies, and your saved investigations. It collapses to a small button.
- **Field Report** (right panel; a bottom sheet on phones): overview, event window, evidence (NASA satellite images for the event's dates plus the source reports), trials and analysis, interpretation (sources, possible meaning and unknowns kept apart), investigation points with your notes, live visuals, and Ask ECHO.
- **Phones** get their own layout: a map-first screen with a draggable search sheet, and the report as a second sheet with three heights. Touch targets are at least 40 px, the search field is 16 px so iOS does not zoom, and the sheet sizes itself around the on-screen keyboard.
- **The address bar follows the map**: `#event=EONET_1234` or `#inv=demo-nepal` plus the view, so a copied link (or the Share button) opens the same report.

Everything from the earlier prototype is kept: investigations, NASA before/after comparison, date stepping, NASA fire and rainfall layers, notes, Markdown export, JSON backup and import, Ask ECHO, settings and About the data. The old single-page prototype itself is kept, unchanged, at `/legacy/`.

## Deploy to GitHub Pages

The repository's Pages setting stays as it is: **Settings → Pages → Deploy from a branch → `main` / `(root)`**.

### Easiest: push with git

If you have git (or GitHub Desktop), copy the project into your local clone of the repository, commit and push to `main`. With the command line, from the unzipped project folder:

```
git init -b main
git remote add origin https://github.com/bandkoconnect-ui/From-space-for-earth.git
git fetch origin
git reset --soft origin/main
git add -A
git commit -m "ECHO: living-planet web app, desktop and phone apps"
git push origin main
```

(Or ask Claude to push it for you: that needs you to approve GitHub write access for this repository.)

### Or: upload in the browser

GitHub's web uploader accepts at most 100 files per upload, and this project has about 220. On the repository page choose **Add file → Upload files** and upload in three batches, dragging these folders and files from the unzipped project:

1. the `vendor` folder (93 files)
2. the `apps` and `packages` folders (74 files)
3. everything else: `assets`, `docs`, `legacy`, `netlify`, `resources`, `scripts`, `store`, `tools`, `index.html`, `manifest.webmanifest`, `package.json`, `netlify.toml`, `capacitor.config.json`, `README.md`, `.nojekyll`, `.gitignore`

Before the first batch, delete the old `app.js`, `styles.css` and the three `*-fallback.png` files from the repository root; they now live in `legacy/`. Files whose names start with a dot can be hidden in Finder (press Cmd+Shift+. to show them). `.nojekyll` is optional but makes Pages publish faster.

Pages updates a minute or two after the last commit. Open the address above and hard-refresh (Shift + reload) once.

### Check it worked

- The page opens straight onto the map with red pins and the left panel. The status line reads "Live from NASA EONET, checked HH:MM".
- Search for a city: suggestions appear as you type.
- Click a pin: the Field Report opens on the right, and its satellite thumbnails load.
- If the pins or the thumbnails do not appear, open the browser console (F12). A blocked request names the service that failed.

## Outside services (no keys needed)

| Service | Used for | Key | Notes |
| --- | --- | --- | --- |
| NASA EONET | Open natural events (the pins) | None | Free. A curated feed, can be delayed or incomplete. The last result is kept in the browser for offline use. |
| NASA GIBS | Imagery by date (map layers and report thumbnails), fire and rainfall layers | None | Free, attribution shown. Daily composites, about 250 m per pixel, can be cloudy or missing for a day. |
| Esri World Imagery and World Boundaries and Places | Base satellite map and place names | None | Check Esri's terms before any commercial use (see `docs/RELEASING.md`). |
| Photon (komoot), OpenStreetMap data | Place search (first choice) | None | Shared public server with fair-use limits: reasonable use is welcome, heavy use is throttled, with no guarantee of availability. |
| Open-Meteo Geocoding, GeoNames data | Place search (fallback) | None | Free for non-commercial use; commercial use needs an Open-Meteo API key and plan. |

The search order and the Photon address are in `apps/web/app/config.js`. If ECHO grows past fair use, run your own Photon server (it is open source) or switch to a paid geocoder, and put its address there. **A key placed in this page is public**: anyone can read it. If a provider needs a key in the browser, use one it lets you restrict to your site's address (an HTTP referrer restriction), or put the key behind a small server of your own, as is done for Ask ECHO.

### Live answers in Ask ECHO (optional)

GitHub Pages cannot run server code, so the AI proxy runs on Netlify:

1. Create a free Netlify site from this repository (it reads `netlify.toml`).
2. In Netlify **Site configuration → Environment variables**, set `OPENAI_API_KEY` (or `ANTHROPIC_API_KEY` and `ECHO_PROVIDER=anthropic`).
3. Set `ECHO_ALLOWED_ORIGINS` to `https://bandkoconnect-ui.github.io`, so only your page can call it from a browser.
4. In ECHO, open **Settings** and paste the function's address: `https://<your-netlify-site>.netlify.app/.netlify/functions/echo-chat`. Use **Test connection**.

Without this, Ask ECHO uses its built-in research guide and says so. Read the rate-limit and spending-cap advice in `docs/RELEASING.md` before you share a page that points at your function.

## Where your data lives

Saved investigations, notes and settings are stored in the browser's local storage on that device (key `echo-web-v1`). They are not uploaded anywhere. Clearing site data deletes them, so use **Settings → Export a backup**. The desktop and phone apps can import the same backup file.

## Limits and what needs a real data provider

- **Flat map, not a 3D globe.** The map uses Leaflet (Web Mercator), which shows the planet as a flat map that wraps east to west. A spinning 3D globe like Apple Maps needs a WebGL map engine such as MapLibre GL (version 5 has a globe view). It could not be downloaded or tested in the environment this was built in, so it is a candidate next step: the map is isolated in `apps/web/app/atlas.js`, and the rest of the app talks to it through a small interface.
- **Events are only what NASA EONET lists.** There are no news, social or sensor feeds, and nothing is invented. When the feed is unreachable and nothing is cached, ECHO says so and shows only the case studies.
- **No live video.** *Live visuals* lists real near-real-time satellite viewers (CIRA SLIDER for GOES, Meteosat or Himawari depending on longitude; NOAA's GOES viewer in the Americas; NASA FIRMS for fires; NASA Worldview). They open on those sites. No webcam or stream is claimed because none is verified for arbitrary places. Connecting verified webcams would need a curated source list per location.
- **No measurements.** ECHO does not map burn scars, flood extents or damage. The report says so in *Trials and analysis*. The interpretation text is general guidance for each kind of event and is labelled that way.
- **Place names in event titles** come from the source (for example "Fire X, Oregon"). Reports for events without a place in their title show coordinates.
- **Not verified from the build environment:** the real NASA, Esri, Photon and Open-Meteo services, and real iPhone and Android keyboards. The browser tests replace every outside service with a stand-in (see `tools/e2e/README.md`). After deploying, run the checks above on a real phone and computer.
