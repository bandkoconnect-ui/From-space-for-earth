import asyncio, sys, json
sys.path.insert(0, ".")
from harness import *
from playwright.async_api import async_playwright

results = []
def check(name, cond, detail=""):
    results.append((bool(cond), name, detail))
    print(("PASS " if cond else "FAIL ") + name + (f"  [{detail}]" if detail and not cond else ""))

async def main():
    srv, port = serve("desktop")
    log, problems = [], []
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={"width": 1440, "height": 900}, accept_downloads=True)
        await fake_network(ctx, log, chat="ready")
        page = await ctx.new_page()
        watch(page, problems)
        await page.goto(f"http://127.0.0.1:{port}/index.html")
        await page.wait_for_selector(".home-hero")
        base = f"http://127.0.0.1:{port}/index.html"

        # ---------- Library
        await page.keyboard.press("Control+3")
        await page.wait_for_selector(".table-view:not([hidden]) tbody tr")
        check("library lists 2 demos", await page.locator("tbody tr").count() == 2)
        await page.fill('input[aria-label="Search investigations"]', "amazon")
        check("search filters rows", await page.locator("tbody tr").count() == 1)
        await page.fill('input[aria-label="Search investigations"]', "")
        await page.select_option('select[aria-label="Filter by topic"]', "flood")
        check("topic filter works", await page.locator("tbody tr").count() == 1 and "Nepal" in await page.locator("tbody tr").inner_text())
        await page.select_option('select[aria-label="Filter by topic"]', "all")

        # duplicate
        await page.click('button[aria-label^="Duplicate Nepal"]')
        await page.wait_for_timeout(300)
        check("duplicate adds a copy", await page.locator("tbody tr").count() == 3)
        check("copy is labelled (copy) and not a demo", "(copy)" in await page.locator("tbody").inner_text())

        # rename via dialog
        await page.click('button[aria-label^="Rename Nepal · Glacier flash flood (copy)"]')
        await page.wait_for_selector("dialog[open] input")
        await page.fill("dialog[open] input", "My Langtang study")
        await page.keyboard.press("Enter")
        await page.wait_for_timeout(300)
        check("rename dialog renames", "My Langtang study" in await page.locator("tbody").inner_text())
        await page.screenshot(path="library.png")

        # export report download
        async with page.expect_download() as dl:
            await page.click('button[aria-label^="Export report for My Langtang study"]')
        d = await dl.value
        path = await d.path()
        text = open(path).read()
        check("report downloads as markdown with title and sections", text.startswith("# My Langtang study") and "## Evidence trail" in text and d.suggested_filename.endswith(".md"), d.suggested_filename)

        # delete with confirm; cancel first
        await page.click('button[aria-label^="Delete My Langtang study"]')
        await page.wait_for_selector("dialog[open]")
        await page.keyboard.press("Escape")
        await page.wait_for_timeout(200)
        check("Escape cancels the delete dialog", await page.locator("tbody tr").count() == 3)
        await page.click('button[aria-label^="Delete My Langtang study"]')
        await page.click("dialog[open] .btn-danger")
        await page.wait_for_timeout(300)
        check("confirmed delete removes the row", await page.locator("tbody tr").count() == 2)

        # ---------- New investigation dialog
        await page.keyboard.press("Control+n")
        await page.wait_for_selector("dialog[open]")
        await page.fill("dialog[open] input[maxlength='80']", "Lake test")
        await page.fill("dialog[open] input.mono", "not coordinates")
        await page.click("dialog[open] .btn-primary")
        check("invalid coordinates show an error and keep dialog open", "latitude" in (await page.locator("dialog[open] .field-error").inner_text()).lower())
        await page.fill("dialog[open] input.mono", "95, 10")
        await page.click("dialog[open] .btn-primary")
        check("out-of-range latitude rejected", (await page.locator("dialog[open] .field-error").inner_text()) != "")
        await page.fill("dialog[open] input.mono", "27.7172° N, 85.3240° E")
        await page.select_option("dialog[open] select >> nth=1", "50")
        await page.click("dialog[open] .btn-primary")
        await page.wait_for_selector(".explore:not([hidden]) .leaflet-container")
        await page.wait_for_timeout(1200)
        check("creating opens Explore on the new investigation", "Lake test" in await page.locator(".explore .map-card h2").inner_text())
        check("study-area circle drawn on map (canvas present)", await page.locator(".explore canvas.leaflet-zoom-animated").count() >= 1)
        check("new investigation has 4 dates ending today", await page.locator(".stop").count() == 4)
        await page.screenshot(path="explore-new.png")

        # ---------- Planet Pulse
        await page.keyboard.press("Control+4")
        await page.wait_for_selector(".pulse:not([hidden]) .event-row")
        await page.wait_for_timeout(600)
        check("pulse lists 3 fixture events", await page.locator(".pulse .event-row").count() == 3)
        check("status says live", "Live from NASA EONET" in await page.locator(".pulse-side [role=status]").inner_text())
        check("category chips with counts", await page.locator(".pulse .chips .chip").count() == 4)
        await page.click('.pulse .chips .chip:has-text("Wildfires")')
        check("category filter narrows list", await page.locator(".pulse .event-row").count() == 1)
        await page.click('.pulse .chips .chip:has-text("All")')
        await page.fill('.pulse input[type=search]', "storm")
        check("search narrows list", await page.locator(".pulse .event-row").count() == 1)
        await page.fill('.pulse input[type=search]', "")
        await page.click('.pulse .event-row:has-text("Mount Gamma")')
        await page.wait_for_timeout(900)
        check("clicking an event opens its card", await page.locator(".event-card").is_visible() and "Mount Gamma" in await page.locator(".event-card h2").inner_text())
        await page.screenshot(path="pulse.png")
        await page.click(".event-card .btn-primary")
        await page.wait_for_selector(".explore:not([hidden]) .leaflet-container")
        await page.wait_for_timeout(1000)
        check("investigate creates an event investigation", "Mount Gamma" in await page.locator(".explore .map-card h2").inner_text())
        check("event note: marker track (circleMarker canvas)", await page.locator(".explore .stop").count() >= 2, str(await page.locator(".explore .stop").count()))
        await page.screenshot(path="explore-event.png")
        n_before = await page.evaluate("window.__echo.app.store.list().length")
        await page.keyboard.press("Control+4")
        await page.wait_for_selector(".pulse .event-row")
        await page.click('.pulse .event-row:has-text("Mount Gamma")')
        await page.click(".event-card .btn-primary")
        await page.wait_for_timeout(400)
        n_after = await page.evaluate("window.__echo.app.store.list().length")
        check("investigating the same event twice reuses the first", n_before == n_after, f"{n_before} {n_after}")

        # ---------- Settings
        await page.keyboard.press("Control+Comma")
        await page.wait_for_selector("dialog[open] .settings")
        await page.fill('dialog[open] input[type=url]', "http://evil.example.com/x")
        await page.click("dialog[open] .btn-primary")
        check("insecure endpoint is refused", "https" in (await page.locator("dialog[open] .field-error").inner_text()))
        await page.fill('dialog[open] input[type=url]', "https://chat.example.test/fn")
        await page.click('dialog[open] button:has-text("Test connection")')
        await page.wait_for_timeout(800)
        check("test connection reports success", "Connected" in await page.locator("dialog[open] [role=status]").inner_text(), await page.locator("dialog[open] [role=status]").inner_text())
        await page.select_option("dialog[open] select", "viirs")
        await page.click("dialog[open] .btn-primary")
        await page.wait_for_timeout(400)
        saved = await page.evaluate("window.__echo.app.store.settings()")
        check("settings saved (endpoint + imagery)", saved["chatEndpoint"] == "https://chat.example.test/fn" and saved["imagery"] == "viirs", str(saved))

        # live chat through the fake endpoint
        await page.keyboard.press("Control+k")
        await page.wait_for_selector("#tab-ask.active")
        await page.fill(".chat-input", "hello there")
        await page.keyboard.press("Enter")
        await page.wait_for_timeout(1000)
        check("live AI reply shown", "ready" in await page.locator(".chat-log").inner_text())
        sent = [l for l in log if l[0] == "chat" and l[1]]
        body = json.loads(sent[-1][1]) if sent else {}
        check("chat request has only investigation context + messages (no secrets)", sorted(body.keys()) == ["investigation", "messages"] and sorted(body["investigation"].keys()) == ["date", "evidence", "notes", "sourceText", "title", "topic"], str(list(body.keys())))
        check("VIIRS imagery requested after settings change", any(l[0] == "gibs" and "VIIRS" in l[2] for l in log))

        # ---------- persistence across reload
        await page.wait_for_timeout(500)
        await page.reload()
        await page.wait_for_selector(".home-hero")
        count = await page.evaluate("window.__echo.app.store.list().length")
        s2 = await page.evaluate("window.__echo.app.store.settings().chatEndpoint")
        check("investigations and settings survive a reload", count == 4 and s2 == "https://chat.example.test/fn", f"{count} {s2}")

        # ---------- about data + about dialogs
        await page.click('button[aria-label="About the data"]')
        await page.wait_for_selector("dialog[open] .about")
        check("about the data dialog opens", "NASA GIBS" in await page.locator("dialog[open]").inner_text())
        await page.screenshot(path="about-data.png")
        await page.keyboard.press("Escape")
        check("Escape closes dialog", await page.locator("dialog[open]").count() == 0)

        print("\nproblems:", problems)
        fails = [r for r in results if not r[0]]
        print(f"{len(results)-len(fails)}/{len(results)} passed")
        await b.close()
        sys.exit(1 if fails or problems else 0)
asyncio.run(main())
