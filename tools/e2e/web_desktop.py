"""The web app on a desktop browser (1440 x 900): map, pins, sidebar, search, Field Report."""
import asyncio, json, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from web_helpers import *
from playwright.async_api import async_playwright

STATE = "window.__echo.state"

async def view(page):
    return await page.evaluate("(() => { const a = window.__echo.atlas; const c = a.map.getCenter(); return { lat: c.lat, lng: c.lng, zoom: a.map.getZoom() }; })()")

async def settle(page, ms=1700):
    await page.wait_for_timeout(ms)

async def main():
    srv, port = serve_root()
    log, problems = [], []
    async with async_playwright() as p:
        b, ctx, page = await open_web(p, port, log, problems)
        await settle(page, 900)

        # ---- opens straight onto the map ----
        m = await rect(page, "#map")
        check("D1 the map fills the window", m["w"] == 1440 and m["h"] == 900, m)
        check("D2 no dashboard or welcome screen", await page.evaluate("!document.querySelector('.dashboard, .welcome, .home')"))
        check("D3 sidebar is the only panel at start", await page.is_visible(".sidebar") and await page.is_hidden(".report"))
        v0 = await view(page)
        check("D4 starts on a whole-world view", v0["zoom"] <= 3, v0)
        check("D5 status says the data is live and when it was checked", "Live from NASA EONET" in await page.inner_text(".sb-status") and "14:00" in await page.inner_text(".sb-status"))

        # ---- pins and clusters ----
        singles = await page.evaluate("document.querySelectorAll('.pin:not(.pin-cluster):not(.pin-inv):not(.pin-place)').length")
        clusters = await page.evaluate("[...document.querySelectorAll('.pin-cluster')].map(el => +el.textContent)")
        check("D6 every event is a pin or inside a cluster", singles + sum(clusters) == 12, (singles, clusters))
        check("D7 nearby events cluster at world zoom", len(clusters) >= 1 and max(clusters) >= 2, clusters)
        check("D8 recently updated events pulse", await page.evaluate("document.querySelectorAll('.pin.is-recent').length") >= 3)
        check("D9 case studies have their own (mint) pins", await page.evaluate("document.querySelectorAll('.pin-inv').length") == 2)
        check("D10 pins are labelled buttons", await page.evaluate("[...document.querySelectorAll('.pin:not(.pin-place)')].every(el => el.getAttribute('role') === 'button' && el.getAttribute('aria-label'))"))

        # cluster click zooms in and splits
        z_before = (await view(page))["zoom"]
        biggest = await page.evaluate("(() => { const els = [...document.querySelectorAll('.pin-cluster')]; els.sort((a, b) => +b.textContent - +a.textContent); return els[0].getAttribute('aria-label'); })()")
        await page.click(f".pin-cluster[aria-label='{biggest}']")
        await settle(page)
        v1 = await view(page)
        check("D11 clicking a cluster zooms in", v1["zoom"] > z_before, (z_before, v1))
        await page.screenshot(path="web-d-cluster-zoom.png")

        # ---- select from the list ----
        await page.click(".dev-item[data-id='EONET_1']")
        await settle(page)
        await page.wait_for_selector(".pin.is-selected", timeout=4000)
        check("D12 a development opens its Field Report", await page.is_visible(".report") and "Wildfire Alpha" in await page.inner_text(".report-title"))
        check("D13 the list item is marked current", await page.get_attribute(".dev-item[data-id='EONET_1']", "aria-current") == "true")
        sel = await page.evaluate("(() => { const el = document.querySelector('.pin[data-id=\"EONET_1\"]'); return el ? el.classList.contains('is-selected') : null; })()")
        check("D14 the selected pin looks selected", sel is True, sel)
        pin = await rect(page, ".pin[data-id='EONET_1']")
        side = await rect(page, ".sidebar")
        rep = await rect(page, ".report")
        check("D15 the event sits in the clear area between the panels", side["r"] < pin["cx"] < rep["x"], (side["r"], pin["cx"], rep["x"]))
        check("D16 others dim while one is selected", await page.evaluate("document.querySelector('#map').classList.contains('has-selection')"))
        check("D17 the address bar names the event", "event=EONET_1" in page.url, page.url)
        names = await page.evaluate("[...document.querySelectorAll('.rs-title')].map(e => e.textContent)")
        check("D18 the report has every section", names == ['Overview', 'Event window', 'Evidence', 'Trials and analysis', 'Interpretation', 'Investigation points', 'Live visuals', 'Ask ECHO'], names)
        check("D19 the event window shows began, updates and latest", await page.evaluate("['win-context','win-start','win-update','win-latest'].every(c => document.querySelector('.win-item.' + c))"))
        check("D20 the size trend is drawn from the reports", await page.is_visible(".spark"))
        txt = await page.inner_text(".report-body")
        check("D21 verified facts and interpretation are labelled apart", "What the sources show" in txt and "What it may mean" in txt and "General guidance for wildfires" in txt)
        check("D22 no live camera is claimed", "No verified live camera" in txt and "webcam" not in txt.lower())
        check("D23 the right satellite viewer for Portugal is offered", "Meteosat geostationary loop" in txt)
        shots = [l for l in log if l[0] == "gibs" and l[3] == "GetMap" and "BBOX=" in l[4] and "WIDTH=320" in l[4]]
        check("D24 evidence thumbnails are real NASA GIBS images for the event's dates", {s[1] for s in shots} >= {"2026-09-30", "2026-10-10", "2026-10-18"}, sorted({s[1] for s in shots}))
        await page.screenshot(path="web-d-report.png")

        # switch to another event from the map: the same panel updates
        v_sel = await view(page)
        await page.evaluate("window.__echo.app.select({ kind: 'event', id: 'EONET_3' }, { source: 'map', fly: false })")
        await settle(page, 500)
        check("D25 selecting another event updates the one report", await page.evaluate("document.querySelectorAll('.report').length") == 1 and "Mount Gamma" in await page.inner_text(".report-title"))
        check("D26 the old pin is no longer selected", await page.evaluate("!document.querySelector('.pin[data-id=\"EONET_1\"].is-selected')"))

        # close keeps the camera exactly where it was
        before_close = await view(page)
        await page.click(".report-close")
        await settle(page, 600)
        after_close = await view(page)
        check("D27 closing the report hides it", await page.is_hidden(".report"))
        check("D28 closing does not move the map", abs(before_close["lat"] - after_close["lat"]) < 1e-9 and abs(before_close["lng"] - after_close["lng"]) < 1e-9 and before_close["zoom"] == after_close["zoom"], (before_close, after_close))
        check("D29 no pin stays selected after closing", await page.evaluate("!document.querySelector('.pin.is-selected')"))
        check("D30 the address bar drops the selection", "event=" not in page.url, page.url)

        # click the pin again: the report comes back
        await page.evaluate("window.__echo.atlas.flyTo([-0.2, -78.4], 6, { animate: false })")
        await settle(page, 400)
        await page.click(".pin[data-id='EONET_3']")
        await settle(page, 900)
        check("D31 clicking a pin opens its report", await page.is_visible(".report") and "Mount Gamma" in await page.inner_text(".report-title"))
        check("D32 a single-report event has no fake trend", "does not report a size" in await page.inner_text(".report-body"))
        await page.keyboard.press("Escape")
        await settle(page, 400)
        check("D33 Escape closes the report", await page.is_hidden(".report"))

        # overlapping events at one spot: a chooser
        await page.evaluate("window.__echo.atlas.flyTo([39.1, -122.8], 14, { animate: false })")
        await settle(page, 500)
        twin = await page.evaluate("[...document.querySelectorAll('.pin-cluster')].map(e => e.textContent)")
        check("D34 two events at the same spot stay grouped up close", twin == ["2"], twin)
        await page.click(".pin-cluster")
        await settle(page, 500)
        check("D35 the group offers a choice instead of zooming forever", await page.is_visible(".chooser") and await page.locator(".chooser button").count() == 2)
        await page.click(".chooser button >> nth=1")
        await settle(page, 900)
        check("D36 choosing opens that event", "Twin Fire" in await page.inner_text(".report-title"))
        await page.click(".report-close")

        # ---- search ----
        await page.keyboard.press("/")
        check("D37 / focuses search", await page.evaluate("document.activeElement.id === 'search-input'"))
        check("D38 empty search offers suggestions", await page.is_visible(".search-results") and "Try" in await page.inner_text(".search-results"))
        await page.keyboard.type("kath")
        await page.wait_for_selector(".search-option:has-text('Kathmandu')", timeout=4000)
        check("D39 places appear as you type", "Bagmati, Nepal" in await page.inner_text(".search-results"))
        await page.keyboard.press("ArrowDown")
        check("D40 arrow keys move through results", await page.get_attribute("#search-input", "aria-activedescendant") == "search-opt-0")
        await page.keyboard.press("Enter")
        await settle(page, 2000)
        v = await view(page)
        check("D41 choosing a place flies there", abs(v["lat"] - 27.7) < 1.5 and abs(((v["lng"] - 85.3 + 540) % 360) - 180) < 3, v)
        card = await rect(page, ".place-card")
        check("D42 a place without events says so and offers to investigate", card and card["x"] > (await rect(page, ".sidebar"))["r"] and 0 <= card["y"] and card["b"] <= 900 and "no open events" in (await page.inner_text(".place-card")).lower(), card)
        check("D43 no event is invented for that place", await page.is_hidden(".report"))
        check("D44 the place is marked on the map", await page.evaluate("!!document.querySelector('.pin-place')"))

        await page.fill("#search-input", "")
        await page.type("#search-input", "oregon")
        await page.wait_for_selector(".search-option:has-text('Oregon')", timeout=4000)
        await page.click(".search-option:has-text('United States')")
        await settle(page, 1800)
        chip = await page.inner_text(".area-chip")
        check("D45 a region with several events filters the list", "4 developments in Oregon" in chip, chip)
        check("D46 the list shows only those", await page.locator(".dev-item").count() == 4)
        check("D47 their pins are highlighted", await page.evaluate("document.querySelectorAll('.pin.is-highlight').length") >= 1)
        await page.click(".area-chip .icon-button")
        check("D48 the area filter can be cleared", await page.locator(".dev-item").count() == 12)

        await page.fill("#search-input", "")
        await page.type("#search-input", "portugal")
        await page.wait_for_selector(".search-option:has-text('Portugal') >> nth=0", timeout=4000)
        await page.keyboard.press("Enter")
        await settle(page, 1800)
        check("D49 a country with one event opens its report", await page.is_visible(".report") and "Wildfire Alpha" in await page.inner_text(".report-title"))
        await page.click(".report-close")

        await page.fill("#search-input", "")
        await page.type("#search-input", "gamma")
        await page.wait_for_selector(".search-option.is-event", timeout=3000)
        await page.click(".search-option.is-event")
        await settle(page)
        check("D50 events match by name in search", "Mount Gamma" in await page.inner_text(".report-title"))
        await page.click(".report-close")

        await page.fill("#search-input", "")
        await page.type("#search-input", "27.7172, 85.3240")
        await page.wait_for_selector(".search-option:has-text('27.7172')", timeout=3000)
        check("D51 typed coordinates are understood", True)
        await page.keyboard.press("Escape")
        await page.keyboard.press("Escape")
        check("D52 Escape closes then clears search", await page.input_value("#search-input") == "")

        # ---- sidebar collapse ----
        await page.click(".sb-collapse")
        await settle(page, 300)
        check("D53 the sidebar collapses", await page.is_hidden(".sidebar") and await page.is_visible(".reopen"))
        check("D54 a collapsed sidebar frees the map", await page.evaluate("getComputedStyle(document.querySelector('.app')).getPropertyValue('--inset-left')") == "0px")
        await page.click(".reopen")
        check("D55 it reopens", await page.is_visible(".sidebar"))

        # ---- filters, hotspots ----
        await page.click(".chip:has-text('Wildfires')")
        await settle(page, 300)
        cats = await page.evaluate("[...document.querySelectorAll('.dev-cat')].map(e => e.textContent)")
        check("D56 a category filter narrows the list", cats and all(c == "Wildfires" for c in cats), cats)
        await page.evaluate("window.__echo.atlas.goWorld({ animate: false })")
        await settle(page, 400)
        visible_ids = await page.evaluate("[...document.querySelectorAll('.pin[data-id]:not(.pin-inv)')].map(e => e.dataset.id)")
        check("D57 and hides other kinds of pin", "EONET_2" not in visible_ids and "EONET_3" not in visible_ids, visible_ids)
        await page.click(".chip:has-text('All')")
        hot = await page.inner_text(".places")
        check("D58 clusters of real activity are suggested", "4 wildfires in Oregon" in hot, hot[:200])
        await page.click(".place-item:has-text('4 wildfires in Oregon')")
        await settle(page)
        check("D59 a cluster shows its events", "4 developments in Oregon" in await page.inner_text(".area-chip"))
        await page.click(".area-chip .icon-button")

        # ---- case study: compare, imagery, layers ----
        await page.click(".place-item:has-text('Glacier flash flood')")
        await settle(page)
        check("D60 a case study opens as a report", "Glacier flash flood" in await page.inner_text(".report-title") and "Case study" in await page.inner_text(".report-kicker"))
        check("D61 its investigation points are listed", await page.locator(".pt-item").count() == 5)
        log.clear()
        await page.click(".report-actions .pill-button:has-text('Compare')")
        await settle(page, 1200)
        check("D62 compare shows a divider and both dates", await page.is_visible(".compare-handle") and "12 Aug" in await page.inner_text(".compare") and "27 Aug" in await page.inner_text(".compare") and "12 August 2026 | 27 August 2026" in await page.inner_text(".imagery-badge"))
        times = {l[1] for l in log if l[0] == "gibs" and l[3] == "GetMap" and "WIDTH=320" not in l[4] and "WIDTH=1200" not in l[4]}
        check("D63 compare loads NASA imagery for both dates", {"2026-08-12", "2026-08-27"} <= times, times)
        h0 = await rect(page, ".compare-handle")
        await drag(page, h0["cx"], h0["cy"], h0["cx"] - 200, h0["cy"])
        h1 = await rect(page, ".compare-handle")
        check("D64 the divider drags", h1["cx"] < h0["cx"] - 150, (h0["cx"], h1["cx"]))
        clip = await page.evaluate("document.querySelector('.leaflet-compareBefore-pane .leaflet-layer')?.style.clipPath || ''")
        check("D65 the map imagery is clipped at the divider", "polygon" in clip, clip[:60])
        await page.screenshot(path="web-d-compare.png")
        await page.keyboard.press("Escape")
        check("D66 Escape closes the comparison first", await page.is_hidden(".compare") and await page.is_visible(".report"))
        log.clear()
        await page.click(".rs-title:has-text('Event window') ~ label.switch-row")
        await page.click(".win-item >> nth=0 >> .win-button")
        await settle(page, 1000)
        times = {l[1] for l in log if l[0] == "gibs" and l[3] == "GetMap" and "BBOX=" in l[4] and "WIDTH=256" in l[4]} | {l[1] for l in log if l[0] == "gibs" and "width=256" in l[4]}
        check("D67 NASA imagery follows the chosen date", "2026-08-12" in times, times)
        check("D68 a badge says which date the imagery shows", "12 August 2026" in await page.inner_text(".imagery-badge") and "not live" in await page.inner_text(".imagery-badge"))
        log.clear()
        await page.click(".an-item:has-text('Thermal anomalies') .switch-row")
        await settle(page, 900)
        check("D69 analysis layers load for the chosen date", any(l[0] == "gibs" and "Thermal" in l[2] and l[1] == "2026-08-12" for l in log))
        await page.click(".an-item:has-text('Thermal anomalies') .switch-row")
        await page.click(".report-close")
        check("D70 closing a report switches its imagery off", await page.evaluate("!window.__echo.atlas.echo.compareAfter && !window.__echo.atlas.echo.compareBefore"))

        # ---- save an event, notes, export, ask ----
        await page.click(".dev-item[data-id='EONET_1']")
        await settle(page)
        await page.click(".report-actions .pill-button:has-text('Save')")
        await settle(page, 400)
        check("D71 an event can be saved", await page.is_visible(".report-actions .pill-button.is-done"))
        check("D72 it appears under Yours", "Wildfire Alpha" in await page.inner_text(".place-group:has(h3:text('Yours'))"))
        await page.fill(".note-input", "Smoke visible over the valley on 18 Oct.")
        await page.click(".note-form .check-row input")  # do not pin
        await page.click(".note-form button[type=submit]")
        await settle(page, 400)
        check("D73 a note is saved with the event", "Smoke visible" in await page.inner_text(".note-list"))
        await page.fill(".note-input", "Burn scar edge here.")
        await page.click(".note-form button[type=submit]")
        await page.wait_for_selector(".pick-bar", timeout=2000)
        m = await rect(page, "#map")
        await page.mouse.click(700, 450)
        await settle(page, 500)
        check("D74 a note can be pinned on the map", await page.evaluate("document.querySelectorAll('.echo-note-pin').length") == 1 and "On the map" in await page.inner_text(".note-list"))
        async with page.expect_download() as dl:
            await page.click(".report-actions .pill-button:has-text('Export')")
        d = await dl.value
        path = await d.path()
        md = open(path).read()
        check("D75 export downloads a Markdown field report with the notes", d.suggested_filename.endswith(".md") and "Smoke visible" in md, d.suggested_filename)
        await page.click(".rs:has(.rs-title:text('Ask ECHO')) .chip >> nth=0")
        await page.wait_for_selector(".toast:has-text('Ask ECHO will be here soon')", timeout=3000)
        check("D76 Ask ECHO is switched off and says it is coming soon", await page.locator(".msg-assistant").count() == 0 and await page.is_visible(".rs:has(.rs-title:text('Ask ECHO')) .tag-soon"))

        # ---- investigate a place ----
        await page.click(".report-close")
        await page.click(".add-place")
        await page.wait_for_selector(".pick-bar")
        check("D77 investigating starts with a crosshair", await page.is_visible(".pick-cross"))
        await page.click(".pick-bar .btn-primary")
        await page.wait_for_selector("dialog.modal[open]")
        await page.fill("dialog input[aria-label='Name']", "Lake levels test")
        await page.click("dialog .btn-primary")
        await settle(page)
        check("D78 the new investigation opens as a report", "Lake levels test" in await page.inner_text(".report-title") and "Your investigation" in await page.inner_text(".report-kicker"))
        check("D79 it has a dashed mint pin", await page.evaluate("!!document.querySelector('.pin-inv.is-mine')"))

        # ---- persistence: reload with the address ----
        await page.reload()
        await page.wait_for_selector(".app.is-ready")
        await settle(page, 1200)
        check("D80 a reload brings the same report back", await page.is_visible(".report") and "Lake levels test" in await page.inner_text(".report-title"))
        check("D81 saved items survive a reload", "Wildfire Alpha" in await page.inner_text(".place-group:has(h3:text('Yours'))"))
        await page.click(".report-actions .pill-button:has-text('Delete')")
        await page.click("dialog .btn-danger")
        await settle(page, 400)
        check("D82 deleting closes the report", await page.is_hidden(".report") and "Lake levels test" not in await page.inner_text(".places"))

        # ---- settings and about ----
        await page.click(".sb-foot button:has-text('Settings')")
        await page.wait_for_selector("dialog[open]")
        await page.click("dialog .switch-row:has-text('Place names')")
        await page.click("dialog .btn-primary")
        await settle(page, 300)
        check("D83 place names can be turned off", await page.evaluate("!window.__echo.atlas.map.hasLayer(window.__echo.atlas.echo.labelsLayer)"))
        await page.click(".sb-foot button:has-text('About the data')")
        await page.wait_for_selector("dialog[open]")
        check("D84 About the data explains search and day/night", "Photon" in await page.inner_text("dialog") and "Sun is down" in await page.inner_text("dialog"))
        await page.keyboard.press("Escape")
        check("D85 Escape closes dialogs", await page.evaluate("!document.querySelector('dialog[open]')"))

        # ---- map controls ----
        z = (await view(page))["zoom"]
        await page.click(".ctrl[aria-label='Zoom in']")
        await settle(page, 600)
        check("D86 zoom in works", (await view(page))["zoom"] > z)
        await page.click(".ctrl[aria-label='Show the whole world']")
        await settle(page, 1900)
        check("D87 the world button returns to the planet", (await view(page))["zoom"] <= 3)
        await page.click(".ctrl[aria-label='Map layers']")
        check("D88 the layers menu opens", await page.is_visible(".layers-pop"))
        await page.click(".layers-pop .switch-row:has-text('Day and night')")
        check("D89 day and night can be switched off", await page.evaluate("window.__echo.atlas.nightLayer.getLayers().length === 0"))
        await page.keyboard.press("Escape")
        check("D90 Escape closes the layers menu", await page.is_hidden(".layers-pop"))

        blocked = [l for l in log if l[0] == "blocked"]
        check("D91 nothing tried to reach an unexpected server", not blocked, blocked[:3])
        await b.close()

        # ---- offline with nothing cached: no invented events ----
        b, ctx, page = await open_web(p, port, log, problems, eonet="fail")
        await settle(page, 800)
        check("D92 an unreachable feed is stated plainly", "unreachable" in await page.inner_text(".sb-status"))
        check("D93 no events are invented when the feed is down", await page.evaluate("document.querySelectorAll('.pin:not(.pin-inv)').length") == 0)
        check("D94 case studies still work offline", await page.locator(".place-item:has-text('Glacier flash flood')").count() == 1)
        await b.close()

        # ---- search service down: Photon fails, Open-Meteo answers; both down: honest message ----
        b, ctx, page = await open_web(p, port, log, problems, geocode="photon-fail")
        await page.type("#search-input", "kathmandu")
        await page.wait_for_selector(".search-option:has-text('Kathmandu')", timeout=8000)
        check("D95 search falls back to a second service", "Open-Meteo" in await page.inner_text(".search-results"))
        await b.close()
        b, ctx, page = await open_web(p, port, log, problems, geocode="fail")
        await page.type("#search-input", "kathmandu")
        await page.wait_for_selector(".search-note.is-error", timeout=15000)
        check("D96 with no search service, the reason and alternatives are given", "typed coordinates" in await page.inner_text(".search-note.is-error"))
        await b.close()

        # ---- opening a shared link ----
        b, ctx, page = await open_web(p, port, log, problems, hash="#event=EONET_2")
        await settle(page, 1500)
        check("D97 a shared link opens the event's report", await page.is_visible(".report") and "Tropical Storm Beta" in await page.inner_text(".report-title"))
        txt = await page.inner_text(".report-body")
        check("D98 a storm in the Pacific gets the Himawari viewer", "Himawari geostationary loop" in txt)
        check("D99 a storm suggests the rainfall layer first", (await page.inner_text(".an-item >> nth=0")).startswith("Rainfall"))
        await b.close()

        # ---- keyboard only ----
        b, ctx, page = await open_web(p, port, log, problems)
        await page.evaluate("window.__echo.atlas.flyTo([-0.2, -78.4], 6, { animate: false })")
        await page.wait_for_timeout(500)
        await page.focus(".pin[data-id='EONET_3']")
        await page.keyboard.press("Enter")
        await settle(page, 900)
        check("K1 a pin can be opened from the keyboard", await page.is_visible(".report") and "Mount Gamma" in await page.inner_text(".report-title"))
        check("K2 focus moves into the report", await page.evaluate("document.querySelector('.report').contains(document.activeElement)"))
        await page.keyboard.press("Escape")
        await settle(page, 300)
        check("K3 Escape returns focus to where it was", await page.evaluate("document.activeElement.dataset.id === 'EONET_3' || document.activeElement.id === 'map'"))
        await page.focus(".dev-item[data-id='EONET_1']")
        await page.keyboard.press("Enter")
        await settle(page)
        check("K4 a development opens from the keyboard", "Wildfire Alpha" in await page.inner_text(".report-title"))
        await page.focus(".rs-title:has-text('Event window') ~ label.switch-row input")
        await page.keyboard.press("Space")
        await settle(page, 300)
        check("K5 report switches work from the keyboard", await page.evaluate("window.__echo.state.imagery.nasa === true"))
        await b.close()

        # ---- reduced motion ----
        b, ctx, page = await open_web(p, port, log, problems, reduced=True)
        check("R1 no pulsing pins when motion is reduced", await page.evaluate("document.querySelectorAll('.pin.is-recent').length") == 0)
        await page.click(".dev-item[data-id='EONET_2']")
        await page.wait_for_timeout(300)
        check("R2 the camera jumps instead of flying", await page.is_visible(".pin[data-id='EONET_2'].is-selected"))
        await b.close()

        # ---- the old prototype is kept ----
        b = await p.chromium.launch()
        c2 = await b.new_context()
        await fake_world(c2, log)
        pg = await c2.new_page()
        missing = []
        pg.on("response", lambda r: missing.append(r.url) if r.status >= 400 and "127.0.0.1" in r.url else None)
        await pg.goto(f"http://127.0.0.1:{port}{SUBPATH}/legacy/")
        await pg.wait_for_timeout(800)
        check("L1 the previous prototype still opens at /legacy/", "ECHO" in await pg.title() and not missing, missing)
        await b.close()

        ok = summary(problems, ignore=("ERR_INTERNET_DISCONNECTED", "Failed to load resource", "legacy"))
        sys.exit(0 if ok else 1)

asyncio.run(main())
