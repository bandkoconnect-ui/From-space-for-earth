"""Renders resources/icon.svg into the PNG files that Capacitor Assets and electron-builder expect.

Not part of the build: run it only when the artwork changes (needs Python with Playwright and a
Chromium browser). The PNGs it writes are committed, so nobody needs to run this to build the apps.
    python3 resources/render.py
"""
import asyncio, pathlib, re
from playwright.async_api import async_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
SVG = (ROOT / "resources" / "icon.svg").read_text()
INNER = re.search(r"<g transform=\"translate\(512 512\)\">.*</g>\s*</svg>", SVG, re.S).group(0)[: -len("</svg>")]
DEFS = re.search(r"<defs>.*?</defs>", SVG, re.S).group(0)
BG = "#0b1118"

def page(size, body, bg=None):
    background = f"background:{bg};" if bg else "background:transparent;"
    return f"<!doctype html><style>html,body{{margin:0;{background}}}svg{{display:block}}</style>{body}"

def svg(size, content, viewbox="0 0 1024 1024"):
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="{viewbox}">{DEFS}{content}</svg>'

JOBS = {
    # iOS marketing icon and legacy Android icon: full-bleed square, no transparency
    "resources/icon-only.png": (1024, svg(1024, '<rect width="1024" height="1024" fill="url(#bg)"/>' + INNER), None),
    # Android adaptive icon: the mark alone, kept inside the safe zone (about the middle 60 percent)
    "resources/icon-foreground.png": (1024, svg(1024, f'<g transform="translate(512 512) scale(.8) translate(-512 -512)">{INNER}</g>'), None),
    "resources/icon-background.png": (1024, svg(1024, f'<rect width="1024" height="1024" fill="{BG}"/>'), None),
    # Splash screens: the mark on the app background, about a quarter of the width
    "resources/splash.png": (2732, svg(2732, f'<rect width="1024" height="1024" fill="{BG}"/><g transform="translate(512 512) scale(.34) translate(-512 -512)">{INNER}</g>', "0 0 1024 1024"), None),
    "resources/splash-dark.png": (2732, svg(2732, f'<rect width="1024" height="1024" fill="{BG}"/><g transform="translate(512 512) scale(.34) translate(-512 -512)">{INNER}</g>', "0 0 1024 1024"), None),
    # Desktop: a rounded-square icon with the margin macOS expects (Windows and Linux use it as is)
    "apps/desktop/build/icon.png": (1024, svg(1024, '<rect x="100" y="100" width="824" height="824" rx="186" fill="url(#bg)"/><g transform="translate(512 512) scale(.8) translate(-512 -512)">' + INNER + '</g>'), None),
}

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        for name, (size, markup, bg) in JOBS.items():
            page_ = await browser.new_page(viewport={"width": size, "height": size})
            await page_.set_content(page(size, markup, bg))
            await page_.screenshot(path=str(ROOT / name), omit_background=True)
            await page_.close()
            print("wrote", name)
        await browser.close()

asyncio.run(main())
