# Architecture

## The idea

Three front ends, one brain. Everything that is not about screen size or the operating system lives once, in `packages/`, and every front end imports it. Each has its own interface: the web app is a living-planet map for discovery (responsive, with a separate phone layout), the desktop app is a three-pane workspace, and the phone app is a native-feeling map with tabs.

```
packages/core   logic, no DOM        ← unit-tested in Node
packages/map    Leaflet map controller
packages/ui     DOM helper, artwork, shared actions, base styles
        ▲                 ▲                    ▲
apps/web (+ index.html)   apps/desktop          apps/mobile
GitHub Pages, any browser Electron + desktop UI Capacitor + phone UI
```

There is **no bundler and no runtime npm dependency**. The code is plain ES modules; Leaflet is vendored as ES modules in `vendor/leaflet`. `scripts/build.mjs` copies an app's files plus the three shared packages, Leaflet and `assets/` into `dist/<app>/`. Electron loads `dist/desktop`; Capacitor wraps `dist/mobile`. This keeps builds fast and removes a whole class of tooling breakage. The cost: no TypeScript or tree-shaking. If the code grows enough to want them, add a bundler at `scripts/build.mjs` and nothing else has to change.

## Shared core (`packages/core/src`)

| Module | Job |
| --- | --- |
| `dates`, `geo`, `text` | Date maths (UTC, no time-zone surprises), coordinate parsing and clamping, text helpers (`pluralise(n, 'note')` returns "3 notes" including the number) |
| `gibs` | NASA GIBS WMS catalogue (MODIS Terra and Aqua, VIIRS, fire and rainfall overlays) and tile URL building with the documented `TIME` parameter |
| `eonet`, `feed` | NASA EONET parsing and a feed object with load, cache and find; the last result is cached so Planet Pulse works offline |
| `topics` | Investigation topics, their wording and default evidence sources |
| `investigation`, `seed` | Creating and validating an investigation (`ValidationError`), and the two demo investigations |
| `store` | The one store both apps use. All changes go through it and it emits events (`load`, `add`, `remove`, `update`, `notes`, `settings`, `active`). Persistence is an adapter: `{ get(): Promise<string|null>, set(text): Promise<void> }` |
| `chat`, `session` | Ask ECHO: builds the payload, calls the AI service if one is set, falls back to built-in guidance, keeps the conversation |
| `report` | Markdown report and backup bundle export/import, including hostile-input handling |

The store has no idea where data goes. The desktop gives it a file in the user-data folder; the phone gives it a file in the app's private folder (falling back to Capacitor Preferences, then browser storage in development).

## Shared map (`packages/map/echo-map.js`)

One Leaflet controller used by both apps. It owns the layer stack (satellite base, place names, NASA imagery by date, before/after compare, study-area overlay, points, notes, fires, rainfall), the date, and the compare split. It emits events (`mapclick`, `noteclick`, `eventclick`, `coords`, `moveend`, `tileerror`, `tileok`) and takes a `compact` option for phones (finer zoom steps). The before/after swipe is done with two panes clipped to either side of a split line, so it works with any tile layer.

## Shared UI (`packages/ui`)

`dom.js` builds DOM with `h(tag, attrs, ...children)` and always sets text via `textContent`, so user content (investigation titles, notes, event text) cannot inject markup. `art.js` draws deterministic contour artwork per investigation instead of shipping photographs. `actions.js` holds the shared export / import / "investigate this event" flows, written against a small `platform` interface that each app provides:

```
platform.storage                    { get, set }
platform.openExternal(url)
platform.saveFile({ name, content, mime, filters })
platform.pickFile({ accept, filters })
platform.info()
```

## Web (`index.html`, `apps/web`)

No build step: `index.html` loads `apps/web/app/main.js` as an ES module, which imports the shared packages straight from `packages/` and Leaflet from `vendor/leaflet`. All paths are relative, so the same files work at `/` and under GitHub Pages' `/From-space-for-earth/` sub-path. Routing is in the URL hash (`router.js`), because Pages cannot send every path to one page.

