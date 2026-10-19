# Browser tests

These drive the built apps in headless Chromium with Playwright. They run the real app code, but **all network traffic is faked**: map tiles are solid colours keyed by the requested date (so tests can check which date is on screen by reading pixels), NASA EONET returns three fixed events, and the AI service is a stub. They never touch NASA, Esri or any real server.

What they cover:

| Suite | Checks |
| --- | --- |
| `desktop_explore` | Explore screen: map, timeline, before/after compare, layers, report, Ask ECHO, inspector |
| `desktop_pages` | Home, investigations library, Planet Pulse, settings, backup/import, about, keyboard use |
| `desktop_offline` | Offline and failure behaviour: cached events, imagery failure banner |
| `phone_explore` | Phone Explore: bottom sheet snaps and drag, compare slider, timeline, pin mode, notes, back button |
| `phone_pages` | Phone sheets and tabs: new investigation, location, Pulse, Saved, Ask, Settings, back and Escape |
| `phone_native` | The phone app with a fake `window.Capacitor`: file storage and backup, share, geolocation, back button |
| `phone_sizes` | Six screen sizes (320x568 up to a tablet and landscape): no overflow, controls reachable |

What they do **not** cover: the real Electron shell (menus, native dialogs, packaging), the real Capacitor plugins, iOS or Android, real map servers, or an iPhone keyboard. Test those on a device (see `docs/RELEASING.md`).

## Run

```
pip install playwright pillow
playwright install chromium
python3 tools/e2e/run.py            # everything
python3 tools/e2e/run.py phone      # only the phone app
```

Each suite prints PASS/FAIL per check and exits non-zero on any failure or any console error. Screenshots are written to `tools/e2e/out/`.

The unit tests (`npm test`) need only Node 20+.
