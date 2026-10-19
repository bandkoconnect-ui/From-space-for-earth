"""Shared helpers: static server for dist/<target>, fake network (tiles + EONET + chat), PNG generation."""
import asyncio, functools, http.server, json, os, pathlib, socketserver, struct, threading, zlib, re
from urllib.parse import urlparse, parse_qs

ROOT = str(pathlib.Path(__file__).resolve().parents[2])  # the repository root

def png(rgba, size=256):
    r, g, b, a = rgba
    row = b"\x00" + bytes([r, g, b, a]) * size
    raw = row * size
    def chunk(t, d):
        c = struct.pack(">I", len(d)) + t + d
        return c + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b"")

# GIBS colour per TIME so before/after are distinguishable in screenshots.
GIBS_COLORS = {"2026-08-12": (200, 40, 40, 255), "2026-08-24": (200, 140, 40, 255), "2026-08-27": (40, 90, 220, 255), "2026-09-03": (40, 200, 120, 255)}
def gibs_color(time):
    return GIBS_COLORS.get(time, (120, 120, 120, 255))

EONET = {"events": [
    {"id": "EONET_1", "title": "Wildfire Alpha, Portugal", "description": "A large fire.", "link": "https://eonet.gsfc.nasa.gov/api/v3/events/EONET_1", "closed": None,
     "categories": [{"id": "wildfires", "title": "Wildfires"}], "sources": [{"id": "IRWIN", "url": "https://example.org/fire"}],
     "geometry": [{"magnitudeValue": 100, "magnitudeUnit": "acres", "date": "2026-10-10T00:00:00Z", "type": "Point", "coordinates": [-8.1, 40.2]}, {"magnitudeValue": 400, "magnitudeUnit": "acres", "date": "2026-10-15T00:00:00Z", "type": "Point", "coordinates": [-8.0, 40.3]}]},
    {"id": "EONET_2", "title": "Tropical Storm Beta", "description": "", "link": "https://eonet.gsfc.nasa.gov/api/v3/events/EONET_2", "closed": None,
     "categories": [{"id": "severeStorms", "title": "Severe Storms"}], "sources": [{"id": "JTWC", "url": "https://example.org/storm"}],
     "geometry": [{"magnitudeValue": 45, "magnitudeUnit": "kts", "date": "2026-10-12T00:00:00Z", "type": "Point", "coordinates": [130.0, 15.0]}, {"magnitudeValue": 55, "magnitudeUnit": "kts", "date": "2026-10-17T00:00:00Z", "type": "Point", "coordinates": [128.5, 17.5]}]},
    {"id": "EONET_3", "title": "Mount Gamma eruption", "description": "Ash plume.", "link": "https://eonet.gsfc.nasa.gov/api/v3/events/EONET_3", "closed": None,
     "categories": [{"id": "volcanoes", "title": "Volcanoes"}], "sources": [{"id": "SIVolcano", "url": "https://example.org/volcano"}],
     "geometry": [{"magnitudeValue": None, "magnitudeUnit": None, "date": "2026-10-18T00:00:00Z", "type": "Point", "coordinates": [-78.4, -0.2]}]},
]}

class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

def serve(target="desktop"):
    handler = functools.partial(Quiet, directory=os.path.join(ROOT, "dist", target))
    class Srv(socketserver.ThreadingTCPServer):
        allow_reuse_address = True
        daemon_threads = True
    srv = Srv(("127.0.0.1", 0), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, srv.server_address[1]

async def fake_network(context, log, eonet="ok", chat=None):
    """Route all third-party hosts. `log` collects (kind, url) tuples."""
    async def tiles(route):
        url = route.request.url
        if "arcgisonline.com" in url:
            if "Reference" in url:
                body = png((0, 0, 0, 0))
            else:
                body = png((52, 70, 48, 255))
            log.append(("esri", url))
            await route.fulfill(status=200, content_type="image/png", body=body, headers={"access-control-allow-origin": "*"})
        elif "gibs.earthdata.nasa.gov" in url:
            q = parse_qs(urlparse(url).query, keep_blank_values=True)
            t = (q.get("TIME") or q.get("time") or [""])[0]
            layer = (q.get("LAYERS") or q.get("layers") or [""])[0]
            log.append(("gibs", t, layer, url))
            if layer.startswith("MODIS_Terra_Thermal") or layer.startswith("IMERG"):
                body = png((255, 120, 0, 120))
            else:
                body = png(gibs_color(t))
            await route.fulfill(status=200, content_type="image/png", body=body, headers={"access-control-allow-origin": "*"})
        else:
            await route.continue_()
    await context.route(re.compile(r"https://(server\.arcgisonline\.com|gibs\.earthdata\.nasa\.gov)/.*"), tiles)

    async def eonet_route(route):
        log.append(("eonet", route.request.url))
        if eonet == "fail":
            await route.abort("internetdisconnected")
        else:
            await route.fulfill(status=200, content_type="application/json", body=json.dumps(EONET), headers={"access-control-allow-origin": "*"})
    await context.route(re.compile(r"https://eonet\.gsfc\.nasa\.gov/.*"), eonet_route)

    if chat is not None:
        async def chat_route(route):
            log.append(("chat", route.request.post_data))
            if route.request.method == "OPTIONS":
                await route.fulfill(status=204, headers={"access-control-allow-origin": "*", "access-control-allow-headers": "content-type", "access-control-allow-methods": "POST"})
            else:
                await route.fulfill(status=200, content_type="application/json", body=json.dumps({"reply": chat}), headers={"access-control-allow-origin": "*"})
        await context.route(re.compile(r"https://chat\.example\.test/.*"), chat_route)

def watch(page, problems):
    page.on("pageerror", lambda e: problems.append(f"pageerror: {e}"))
    def on_console(m):
        t = m.text
        if m.type in ("error", "warning") and "Failed to load resource" not in t:
            problems.append(f"console.{m.type}: {t}")
    page.on("console", on_console)