| Module | Job |
| --- | --- |
| `main.js` | Wires everything and owns the one piece of state: the selection, filters, imagery date and panel layout. Every way of choosing something (pin, list, search, link, keyboard) goes through `app.select()`, so the map, the sidebar, the report and the address bar cannot disagree. |
| `atlas.js` | The map, built on the shared `EchoMap`: event pins and clusters, the selected event's track, the searched place, day/night shading, and camera moves that frame the subject in the area not covered by panels (`insets`). Closing a report never moves the camera. |
| `cluster.js` | Screen-space clustering (pure). The newest event leads each cluster; the selected pin is never clustered. |
| `subjects.js` | The Field Report model (pure): turns an EONET event or an investigation into sections, keeping source facts, interpretation and unknowns separate. Also finds hotspots (three or more nearby events of one kind). |
| `sources.js` | Readable names for EONET's reporting organisations, NASA GIBS snapshot URLs, and the near-real-time viewers for a longitude. |
| `geocode.js`, `search.js` | Place search: Photon, then Open-Meteo, plus instant local matches and typed coordinates, in an accessible combobox. |
| `sidebar.js`, `report.js`, `dialogs.js`, `ui.js` | The interface. `sheet.js` turns the sidebar and the report into bottom sheets below 720 px. |
| `terminator.js` | The Sun's position and the night-side polygon (pure). |
| `config.js` | Settings you may change when deploying (event count, search services). Nothing secret. |

The web app stores data under its own browser key (`echo-web-v1`) and reads the same backup format as the other apps.

## Desktop (`apps/desktop`)

- **Main process** (`main.cjs`, CommonJS): creates the window, menus (`lib/menu.cjs`), the `app://echo` protocol (`lib/protocol.cjs`), file storage with atomic writes (`lib/storage.cjs`), remembered window size and position (`lib/window-state.cjs`), and the security rules (`lib/security.cjs`).
- **Preload** (`preload.cjs`): the only bridge; exposes a handful of functions through `contextBridge`.
- **Renderer** (`renderer/`): the desktop interface. Left rail with Home, Explore, Library, Pulse, Ask, Data and Settings; Explore is a three-pane workspace.
- **Security model**: sandboxed renderer, context isolation, no Node in the page, pages load only from `app://echo`, a strict Content-Security-Policy, all permission requests denied, external links open in the system browser (http/https only), IPC accepted only from the app's own pages.

## Phone (`apps/mobile`)

- **No imports from Capacitor.** `app/native.js` reads `window.Capacitor.Plugins` at run time, so there is no bundler step and the same files run in a plain browser in development (where it falls back to browser equivalents).
- **Plugins used**: Filesystem (data file and export cache), Preferences (fallback), Share, Geolocation, Browser, Haptics, Network, App (back button, background), StatusBar, SplashScreen.
- **Interface**:
  - `main.js` boots the app, owns the bottom tab bar, the back-button rules (close sheet, then in-view back, then Explore, then exit), offline bar, and keyboard/viewport handling (`--vvh`, `--vvt` CSS variables from `visualViewport`).
  - `views/explore.js`: the map fills the screen; a draggable three-position bottom sheet (peek, half, full) carries the timeline and the Report / Notes tabs. Floating buttons: compare, add note, my location, home. A pick-on-map mode with a centre crosshair is used when creating an investigation.
  - `views/pulse.js`, `views/saved.js`, `views/ask.js`: the other tabs. `sheets.js` and `ui.js` provide modal bottom sheets, action sheets, confirm/prompt dialogs and toasts.
- **Touch rules**: 44 px minimum targets, 16 px inputs (stops iOS zooming on focus), safe-area insets, no hover-only behaviour.

## Chat service (`netlify/functions/echo-chat.js`)

A small serverless function so the apps never hold a key. It validates and trims the request (size limits, text clamping, history merging), tells the model that the investigation context is data and not instructions, calls OpenAI or Anthropic, and returns `{ reply }`. A best-effort per-IP limiter is built in. It is a starting point; see `docs/RELEASING.md`.

## Conventions worth keeping

- Content-Security-Policy forbids inline styles: set styles through `element.style.x = ...` (the `h()` helper's `style` object does), never with `setAttribute('style', ...)` or `<style>` tags.
- Never put API keys in app code. Anything in an app can be extracted.
- Text goes into the page with `textContent` (the `h()` helper), never `innerHTML`.
- Shared code must not touch `window`, Electron or Capacitor directly; take what it needs as a parameter (see `platform`).
- When changing anything in `packages/`, run `npm test` and `python3 tools/e2e/run.py`, because both apps depend on it.

## Known limits

- The phone interface is designed for portrait. Landscape works but is cramped; lock phones to portrait in the native projects (see the release guide).
- On a phone-width Planet Pulse map, the whole world does not fit at the minimum zoom.
- Imagery and event servers are third parties. Tiles can be missing for a date or covered by cloud; the apps show a banner when tiles fail.
