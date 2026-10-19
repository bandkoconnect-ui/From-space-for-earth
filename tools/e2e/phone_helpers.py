import io, sys
sys.path.insert(0, ".")
from harness import *
from PIL import Image

results = []
def check(name, cond, extra=""):
    ok = bool(cond)
    results.append((name, ok))
    print(("PASS  " if ok else "FAIL  ") + name + (f"   [{extra}]" if (extra and not ok) else ""), flush=True)

def summary(problems):
    bad = [n for n, ok in results if not ok]
    print(f"\n{len(results) - len(bad)}/{len(results)} checks passed; console/page problems: {len(problems)}")
    for p in problems: print("  PROBLEM", p)
    for n in bad: print("  FAILED:", n)
    return not bad and not problems

async def shot_pixels(page):
    img = Image.open(io.BytesIO(await page.screenshot())).convert("RGB")
    return img

def near(px, rgb, tol=40):
    return all(abs(a - b) <= tol for a, b in zip(px, rgb))

async def drag(page, x0, y0, x1, y1, steps=14, delay=35):
    await page.mouse.move(x0, y0)
    await page.mouse.down()
    for i in range(1, steps + 1):
        await page.mouse.move(x0 + (x1 - x0) * i / steps, y0 + (y1 - y0) * i / steps)
        await page.wait_for_timeout(delay)
    await page.mouse.up()

async def rect(page, selector):
    return await page.evaluate("(s) => { const r = document.querySelector(s).getBoundingClientRect(); return {x:r.x, y:r.y, w:r.width, h:r.height, cx:r.x+r.width/2, cy:r.y+r.height/2, b:r.bottom, r:r.right}; }", selector)

async def new_phone(p, port, log, problems, w=390, h=844, scale=1, eonet="ok", chat=None, init=None, permissions=None, geo=None, offline=False):
    b = await p.chromium.launch()
    kw = dict(viewport={"width": w, "height": h}, device_scale_factor=scale, is_mobile=True, has_touch=True, accept_downloads=True)
    if permissions: kw["permissions"] = permissions
    if geo: kw["geolocation"] = geo
    ctx = await b.new_context(**kw)
    await fake_network(ctx, log, eonet=eonet, chat=chat)
    if init: await ctx.add_init_script(init)
    page = await ctx.new_page()
    watch(page, problems)
    await page.goto(f"http://127.0.0.1:{port}/index.html")
    await page.wait_for_selector(".explore:not([hidden]) .bsheet", timeout=8000)
    await page.wait_for_timeout(700)
    return b, ctx, page
