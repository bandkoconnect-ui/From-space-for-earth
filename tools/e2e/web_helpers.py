"""Helpers for the web app's browser tests.

Serves the repository root under /From-space-for-earth/ (exactly like GitHub Pages serves a
project site), and fakes every outside service: map tiles, NASA EONET, NASA GIBS snapshots,
and the Photon / Open-Meteo place search."""
import functools, http.server, json, os, re, socketserver, threading, io, sys
from urllib.parse import urlparse, parse_qs
from harness import ROOT, png, gibs_color, watch

SUBPATH = "/From-space-for-earth"

def _ev(id, title, cat, cat_title, points, source="SRC", closed=None, description=None):
    return {"id": id, "title": title, "description": description, "link": f"https://eonet.gsfc.nasa.gov/api/v3/events/{id}", "closed": closed,
            "categories": [{"id": cat, "title": cat_title}], "sources": [{"id": source, "url": f"https://example.org/{id.lower()}"}],
            "geometry": [{"magnitudeValue": m, "magnitudeUnit": u, "date": d + "T00:00:00Z", "type": "Point", "coordinates": [lng, lat]} for (d, lat, lng, m, u) in points]}

EVENTS = {"events": [
    _ev("EONET_1", "Wildfire Alpha, Portugal", "wildfires", "Wildfires", [("2026-10-10", 40.2, -8.1, 100, "acres"), ("2026-10-14", 40.25, -8.05, 250, "acres"), ("2026-10-18", 40.3, -8.0, 400, "acres")], "IRWIN"),
    _ev("EONET_2", "Tropical Storm Beta", "severeStorms", "Severe Storms", [("2026-10-12", 15.0, 130.0, 45, "kts"), ("2026-10-15", 16.4, 129.0, 55, "kts"), ("2026-10-17", 17.5, 128.5, 60, "kts")], "JTWC"),
    _ev("EONET_3", "Mount Gamma eruption", "volcanoes", "Volcanoes", [("2026-10-18", -0.2, -78.4, None, None)], "SIVolcano", description="Ash plume reported."),
    _ev("EONET_4", "Cedar Fire, Oregon", "wildfires", "Wildfires", [("2026-10-16", 44.0, -122.0, 900, "acres")], "InciWeb"),
    _ev("EONET_5", "Pine Fire, Oregon", "wildfires", "Wildfires", [("2026-10-17", 44.3, -121.6, 300, "acres")], "InciWeb"),
    _ev("EONET_6", "Fir Fire, Oregon", "wildfires", "Wildfires", [("2026-10-11", 43.8, -122.5, 1200, "acres")], "InciWeb"),
    _ev("EONET_7", "Oak Fire, Oregon", "wildfires", "Wildfires", [("2026-10-09", 44.6, -121.2, 80, "acres")], "InciWeb"),
    _ev("EONET_8", "Flooding in Kerala, India", "floods", "Floods", [("2026-10-13", 10.0, 76.3, None, None)], "GDACS"),
    _ev("EONET_9", "Iceberg A99", "seaLakeIce", "Sea and Lake Ice", [("2026-09-01", -70.0, -40.0, None, None), ("2026-10-01", -69.5, -38.0, None, None)], "BYU_ICE"),
    _ev("EONET_10", "Dust storm over the Sahara", "dustHaze", "Dust and Haze", [("2026-10-15", 22.0, 10.0, None, None)], "EO"),
    _ev("EONET_11", "Twin Fire A, Lake County, California", "wildfires", "Wildfires", [("2026-10-18", 39.10, -122.80, 50, "acres")], "CALFIRE"),
    _ev("EONET_12", "Twin Fire B, Lake County, California", "wildfires", "Wildfires", [("2026-10-18", 39.1001, -122.8001, 60, "acres")], "CALFIRE"),
]}

