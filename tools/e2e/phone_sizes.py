import asyncio, sys
sys.path.insert(0, ".")
from phone_helpers import *
from playwright.async_api import async_playwright

SIZES = [("se1-320x568", 320, 568), ("android-360x640", 360, 640), ("iphone-390x844", 390, 844), ("pixel-412x915", 412, 915), ("landscape-844x390", 844, 390), ("tablet-768x1024", 768, 1024)]

async def main():
    srv, port = serve("mobile")
    log, problems = [], []
    async with async_playwright() as p:
        for name, w, h in SIZES:
            b, ctx, page = await new_phone(p, port, log, problems, w=w, h=h, scale=1)
            ov = await page.evaluate("document.documentElement.scrollWidth <= innerWidth")
            check(f"{name}: no horizontal overflow (explore)", ov)
            for snap in ("peek", "half", "full"):
                await page.evaluate(f"window.__echo.views.explore.setSnap('{snap}')"); await page.wait_for_timeout(600)
                sh = await rect(page, ".bsheet"); stage = await rect(page, ".stage"); fabs = await rect(page, ".fabs"); chip = await rect(page, ".title-chip")
                mapr = await rect(page, ".map-area")
                if snap != "full":
                    check(f"{name} {snap}: map keeps >=140px", mapr["h"] >= 140, mapr["h"])
                    check(f"{name} {snap}: floating buttons stay above the sheet", fabs["b"] <= sh["y"] + 2, (fabs["b"], sh["y"]))
                    check(f"{name} {snap}: buttons inside the screen", fabs["r"] <= w + 1 and fabs["x"] >= 0, fabs)
                    check(f"{name} {snap}: buttons do not cover the title chip", fabs["y"] >= chip["b"] - 2 or fabs["x"] >= chip["r"] - 2, (fabs, chip))
                else:
                    check(f"{name} full: sheet top inside the screen", 0 <= sh["y"] <= 40, sh["y"])
                if snap == "half":
                    last = await page.evaluate("(() => { const b = document.querySelector('.bsheet-body'); b.scrollTop = b.scrollHeight; const r = b.lastElementChild.getBoundingClientRect(); const st = document.querySelector('.stage').getBoundingClientRect(); return [r.bottom, st.bottom]; })()")
                    check(f"{name} half: the end of the report can be scrolled into view", last[0] <= last[1] + 1, last)
                await page.screenshot(path=f"m-size-{name}-{snap}.png")
            for tab in ("pulse", "saved", "ask"):
                await page.click(f".tab[data-nav={tab}]"); await page.wait_for_timeout(500)
                check(f"{name}: no overflow on {tab}", await page.evaluate("document.documentElement.scrollWidth <= innerWidth"))
            await page.click(".tab[data-nav=ask]")
            comp = await rect(page, ".chat-compose")
            check(f"{name}: chat composer fully on screen", comp["b"] <= h and comp["y"] > 0, comp)
            await b.close()
        ok = summary(problems)
        sys.exit(0 if ok else 1)
asyncio.run(main())
