# ECHO — Earth Intelligence for Everyone

Look into what is happening to a place on Earth, using real NASA satellite imagery and open event data, and stay honest about what the evidence does and does not show.

This repository holds three ways to use ECHO, built on one shared core:

| | Web | Desktop app | Phone app |
| --- | --- | --- | --- |
| For | Any browser, published on GitHub Pages | Windows, macOS, Linux | Android (Google Play) and iOS (App Store) |
| Runs on | Plain web files, no build step | Electron | Capacitor |
| Interface | The map is the whole screen: red pins for live NASA events, a floating search and discovery panel, and a Field Report that opens beside the map (bottom sheets on phones) | Three-pane workspace with menus, keyboard shortcuts and window memory | Map-first screen with a draggable bottom sheet and a bottom tab bar |
| Code | `index.html` and `apps/web` | `apps/desktop` | `apps/mobile` |

**The ECHO website** (the story of the product: mission, how it works, vision) is `website/index.html`, served at https://bandkoconnect-ui.github.io/From-space-for-earth/website/.

**The web app is what GitHub Pages serves** at https://bandkoconnect-ui.github.io/From-space-for-earth/. How to deploy it, which services it uses (none need a key), and its limits are in [docs/WEB_APP.md](docs/WEB_APP.md).

Shared by all three: `packages/core` (investigations, storage, dates, imagery catalogue, event feed, chat, reports; plain JavaScript with unit tests), `packages/map` (the Leaflet map with before/after compare), `packages/ui` (DOM helpers, artwork, common styles).

The original single-page prototype is kept unchanged at `legacy/` (served at `/legacy/`). Its notes are in [docs/PROTOTYPE_NOTES.md](docs/PROTOTYPE_NOTES.md).

## What the apps do

- **Explore**: open an investigation, step through dates, and drag a before/after slider across NASA MODIS / VIIRS true-colour imagery. Optional layers for fires and satellite rainfall estimates.
- **Planet Pulse**: NASA EONET's open natural events (fires, storms, volcanoes, floods) as a list and a map, with one tap to start an investigation from an event.
- **Notes**: pin dated observations on the map. Private to the device.
- **Report**: what is observed, inferred and not known, with an evidence trail and suggested next steps. Export as a Markdown report or back up everything as one JSON file.
- **Accounts** (web app): sign up or log in before the map; three skippable welcome cards after signing up. See [docs/ACCOUNTS.md](docs/ACCOUNTS.md).
- **Ask ECHO**: switched off in the web app for now (it shows "coming soon"). In the desktop and phone apps: built-in research guidance that works offline, or live answers from an AI service you run (see below).
- Works offline for what is already on the device; the last event list is cached.

It is a research aid, not an alerting or mapping product. MODIS and VIIRS imagery is about 250 to 375 m per pixel and clouds hide the ground. Nothing here detects floods or deforestation, and illustrative overlays are labelled as such. Do not use it for emergency response or operational decisions.

## Quick start

You need Node.js 20 or newer.

```
npm install
npm test                 # unit tests (no browser needed)
npm run serve:web        # the web app at http://localhost:5175/ (the same files GitHub Pages serves)
npm run dev:desktop      # try the desktop UI in a browser at http://localhost:5173
npm run dev:mobile       # try the phone UI in a browser at http://localhost:5174 (use the device toolbar of your browser's dev tools)
```

Run the real apps:

```
npm run desktop          # the desktop app in Electron
npm run desktop:dist     # build installers into release/ (builds for the OS you are on)

npm run mobile:setup     # once: creates android/ and ios/ projects, app icons and splash screens
npm run mobile:android   # builds the web part, syncs it, opens Android Studio
npm run mobile:ios       # same for Xcode (needs a Mac)
```

Publishing to the stores is covered step by step in [docs/RELEASING.md](docs/RELEASING.md). Draft store text, a privacy policy and the questionnaire answers are in [`store/`](store/).

## Optional: live AI answers

The apps never contain an AI key. To get live answers, deploy `netlify/functions/echo-chat.js` (it is already configured by `netlify.toml`), set `OPENAI_API_KEY` (or `ANTHROPIC_API_KEY` with `ECHO_PROVIDER=anthropic`) in Netlify's environment variables, then paste the function's address into Settings > AI service address in either app. Without it, Ask ECHO uses its built-in guide and says so. Read the note in `docs/RELEASING.md` about rate limiting before you publish an app that points at your function, because anything the app can call, anyone can call.

## Testing and what has been verified

- `npm test`: 138 unit tests across the shared core, the web app's logic (clustering, search parsing, the Field Report model, day/night, links), the desktop's main-process modules and the phone's native bridge, plus the chat function.
- `python3 tools/e2e/run.py`: 521 browser checks in headless Chromium against the web app (desktop, phone and five other screen sizes, served under the same sub-path GitHub Pages uses) and the built desktop and phone interfaces, with every outside service faked. See [tools/e2e/README.md](tools/e2e/README.md).

These cannot reach the parts that need real devices or real servers: the live NASA, Esri and place-search services, the Electron shell itself (menus, native dialogs, installers), the Capacitor plugins on a real phone, iOS and Android builds, and the live NASA and Esri services. Test those on your own machines using the checklists in `docs/RELEASING.md` and `store/submission-checklist.md` before you publish.

## Project layout

```
index.html           The web app's page (what GitHub Pages serves)
apps/web/            The web app: map, search, sidebar, Field Report, phone sheets
apps/desktop/        Electron main process (main.cjs, preload.cjs, lib/) and the desktop interface (renderer/)
apps/mobile/www/     The phone interface (plain web files that Capacitor wraps)
packages/core/       Shared logic, with tests
packages/map/        Shared map controller (Leaflet)
packages/ui/         Shared DOM helpers, artwork and base styles
vendor/leaflet/      Leaflet 1.9.4 as ES modules (no bundler needed)
scripts/             build.mjs (assembles dist/), serve.mjs (dev server), vendor-leaflet.mjs
resources/           App icon and splash artwork (icon.svg plus the PNGs generated from it)
netlify/functions/   The optional AI proxy
store/               App Store and Google Play text, privacy policy, checklists
tools/e2e/           Browser tests
docs/                WEB_APP.md, ARCHITECTURE.md, RELEASING.md, PROTOTYPE_NOTES.md
legacy/              The original web prototype, unchanged
```

## Data and licences

Imagery and data come from NASA GIBS and NASA EONET (open, attribution requested) and Esri World Imagery (check Esri's terms before publishing a commercial app; see `docs/RELEASING.md`). Map engine: Leaflet (BSD 2-Clause), included in `vendor/leaflet`. ECHO itself is proprietary: **all rights reserved**. The code is public so it can be viewed and served by GitHub Pages, not reused. See [LICENSE](LICENSE).