PHOTON = {
    "kathmandu": {"features": [{"geometry": {"coordinates": [85.324, 27.7172]}, "properties": {"name": "Kathmandu", "country": "Nepal", "state": "Bagmati", "type": "city", "osm_key": "place", "osm_value": "city", "osm_type": "R", "osm_id": 1, "extent": [85.2, 27.8, 85.45, 27.6]}}]},
    "portugal": {"features": [{"geometry": {"coordinates": [-8.0, 39.6]}, "properties": {"name": "Portugal", "country": "Portugal", "type": "country", "osm_key": "place", "osm_value": "country", "osm_type": "R", "osm_id": 2, "extent": [-9.6, 42.2, -6.2, 36.9]}}]},
    "oregon": {"features": [{"geometry": {"coordinates": [-120.5, 44.0]}, "properties": {"name": "Oregon", "country": "United States", "type": "state", "osm_key": "place", "osm_value": "state", "osm_type": "R", "osm_id": 3, "extent": [-124.7, 46.3, -116.4, 41.9]}}]},
    "hannover": {"features": [{"geometry": {"coordinates": [9.73, 52.37]}, "properties": {"name": "Hannover", "country": "Germany", "state": "Lower Saxony", "type": "city", "osm_key": "place", "osm_value": "city", "osm_type": "R", "osm_id": 4, "extent": [9.6, 52.45, 9.9, 52.3]}}]},
}

class Quiet(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, ".js": "text/javascript", ".mjs": "text/javascript", ".webmanifest": "application/manifest+json"}
    def log_message(self, *a): pass
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()
    def translate_path(self, path):
        p = urlparse(path).path
        if not p.startswith(SUBPATH + "/") and p != SUBPATH:
            return os.path.join(ROOT, "__nope__")
        return super().translate_path(p[len(SUBPATH):] or "/")

