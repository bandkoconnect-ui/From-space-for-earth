import asyncio, sys, json
sys.path.insert(0, ".")
from harness import *
from playwright.async_api import async_playwright

results = []
def check(name, cond, detail=""):
    results.append((bool(cond), name, detail))
    print(("PASS " if cond else "FAIL ") + name + (f"  [{detail}]" if detail and not cond else ""))

def pixel(png_bytes, x, y):
    # decode via playwright screenshot -> use PIL if available
    from PIL import Image
    import io
    im = Image.open(io.BytesIO(png_bytes)).convert("RGB")
    return im.getpixel((x, y))

def near(c, t, tol=40):
    return all(abs(a - b) <= tol for a, b in zip(c, t))

async def main():
    srv, port = serve("desktop")
    log, problems = [], []
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={"width": 1440, "height": 900})
        await fake_network(ctx, log)
        page = await ctx.new_page()
        watch(page, problems)
        await page.goto(f"http://127.0.0.1:{port}/index.html")
        await page.wait_for_selector(".home-hero")

        # --- open Explore from the Continue card
        await page.click(".inv-card.large")
        await page.wait_for_selector(".explore:not([hidden]) .leaflet-container")
        await page.wait_for_timeout(1500)
        await page.screenshot(path="explore-default.png")
        gibs = [l for l in log if l[0] == "gibs"]
        times = {l[1] for l in gibs}
        check("explore requests NASA imagery for the selected date (2026-08-27)", "2026-08-27" in times, str(times))
        check("no compare layer requested yet (08-12 absent)", "2026-08-12" not in times, str(times))
        check("esri base + labels requested", any(l[0] == "esri" for l in log))
        check("card shows investigation title", "Nepal" in (await page.inner_text(".map-card h2")))
        check("dock shows 4 stops", await page.locator(".stop").count() == 4)
        check("selected stop is the 3rd", await page.locator(".stop.active .stop-date").inner_text() == "27 AUG", await page.locator(".stop.active .stop-date").inner_text())

        # --- single-date imagery visible (blue = 08-27) at map centre-left
        box = await page.locator(".explore .map-canvas").bounding_box()
        shot = await page.screenshot()
        c = pixel(shot, int(box["x"] + box["width"] * 0.25), int(box["y"] + box["height"] * 0.8))
        check("NASA imagery for selected date fills map (blue)", near(c, (40, 90, 220), 30), str(c))

        # --- compare toggle via shortcut (web fallback)
        await page.keyboard.press("Control+b")
        await page.wait_for_timeout(1200)
        gibs = [l for l in log if l[0] == "gibs"]
        times = {l[1] for l in gibs}
        check("compare requests the first date (2026-08-12)", "2026-08-12" in times, str(times))
        check("compare handle visible", await page.locator(".compare-handle").is_visible())
        shot = await page.screenshot(path="explore-compare.png")
        left = pixel(shot, int(box["x"] + box["width"] * 0.25), int(box["y"] + box["height"] * 0.8))
        right = pixel(shot, int(box["x"] + box["width"] * 0.75), int(box["y"] + box["height"] * 0.8))
        check("left of divider shows BEFORE (red)", near(left, (200, 40, 40), 30), str(left))
        check("right of divider shows AFTER (blue)", near(right, (40, 90, 220), 30), str(right))

        # --- drag the divider to 80%
        h = await page.locator(".compare-handle").bounding_box()
        stage = await page.locator(".explore .map-stage").bounding_box()
        await page.mouse.move(h["x"] + h["width"] / 2, h["y"] + 200)
        await page.mouse.down()
        await page.mouse.move(stage["x"] + stage["width"] * 0.8, h["y"] + 200, steps=8)
        await page.mouse.up()
        await page.wait_for_timeout(300)
        val = int(await page.locator(".compare-handle").get_attribute("aria-valuenow"))
        check("dragging moves the divider to ~80%", 76 <= val <= 84, str(val))
        shot = await page.screenshot(path="explore-compare-80.png")
        p70 = pixel(shot, int(stage["x"] + stage["width"] * 0.7), int(box["y"] + box["height"] * 0.8))
        p90 = pixel(shot, int(stage["x"] + stage["width"] * 0.9), int(box["y"] + box["height"] * 0.8))
        check("70% is still BEFORE after drag", near(p70, (200, 40, 40), 30), str(p70))
        check("90% is AFTER after drag", near(p90, (40, 90, 220), 30), str(p90))

        # --- keyboard on the divider
        await page.locator(".compare-handle").focus()
        await page.keyboard.press("ArrowLeft")
        await page.keyboard.press("Shift+ArrowLeft")
        val2 = int(await page.locator(".compare-handle").get_attribute("aria-valuenow"))
        check("arrow keys move the divider (-2, -10)", val2 == val - 12, f"{val} -> {val2}")

        # --- pan the map: the clip must follow (pixel check after a drag-pan)
        await page.mouse.move(stage["x"] + 300, stage["y"] + 450)
        await page.mouse.down(); await page.mouse.move(stage["x"] + 520, stage["y"] + 470, steps=6); await page.mouse.up()
        await page.wait_for_timeout(500)
        shot = await page.screenshot()
        val3 = int(await page.locator(".compare-handle").get_attribute("aria-valuenow"))
        xl = int(stage["x"] + stage["width"] * (val3 - 6) / 100); xr = int(stage["x"] + stage["width"] * (val3 + 6) / 100)
        pl = pixel(shot, xl, int(box["y"] + box["height"] * 0.8)); pr = pixel(shot, xr, int(box["y"] + box["height"] * 0.8))
        check("after panning, divider still splits before/after", near(pl, (200, 40, 40), 30) and near(pr, (40, 90, 220), 30), f"{pl} {pr}")

        # --- timeline: stop click, arrows, play
        await page.click(".stop >> nth=0")
        await page.wait_for_timeout(300)
        check("clicking the first stop selects it", "12 AUG" in await page.locator(".stop.active").inner_text())
        check("same-date hint shows when compare date == first date", await page.locator(".compare-hint").is_visible())
        await page.mouse.click(stage["x"] + 400, stage["y"] + 300)  # focus the map area
        await page.keyboard.press("ArrowRight")
        check("ArrowRight advances the date", "24 AUG" in await page.locator(".stop.active").inner_text())
        await page.click(".dock-play")
        await page.wait_for_timeout(2600)
        check("play advances automatically", "27 AUG" in await page.locator(".stop.active").inner_text() or "03 SEP" in await page.locator(".stop.active").inner_text(), await page.locator(".stop.active").inner_text())
        await page.click(".dock-play")  # pause

        # --- layers
        await page.keyboard.press("Control+b")  # compare off
        await page.wait_for_timeout(300)
        check("compare off hides handle", not await page.locator(".compare-handle").is_visible())
        await page.check('input[data-layer="fires"]')
        await page.wait_for_timeout(800)
        check("fires overlay requests thermal layer", any(l[0] == "gibs" and "Thermal" in l[2] for l in log))
        await page.uncheck('input[data-layer="nasa"]')
        await page.wait_for_timeout(300)

        # --- inspector tabs
        await page.check('input[data-layer="nasa"]')
        await page.click("#tab-notes")
        await page.fill(".composer textarea", "Muddy river at the confluence")
        await page.click(".composer .btn-primary")
        await page.wait_for_timeout(300)
        check("note added without location", await page.locator(".note").count() == 1)

        # pin mode
        await page.click(".composer .button-row .btn >> nth=0")
        check("pin mode hint shown", await page.locator(".pin-hint").is_visible())
        await page.mouse.click(stage["x"] + 500, stage["y"] + 300)
        await page.wait_for_timeout(300)
        check("pin location chip shows coordinates", "°" in await page.locator(".note-location").inner_text(), await page.locator(".note-location").inner_text())
        await page.fill(".composer textarea", "Debris field here")
        await page.click(".composer .btn-primary")
        await page.wait_for_timeout(500)
        check("pinned note added (2 notes)", await page.locator(".note").count() == 2)
        check("note pin marker on map", await page.locator(".echo-note-pin").count() >= 1)
        await page.wait_for_timeout(400)
        stored = await page.evaluate("localStorage.getItem('echo-data-v1')")
        check("notes persisted to storage", stored and "Debris field here" in stored)

        # --- Ask ECHO
        await page.click("#tab-ask")
        await page.fill(".chat-input", "What do we know for sure?")
        await page.keyboard.press("Enter")
        await page.wait_for_selector(".msg:not(.user):not(.thinking)", timeout=5000)
        txt = await page.locator(".chat-log").inner_text()
        check("Ask ECHO answers offline with the guide", "ESA" in txt or "What the sources support" in txt, txt[:200])
        await page.click(".chat-suggestions .chip >> nth=1")
        await page.wait_for_timeout(600)
        check("suggestion chip sends a question", await page.locator(".msg.user").count() == 2)
        await page.screenshot(path="explore-ask.png")

        # --- Report tab
        await page.click("#tab-report")
        await page.wait_for_timeout(200)
        await page.screenshot(path="explore-report.png")
        check("report lists evidence rows", await page.locator(".evidence-row").count() >= 3)

        # --- hide inspector
        await page.keyboard.press("Control+Backslash")
        await page.wait_for_timeout(500)
        check("inspector can be hidden", not await page.locator(".ex-inspector").is_visible())
        await page.screenshot(path="explore-no-inspector.png")
        await page.keyboard.press("Control+Backslash")

        print("\nproblems:", problems)
        fails = [r for r in results if not r[0]]
        print(f"{len(results)-len(fails)}/{len(results)} passed")
        await b.close()
        sys.exit(1 if fails or problems else 0)
asyncio.run(main())
