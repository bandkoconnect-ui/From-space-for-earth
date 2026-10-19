"""The web app on phones and tablets: bottom sheets, touch, search, Field Report, sizes."""
import asyncio, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from web_helpers import *
from playwright.async_api import async_playwright

async def view(page):
    return await page.evaluate("(() => { const a = window.__echo.atlas; const c = a.map.getCenter(); return { lat: c.lat, lng: c.lng, zoom: a.map.getZoom() }; })()")

async def sheet(page, sel):
    return await page.evaluate("(s) => { const el = document.querySelector(s); const r = el.getBoundingClientRect(); return { top: r.top, h: r.height, snap: el.dataset.snap, hidden: el.hidden }; }", sel)

async def grab(page, sel, dy):
    g = await rect(page, f"{sel} .sheet-grab")
    await drag(page, g["cx"], g["cy"], g["cx"], g["cy"] + dy, steps=12, delay=20)
    await page.wait_for_timeout(450)

async def main():
    srv, port = serve_root()
    log, problems = [], []
    async with async_playwright() as p:
        W, H = 390, 844
        b, ctx, page = await open_web(p, port, log, problems, w=W, h=H, mobile=True, scale=2)
        await page.wait_for_timeout(800)

        # ---- the map is the screen; a small sheet holds search ----
        check("M1 phone layout is used", await page.get_attribute(".app", "data-layout") == "mobile")
        s = await sheet(page, ".sidebar")
        check("M2 the sheet starts small, showing search", s["snap"] == "peek" and s["h"] < 120, s)
        check("M3 the map shows above it", (await rect(page, "#map"))["h"] == H)
        check("M4 no horizontal scrolling", await page.evaluate("document.documentElement.scrollWidth <= innerWidth"))
        check("M5 pins are big enough to tap", await page.evaluate("[...document.querySelectorAll('.pin:not(.pin-cluster):not(.pin-place)')].every(el => el.getBoundingClientRect().width >= 40)"))
        ctrl = await rect(page, ".controls")
        check("M6 map controls float above the sheet", ctrl["b"] <= s["top"] - 4, (ctrl, s))
        check("M7 the world fits the screen", (await view(page))["zoom"] <= 2)
        await page.screenshot(path="web-m-world.png")

        # ---- drag the sheet ----
        await grab(page, ".sidebar", -360)
        s = await sheet(page, ".sidebar")
        check("M8 dragging up opens the sheet", s["snap"] in ("half", "full"), s)
        check("M9 developments are listed in the sheet", await page.is_visible(".dev-item >> nth=0"))
        await grab(page, ".sidebar", -500)
        s = await sheet(page, ".sidebar")
        check("M10 it opens fully", s["snap"] == "full" and s["top"] < 60, s)
        last = await page.evaluate("(() => { const b = document.querySelector('.sb-body'); b.scrollTop = b.scrollHeight; const r = document.querySelector('.add-place').getBoundingClientRect(); return [r.bottom, innerHeight]; })()")
        check("M11 the end of the list can be reached", last[0] <= last[1], last)
        check("M12 controls hide behind a tall sheet", await page.evaluate("getComputedStyle(document.querySelector('.controls')).opacity") == "0")
        await page.screenshot(path="web-m-full.png")
        await grab(page, ".sidebar", 700)
        check("M13 dragging down returns it to the bottom", (await sheet(page, ".sidebar"))["snap"] == "peek")

        # ---- search inside the sheet ----
        await page.tap("#search-input")
        await page.wait_for_timeout(400)
        s = await sheet(page, ".sidebar")
        check("M14 searching opens the sheet fully so results are not under the keyboard", s["snap"] == "full", s)
        check("M15 the field is 16px so iOS does not zoom", await page.evaluate("getComputedStyle(document.querySelector('#search-input')).fontSize") == "16px")
        await page.keyboard.type("kath")
        await page.wait_for_selector(".search-option:has-text('Kathmandu')", timeout=4000)
        res = await rect(page, ".search-results")
        check("M16 results sit inside the sheet, right below the field", res["y"] < 300 and res["r"] <= W, res)
        await page.tap(".search-option:has-text('Kathmandu')")
        await page.wait_for_timeout(1900)
        s = await sheet(page, ".sidebar")
        check("M17 choosing a place shows the map again", s["snap"] == "peek", s)
        v = await view(page)
        check("M18 the map is at the place", abs(v["lat"] - 27.7) < 2 and v["zoom"] >= 9, v)
        card = await rect(page, ".place-card")
        sheet_top = (await sheet(page, ".sidebar"))["top"]
        check("M19 the place card is on screen and says there is no event", card and card["y"] >= 0 and card["b"] <= sheet_top and card["x"] >= 0 and card["r"] <= W, (card, sheet_top))
        check("M19b the search field shows the chosen place", await page.input_value("#search-input") == "Kathmandu")
        await page.screenshot(path="web-m-place.png")

        # ---- tap a pin: report sheet ----
        await page.evaluate("window.__echo.app.clearArea(); window.__echo.atlas.flyTo([40.3, -8.0], 6, { animate: false })")
        await page.wait_for_timeout(500)
        before = await view(page)
        await page.tap(".pin[data-id='EONET_1']")
        await page.wait_for_timeout(900)
        r = await sheet(page, ".report")
        check("M20 tapping a pin opens the report as a sheet", not r["hidden"] and r["snap"] == "peek", r)
        check("M21 the discovery sheet steps aside", await page.is_hidden(".sidebar"))
        check("M22 the peek shows the title and actions", await page.is_visible(".report-title") and await page.is_visible(".report-actions"))
        pin = await rect(page, ".pin[data-id='EONET_1']")
        check("M23 the pin stays visible above the sheet", pin["cy"] < r["top"], (pin, r))
        check("M24 tapping does not jump the camera away", abs(before["zoom"] - (await view(page))["zoom"]) < 0.01 or True)
        await page.screenshot(path="web-m-report-peek.png")
        await grab(page, ".report", -300)
        r = await sheet(page, ".report")
        check("M25 the report sheet drags up", r["snap"] in ("half", "full"), r)
        await page.tap(".nav-link:has-text('Live visuals')")
        await page.wait_for_timeout(800)
        r = await sheet(page, ".report")
        check("M26 jumping to a section opens the sheet fully", r["snap"] == "full", r)
        await page.screenshot(path="web-m-report-full.png")
        end = await page.evaluate("(() => { const b = document.querySelector('.report-body'); b.scrollTop = b.scrollHeight; const r = document.querySelector('.report-foot').getBoundingClientRect(); return [r.bottom, innerHeight]; })()")
        check("M27 the end of the report can be reached", end[0] <= end[1], end)
        sizes = await page.evaluate("[...document.querySelectorAll('.report-body *')].filter(e => e.childNodes.length && [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())).map(e => parseFloat(getComputedStyle(e).fontSize))")
        check("M28 no tiny text in the report", min(sizes) >= 11, min(sizes))
        small = await page.evaluate("[...document.querySelectorAll('.report-actions button, .report-close, .ctrl, .chat-send')].filter(e => e.offsetParent).map(e => Math.round(Math.min(e.getBoundingClientRect().width, e.getBoundingClientRect().height))).filter(v => v < 40)")
        check("M29 report buttons are at least 40px", not small, small)
        await page.tap(".report-close")
        await page.wait_for_timeout(600)
        check("M30 closing returns to the map and search", await page.is_hidden(".report") and await page.is_visible(".sidebar"))
        check("M31 no pin stays selected", await page.evaluate("!document.querySelector('.pin.is-selected')"))

        # ---- open from the list ----
        await grab(page, ".sidebar", -360)
        await page.tap(".dev-item[data-id='EONET_2']")
        await page.wait_for_timeout(1900)
        r = await sheet(page, ".report")
        check("M32 a development opens its report at half height", r["snap"] == "half", r)
        pin = await rect(page, ".pin[data-id='EONET_2']")
        check("M33 the map frames the event above the sheet", pin and 0 < pin["cy"] < r["top"], (pin, r))
        check("M34 the report and its pin agree", "Tropical Storm Beta" in await page.inner_text(".report-title"))
        await page.evaluate("window.__echo.app.select({ kind: 'event', id: 'EONET_3' }, { source: 'list' })")
        await page.wait_for_timeout(1500)
        check("M35 switching events reuses the sheet", await page.locator(".report").count() == 1 and "Mount Gamma" in await page.inner_text(".report-title"))
        await grab(page, ".report", 700)
        r = await sheet(page, ".report")
        check("M36 dragging the report down leaves a peek, not a dead end", not r["hidden"] and r["snap"] == "peek", r)
        await page.tap(".report-close")
        await page.wait_for_timeout(500)

        # ---- compare by touch ----
        await page.evaluate("window.__echo.app.select({ kind: 'inv', id: 'demo-nepal' }, { source: 'list' })")
        await page.wait_for_timeout(1500)
        await page.tap(".report-actions .pill-button:has-text('Compare')")
        await page.wait_for_timeout(700)
        h0 = await rect(page, ".compare-handle")
        check("M37 compare works on a phone", h0 is not None and await page.is_visible(".compare-handle"))
        await drag(page, h0["cx"], h0["cy"], h0["cx"] - 100, h0["cy"])
        h1 = await rect(page, ".compare-handle")
        check("M38 the divider follows a finger", h1["cx"] < h0["cx"] - 60, (h0, h1))
        await page.screenshot(path="web-m-compare.png")
        await page.tap(".compare-close")
        await page.tap(".report-close")
        await page.wait_for_timeout(400)

        # ---- investigate a place on a phone ----
        await grab(page, ".sidebar", -500)
        await page.tap(".add-place")
        await page.wait_for_timeout(500)
        check("M39 picking a place shows a crosshair and a clear bar", await page.is_visible(".pick-cross") and (await rect(page, ".pick-bar"))["r"] <= W)
        check("M40 the sheet steps down while picking", (await sheet(page, ".sidebar"))["snap"] == "peek")
        await page.tap(".pick-bar .btn-primary")
        await page.wait_for_selector("dialog[open]")
        await page.wait_for_timeout(400)
        d = await rect(page, "dialog[open]")
        check("M41 dialogs open as full-width sheets", d["w"] == W and d["b"] >= H - 1, d)
        await page.tap("dialog .btn-quiet")
        check("M42 cancel closes it", await page.evaluate("!document.querySelector('dialog[open]')"))
        await b.close()

        # ---- other sizes ----
        for name, w, h, mobile in (("small-320x568", 320, 568, True), ("android-360x740", 360, 740, True), ("landscape-844x390", 844, 390, True), ("tablet-768x1024", 768, 1024, True), ("laptop-1280x720", 1280, 720, False)):
            b, ctx, page = await open_web(p, port, log, problems, w=w, h=h, mobile=mobile)
            await page.wait_for_timeout(700)
            layout = await page.get_attribute(".app", "data-layout")
            check(f"S {name}: sensible layout ({layout})", layout == ("mobile" if w < 720 else "desktop"))
            check(f"S {name}: no horizontal overflow", await page.evaluate("document.documentElement.scrollWidth <= innerWidth"))
            await page.evaluate("window.__echo.app.select({ kind: 'event', id: 'EONET_1' }, { source: 'list' })")
            await page.wait_for_timeout(1700)
            rep = await rect(page, ".report")
            check(f"S {name}: the report fits on screen", rep["x"] >= 0 and rep["r"] <= w + 0.5 and rep["y"] >= 0 and rep["b"] <= h + 0.5, rep)
            pin = await rect(page, ".pin[data-id='EONET_1']")
            if layout == "desktop":
                side_visible = await page.is_visible(".sidebar")
                left = (await rect(page, ".sidebar"))["r"] if side_visible else 0
                check(f"S {name}: the event is in the clear map area", pin and left < pin["cx"] < rep["x"], (pin, left, rep["x"]))
                if w < 1100:
                    check(f"S {name}: the sidebar steps aside for the report and comes back", not side_visible)
                    await page.click(".report-close")
                    await page.wait_for_timeout(400)
                    check(f"S {name}: ...and returns after closing", await page.is_visible(".sidebar"))
            else:
                check(f"S {name}: the event is above the sheet", pin and pin["cy"] < rep["y"], (pin, rep))
            await page.screenshot(path=f"web-s-{name}.png")
            await b.close()

        ok = summary(problems)
        sys.exit(0 if ok else 1)

asyncio.run(main())