def serve_root():
    handler = functools.partial(Quiet, directory=ROOT)
    class Srv(socketserver.ThreadingTCPServer):
        allow_reuse_address = True
        daemon_threads = True
    srv = Srv(("127.0.0.1", 0), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, srv.server_address[1]

async def fake_world(context, log, eonet="ok", geocode="ok", events=None, chat=None):
    payload = events if events is not None else EVENTS
    async def tiles(route):
        url = route.request.url
        if "arcgisonline.com" in url:
            body = png((0, 0, 0, 0)) if "Reference" in url else png((40, 70, 120, 255))
            log.append(("esri", url))
            await route.fulfill(status=200, content_type="image/png", body=body)
        else:
            q = {k.upper(): v for k, v in parse_qs(urlparse(url).query, keep_blank_values=True).items()}
            t = (q.get("TIME") or [""])[0]
            layer = (q.get("LAYERS") or [""])[0]
            req = (q.get("REQUEST") or [""])[0]
            log.append(("gibs", t, layer, req, url))
            if layer.startswith("MODIS_Terra_Thermal") or layer.startswith("IMERG"):
                body = png((255, 120, 0, 120))
            else:
                body = png(gibs_color(t))
            await route.fulfill(status=200, content_type="image/png", body=body)
    await context.route(re.compile(r"https://(server\.arcgisonline\.com|gibs\.earthdata\.nasa\.gov)/.*"), tiles)

    async def eonet_route(route):
        log.append(("eonet", route.request.url))
        if eonet == "fail": await route.abort("internetdisconnected")
        else: await route.fulfill(status=200, content_type="application/json", body=json.dumps(payload), headers={"access-control-allow-origin": "*"})
    await context.route(re.compile(r"https://eonet\.gsfc\.nasa\.gov/.*"), eonet_route)

    async def photon(route):
        q = parse_qs(urlparse(route.request.url).query).get("q", [""])[0].lower()
        log.append(("photon", route.request.url))
        if geocode in ("fail", "photon-fail"): await route.abort("internetdisconnected"); return
        data = next((v for k, v in PHOTON.items() if k.startswith(q[:4]) and q[:4]), {"features": []})
        await route.fulfill(status=200, content_type="application/json", body=json.dumps(data), headers={"access-control-allow-origin": "*"})
    await context.route(re.compile(r"https://photon\.komoot\.io/.*"), photon)

    async def meteo(route):
        log.append(("open-meteo", route.request.url))
        if geocode == "fail": await route.abort("internetdisconnected"); return
        name = parse_qs(urlparse(route.request.url).query).get("name", [""])[0].lower()
        results = [{"id": 99, "name": "Kathmandu", "latitude": 27.7, "longitude": 85.32, "feature_code": "PPLC", "country": "Nepal", "admin1": "Bagmati"}] if name.startswith("kath") else []
        await route.fulfill(status=200, content_type="application/json", body=json.dumps({"results": results}), headers={"access-control-allow-origin": "*"})
    await context.route(re.compile(r"https://geocoding-api\.open-meteo\.com/.*"), meteo)

    if chat is not None:
        async def chat_route(route):
            log.append(("chat", route.request.post_data))
            if route.request.method == "OPTIONS":
                await route.fulfill(status=204, headers={"access-control-allow-origin": "*", "access-control-allow-headers": "content-type", "access-control-allow-methods": "POST"})
            else:
                await route.fulfill(status=200, content_type="application/json", body=json.dumps({"reply": chat}), headers={"access-control-allow-origin": "*"})
        await context.route(re.compile(r"https://chat\.example\.test/.*"), chat_route)

    # Anything else on the internet is blocked, so a forgotten dependency shows up as a failure.
    async def block(route):
        log.append(("blocked", route.request.url))
        await route.abort("blockedbyclient")
    await context.route(re.compile(r"https://(?!server\.arcgisonline\.com|gibs\.earthdata\.nasa\.gov|eonet\.gsfc\.nasa\.gov|photon\.komoot\.io|geocoding-api\.open-meteo\.com|chat\.example\.test).*"), block)

# A signed-in test account (device accounts), seeded once so the sign-in screen is skipped.
# Only written when nothing is stored yet, so logging out inside a test sticks across reloads.
SIGNED_IN = """(() => { try { if (!localStorage.getItem('echo-web-auth-v1')) {
  localStorage.setItem('echo-web-auth-v1', JSON.stringify({ users: [{ id: 'u-test', name: 'Test Person', email: 'test@example.com', salt: '00000000000000000000000000000000', iterations: 1000, hash: 'x', createdAt: '2026-10-01T00:00:00Z' }], session: { userId: 'u-test', at: 0 } }));
  localStorage.setItem('echo-web-pref-returning', 'true'); } } catch (e) {} })();"""

FROZEN_TIME = "2026-10-19T12:00:00Z"
CLOCK = "(() => { const T = new Date('%s').getTime(); const D = Date; class F extends D { constructor(...a) { super(...(a.length ? a : [T + (performance.now())])); } static now() { return T + performance.now(); } } window.Date = F; })();" % FROZEN_TIME

async def open_web(p, port, log, problems, w=1440, h=900, mobile=False, scale=1, eonet="ok", geocode="ok", events=None, init=None, hash="", chat=None, storage=None, permissions=None, geo=None, reduced=False, signed_in=True, wait_ready=True):
    b = await p.chromium.launch()
    kw = dict(viewport={"width": w, "height": h}, device_scale_factor=scale, is_mobile=mobile, has_touch=mobile, accept_downloads=True, timezone_id="Europe/Berlin", locale="en-GB")
    if permissions: kw["permissions"] = permissions
    if geo: kw["geolocation"] = geo
    if reduced: kw["reduced_motion"] = "reduce"
    ctx = await b.new_context(**kw)
    await fake_world(ctx, log, eonet=eonet, geocode=geocode, events=events, chat=chat)
    await ctx.add_init_script(CLOCK)
    if signed_in: await ctx.add_init_script(SIGNED_IN)
    if storage: await ctx.add_init_script(storage)
    if init: await ctx.add_init_script(init)
    page = await ctx.new_page()
    watch(page, problems)
    await page.goto(f"http://127.0.0.1:{port}{SUBPATH}/{hash}")
    if wait_ready:
        await page.wait_for_selector(".app.is-ready", timeout=10000)
        await page.wait_for_timeout(600)
    return b, ctx, page

results = []
def check(name, cond, extra=""):
    ok = bool(cond)
    results.append((name, ok))
    print(("PASS  " if ok else "FAIL  ") + name + (f"   [{extra}]" if (extra and not ok) else ""), flush=True)

def summary(problems, ignore=()):
    probs = [p for p in problems if not any(i in p for i in ignore)]
    bad = [n for n, ok in results if not ok]
    print(f"\n{len(results) - len(bad)}/{len(results)} checks passed; console/page problems: {len(probs)}")
    for p in probs: print("  PROBLEM", p)
    for n in bad: print("  FAILED:", n)
    return not bad and not probs

async def rect(page, selector):
    return await page.evaluate("(s) => { const el = document.querySelector(s); if (!el) return null; const r = el.getBoundingClientRect(); return {x:r.x, y:r.y, w:r.width, h:r.height, cx:r.x+r.width/2, cy:r.y+r.height/2, b:r.bottom, r:r.right}; }", selector)

async def drag(page, x0, y0, x1, y1, steps=14, delay=30):
    await page.mouse.move(x0, y0)
    await page.mouse.down()
    for i in range(1, steps + 1):
        await page.mouse.move(x0 + (x1 - x0) * i / steps, y0 + (y1 - y0) * i / steps)
        await page.wait_for_timeout(delay)
    await page.mouse.up()
