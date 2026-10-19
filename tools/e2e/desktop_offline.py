import asyncio, sys, json, tempfile, os
sys.path.insert(0, ".")
from harness import *
from playwright.async_api import async_playwright

results = []
def check(name, cond, detail=""):
    results.append((bool(cond), name, detail))
    print(("PASS " if cond else "FAIL ") + name + (f"  [{detail}]" if detail and not cond else ""))

async def main():
    srv, port = serve("desktop")
    url = f"http://127.0.0.1:{port}/index.html"
    problems = []
    async with async_playwright() as p:
        b = await p.chromium.launch()

        # ---------- minimum window size: no horizontal overflow, everything reachable
        ctx = await b.new_context(viewport={"width": 1040, "height": 680}, accept_downloads=True)
        log = []
        await fake_network(ctx, log)
        page = await ctx.new_page(); watch(page, problems)
        await page.goto(url); await page.wait_for_selector(".home-hero")
        await page.wait_for_timeout(500)
        ov = await page.evaluate("document.documentElement.scrollWidth > innerWidth")
        check("home: no horizontal overflow at 1040x680", not ov)
        await page.screenshot(path="min-home.png")
        await page.keyboard.press("Control+2"); await page.wait_for_selector(".explore:not([hidden]) .leaflet-container"); await page.wait_for_timeout(900)
        ov = await page.evaluate("document.documentElement.scrollWidth > innerWidth")
        check("explore: no horizontal overflow at 1040x680", not ov)
        mapbox = await page.locator(".explore .map-canvas").bounding_box()
        check("explore: map still has usable width (>=380px)", mapbox["width"] >= 380, str(mapbox["width"]))
        await page.screenshot(path="min-explore.png")
        await page.keyboard.press("Control+4"); await page.wait_for_selector(".pulse .event-row"); await page.wait_for_timeout(600)
        await page.screenshot(path="min-pulse.png")
        await page.keyboard.press("Control+3"); await page.wait_for_selector("tbody tr")
        ov = await page.evaluate("document.querySelector('.table-wrap').scrollWidth > document.querySelector('.table-wrap').clientWidth + 2")
        check("library: table fits at 1040px", not ov)

        # ---------- export workspace, wipe, import
        await page.keyboard.press("Control+2"); await page.wait_for_timeout(300)
        await page.click("#tab-notes")
        await page.fill(".composer textarea", "round trip note")
        await page.click(".composer .btn-primary")
        await page.wait_for_timeout(300)
        async with page.expect_download() as dl:
            await page.keyboard.press("Control+Shift+E")
        d = await dl.value
        bundle_path = await d.path()
        data = json.load(open(bundle_path))
        check("workspace export is an ECHO bundle with notes", data["kind"] == "echo-workspace" and len(data["investigations"]) == 2 and any("round trip note" in json.dumps(v) for v in data["notes"].values()))
        check("export contains no settings/endpoint", "settings" not in data and "chatEndpoint" not in json.dumps(data))

        await page.keyboard.press("Control+3"); await page.wait_for_selector("tbody tr")
        for _ in range(2):
            await page.click('.table-view button[aria-label^="Delete"] >> nth=0')
            await page.click("dialog[open] .btn-danger")
            await page.wait_for_timeout(250)
        check("library empty state after deleting everything", await page.locator(".table-empty").is_visible())
        await page.keyboard.press("Control+2"); await page.wait_for_timeout(400)
        check("explore shows an empty state with no investigations", await page.locator(".explore .empty-state").is_visible())
        await page.screenshot(path="empty-explore.png")
        await page.keyboard.press("Control+1"); await page.wait_for_timeout(300)
        check("home copes with no investigations", "No investigations yet" in await page.locator(".home-scroll").inner_text())

        async with page.expect_file_chooser() as fc:
            await page.keyboard.press("Control+o")
        chooser = await fc.value
        await chooser.set_files(bundle_path)
        await page.wait_for_timeout(600)
        count = await page.evaluate("window.__echo.app.store.list().length")
        notes = await page.evaluate("window.__echo.app.store.noteCount()")
        check("import restores investigations and notes", count == 2 and notes == 1, f"{count} {notes}")

        # importing the same file again must not duplicate demos, and non-ECHO json is refused
        async with page.expect_file_chooser() as fc:
            await page.keyboard.press("Control+o")
        await (await fc.value).set_files(bundle_path)
        await page.wait_for_timeout(500)
        count2 = await page.evaluate("window.__echo.app.store.list().length")
        check("re-importing demos does not duplicate them", count2 == 2, str(count2))
        bad = os.path.join(tempfile.gettempdir(), "bad.json"); open(bad, "w").write('{"hello": "world"}')
        async with page.expect_file_chooser() as fc:
            await page.keyboard.press("Control+o")
        await (await fc.value).set_files(bad)
        await page.wait_for_timeout(400)
        check("foreign JSON is rejected with a message", "not an ECHO workspace" in await page.locator(".toast").inner_text(), await page.locator(".toast").inner_text())
        badtxt = os.path.join(tempfile.gettempdir(), "bad2.json"); open(badtxt, "w").write("definitely not json")
        async with page.expect_file_chooser() as fc:
            await page.keyboard.press("Control+o")
        await (await fc.value).set_files(badtxt)
        await page.wait_for_timeout(400)
        check("non-JSON file is rejected with a message", "not valid JSON" in await page.locator(".toast").inner_text(), await page.locator(".toast").inner_text())

        # restore demos / erase all from settings
        await page.keyboard.press("Control+Comma"); await page.wait_for_selector("dialog[open] .settings")
        await page.click('dialog[open] button:has-text("Erase all data")')
        await page.click("dialog[open] dialog[open] .btn-danger, dialog[open].modal-small .btn-danger") if False else None
        dialogs = page.locator("dialog[open]")
        n = await dialogs.count()
        check("erase asks for confirmation in a second dialog", n == 2, str(n))
        await page.locator("dialog[open]").nth(1).locator(".btn-danger").click()
        await page.wait_for_timeout(400)
        count3 = await page.evaluate("window.__echo.app.store.list().length")
        notes3 = await page.evaluate("window.__echo.app.store.noteCount()")
        check("erase resets to the two demos with no notes", count3 == 2 and notes3 == 0, f"{count3} {notes3}")
        await page.keyboard.press("Escape")
        await ctx.close()

        # ---------- offline: Planet Pulse falls back to saved events
        ctx = await b.new_context(viewport={"width": 1440, "height": 900})
        log = []
        await fake_network(ctx, log)
        page = await ctx.new_page(); watch(page, problems)
        await page.goto(url); await page.wait_for_selector(".home-hero")
        await page.keyboard.press("Control+4"); await page.wait_for_selector(".pulse .event-row")
        await page.wait_for_timeout(800)  # let the cache write (debounced)
        await page.close()
        await ctx.unroute(re.compile(r"https://eonet\.gsfc\.nasa\.gov/.*"))
        async def fail(route): await route.abort("internetdisconnected")
        await ctx.route(re.compile(r"https://eonet\.gsfc\.nasa\.gov/.*"), fail)
        page = await ctx.new_page(); watch(page, problems)
        await page.goto(url); await page.wait_for_selector(".home-hero")
        await page.keyboard.press("Control+4"); await page.wait_for_selector(".pulse .event-row")
        await page.wait_for_timeout(1500)
        status = await page.locator(".pulse-side [role=status]").inner_text()
        check("offline pulse shows saved events", await page.locator(".pulse .event-row").count() == 3)
        check("offline pulse says so honestly", "Offline" in status, status)
        await page.click('button[aria-label="Refresh events"]'); await page.wait_for_timeout(1200)
        check("refresh while offline keeps events and tells the person", await page.locator(".pulse .event-row").count() == 3 and "offline" in (await page.locator(".toast").inner_text()).lower(), await page.locator(".toast").inner_text())
        # tile failures show the banner and recover
        await page.keyboard.press("Control+2"); await page.wait_for_selector(".explore:not([hidden]) .leaflet-container")
        await ctx.unroute(re.compile(r"https://(server\.arcgisonline\.com|gibs\.earthdata\.nasa\.gov)/.*"))
        async def abort(route): await route.abort("internetdisconnected")
        await ctx.route(re.compile(r"https://gibs\.earthdata\.nasa\.gov/.*"), abort)
        await page.locator('.stop >> nth=1').click()
        await page.wait_for_timeout(1500)
        check("imagery failure shows the banner", await page.locator(".map-banner").is_visible())
        await page.screenshot(path="offline-banner.png")

        print("\nproblems:", [x for x in problems if "ERR_" not in x])
        fails = [r for r in results if not r[0]]
        print(f"{len(results)-len(fails)}/{len(results)} passed")
        await b.close()
        sys.exit(1 if fails or [x for x in problems if "ERR_" not in x] else 0)
asyncio.run(main())
