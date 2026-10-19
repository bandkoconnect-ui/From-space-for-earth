import asyncio, json, sys
sys.path.insert(0, ".")
from phone_helpers import *
from playwright.async_api import async_playwright

FAKE = """
(() => {
  const load = () => { try { return JSON.parse(localStorage.getItem('__fakefs') || '{}'); } catch { return {}; } };
  const files = load();
  const save = () => localStorage.setItem('__fakefs', JSON.stringify(files));
  const calls = [];
  const rec = (name, args) => calls.push([name, args === undefined ? null : JSON.parse(JSON.stringify(args))]);
  window.__fake = { files, calls, listeners: {}, geo: { lat: 27.7, lng: 85.3, acc: 25 }, geoError: null, shareFail: null, writes: 0 };
  window.Capacitor = {
    isNativePlatform: () => true,
    getPlatform: () => 'android',
    Plugins: {
      Filesystem: {
        async readFile({ path, directory }) { rec('fs.read', { path, directory }); const k = directory + '/' + path; if (!(k in files)) throw new Error('File does not exist.'); return { data: files[k] }; },
        async writeFile({ path, data, directory }) { rec('fs.write', { path, directory, len: data.length }); window.__fake.writes++; files[directory + '/' + path] = data; save(); return { uri: 'file:///fake/' + directory + '/' + path }; }
      },
      Share: { async share(o) { rec('share', o); if (window.__fake.shareFail) throw new Error(window.__fake.shareFail); return {}; } },
      Browser: { async open(o) { rec('browser.open', o); } },
      Geolocation: { async getCurrentPosition() { rec('geo'); if (window.__fake.geoError) throw new Error(window.__fake.geoError); const g = window.__fake.geo; return { coords: { latitude: g.lat, longitude: g.lng, accuracy: g.acc } }; } },
      Haptics: { async impact(o) { rec('haptics', o); } },
      Network: { async getStatus() { return { connected: true }; }, async addListener(ev, cb) { window.__fake.listeners.network = cb; return { remove() {} }; } },
      App: { async addListener(ev, cb) { window.__fake.listeners[ev] = cb; return { remove() {} }; }, exitApp() { rec('exitApp'); } },
      StatusBar: { async setStyle(o) { rec('status.style', o); }, async setBackgroundColor(o) { rec('status.bg', o); } },
      SplashScreen: { async hide() { rec('splash.hide'); } }
    }
  };
  window.open = (u) => { rec('window.open', u); return null; };
})();
"""

PREFS_ONLY = """
(() => {
  const store = () => { try { return JSON.parse(localStorage.getItem('__fakeprefs') || '{}'); } catch { return {}; } };
  window.__calls = [];
  window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'ios', Plugins: {
    Preferences: {
      async get({ key }) { window.__calls.push('get'); return { value: store()[key] ?? null }; },
      async set({ key, value }) { window.__calls.push('set'); const s = store(); s[key] = value; localStorage.setItem('__fakeprefs', JSON.stringify(s)); }
    } } };
})();
"""

async def calls(page, name=None):
    c = await page.evaluate("window.__fake.calls")
    return [x for x in c if name is None or x[0] == name]

async def main():
    srv, port = serve("mobile")
    log, problems = [], []
    async with async_playwright() as p:
        b, ctx, page = await new_phone(p, port, log, problems, init=FAKE)
        # ---- start-up ----
        cls = await page.get_attribute("body", "class")
        check("N1 body marked native + android", "native" in cls and "os-android" in cls, cls)
        names = [c[0] for c in await calls(page)]
        check("N2 status bar styled and splash hidden", "status.style" in names and "status.bg" in names and "splash.hide" in names, names)
        check("N3 storage read through Filesystem (DATA)", any(c[1]["directory"] == "DATA" and c[1]["path"] == "echo-data.json" for c in await calls(page, "fs.read")))
        check("N4 web localStorage is NOT used for app data", await page.evaluate("localStorage.getItem('echo-data-v1')") is None)

        # ---- persistence + backup ----
        await page.click(".tab[data-nav=saved]"); await page.wait_for_timeout(300)
        async def rename(old_sel, new):
            await page.click(f"{old_sel} .more"); await page.wait_for_timeout(300)
            await page.click(".action-row:has-text('Rename')"); await page.wait_for_timeout(500)
            await page.fill(".sheet-panel input", new); await page.keyboard.press("Enter"); await page.wait_for_timeout(700)
        await rename(".saved-card:nth-child(1)", "First rename")
        f = await page.evaluate("window.__fake.files")
        check("N5 save written to DATA/echo-data.json", "DATA/echo-data.json" in f and "First rename" in f["DATA/echo-data.json"], list(f))
        check("N6 no backup yet after the very first write", "DATA/echo-data.bak.json" not in f)
        await rename(".saved-card:nth-child(1)", "Second rename")
        f = await page.evaluate("window.__fake.files")
        check("N7 second write keeps the previous good copy as .bak", "Second rename" in f["DATA/echo-data.json"] and "First rename" in f.get("DATA/echo-data.bak.json", ""))
        await page.reload(); await page.wait_for_selector(".bsheet"); await page.wait_for_timeout(800)
        check("N8 data survives a relaunch", await page.evaluate("window.__echo.app.store.list().some(i => i.title === 'Second rename')"))
        # corrupt the main file: the app must recover from the backup, not start empty
        await page.evaluate("(() => { const f = JSON.parse(localStorage.getItem('__fakefs')); f['DATA/echo-data.json'] = '{\"schema\":1,\"investig'; localStorage.setItem('__fakefs', JSON.stringify(f)); })()")
        await page.reload(); await page.wait_for_selector(".bsheet"); await page.wait_for_timeout(800)
        titles = await page.evaluate("window.__echo.app.store.list().map(i => i.title)")
        check("N9 truncated main file -> recovered from the last good copy", "First rename" in titles, titles)

        # ---- background save ----
        await page.evaluate("window.__echo.app.store.setSettings({ showLabels: false })")
        w0 = await page.evaluate("window.__fake.writes")
        await page.evaluate("window.__fake.listeners.appStateChange({ isActive: false })"); await page.wait_for_timeout(60)
        check("N10 going to the background flushes pending changes at once", await page.evaluate("window.__fake.writes") > w0 and '"showLabels":false' in (await page.evaluate("window.__fake.files"))["DATA/echo-data.json"].replace(" ", ""))

        # ---- share / export ----
        await page.click(".tab[data-nav=saved]"); await page.wait_for_timeout(300)
        await page.click(".saved [aria-label=Settings]"); await page.wait_for_timeout(500)
        await page.click("button:has-text('Export a backup')"); await page.wait_for_timeout(700)
        w = await calls(page, "fs.write"); sh = await calls(page, "share")
        check("N11 export writes to the CACHE folder then opens the share sheet", any(c[1]["directory"] == "CACHE" and c[1]["path"].startswith("echo-workspace-") for c in w) and len(sh) == 1 and sh[0][1]["url"].startswith("file:///fake/CACHE/echo-workspace-"), sh)
        check("N12 toast confirms the backup", "Backup saved" in await page.inner_text(".toast"))
        await page.evaluate("window.__fake.shareFail = 'Share canceled'"); await page.evaluate("document.querySelector('.toast').classList.remove('show'); document.querySelector('.toast').textContent=''")
        await page.click("button:has-text('Export a backup')"); await page.wait_for_timeout(600)
        check("N13 cancelling the share sheet is silent", await page.inner_text(".toast") == "")
        await page.evaluate("window.__fake.shareFail = 'Something broke'")
        async with page.expect_download() as dl:
            await page.click("button:has-text('Export a backup')")
        d = await dl.value
        check("N14 a failing share falls back to a normal download", d.suggested_filename.startswith("echo-workspace-"))
        await page.evaluate("window.__fake.shareFail = null")
        check("N15 settings says where data lives (native wording)", "private storage on this phone" in await page.inner_text(".settings") and "android" in await page.inner_text(".settings"))
        await page.keyboard.press("Escape"); await page.wait_for_timeout(300)

        # ---- external links ----
        await page.click(".tab[data-nav=explore]"); await page.wait_for_timeout(500)
        await page.evaluate("window.__echo.views.explore.setSnap('full')"); await page.wait_for_timeout(500)
        await page.click(".evidence-row:nth-of-type(1)"); await page.wait_for_timeout(300)
        bo = await calls(page, "browser.open"); wo = await calls(page, "window.open")
        check("N16 evidence links open in the in-app browser plugin", len(bo) == 1 and bo[0][1]["url"].startswith("https://") and not wo, (bo, wo))
        await page.click("button:has-text('Worldview')"); await page.wait_for_timeout(300)
        bo = await calls(page, "browser.open")
        check("N17 Worldview opens through the browser plugin", len(bo) == 2 and "worldview.earthdata.nasa.gov" in bo[1][1]["url"], bo)
        await page.evaluate("window.__echo.views.explore.setSnap('peek')"); await page.wait_for_timeout(500)

        # ---- location ----
        await page.click(".fab[aria-label='Show my location']"); await page.wait_for_timeout(800)
        dbg = await page.evaluate("(() => { const m = window.__echo.views.explore.debugMap(); const c = m.map.getCenter(); return { layers: m.userGroup.getLayers().length, lat: c.lat, lng: c.lng }; })()")
        check("N18 locate button draws the dot + accuracy circle and centres the map", dbg["layers"] == 2 and abs(dbg["lat"] - 27.7) < 0.05 and abs(dbg["lng"] - 85.3) < 0.05, dbg)
        await page.evaluate("window.__fake.geoError = 'User denied Geolocation'")
        await page.click(".fab[aria-label='Show my location']"); await page.wait_for_timeout(500)
        check("N19 denied -> plain-language toast", "Location is turned off for ECHO" in await page.inner_text(".toast"), await page.inner_text(".toast"))
        await page.evaluate("window.__fake.geoError = 'Location request timeout'")
        await page.click(".tab[data-nav=saved]"); await page.click(".saved [aria-label='New investigation']"); await page.wait_for_timeout(500)
        await page.click(".sheet-panel button:has-text('My location')"); await page.wait_for_timeout(500)
        check("N20 timeout -> plain-language message", "taking too long" in await page.inner_text(".field-error"))
        await page.evaluate("window.__fake.geoError = null")
        await page.click(".sheet-panel button:has-text('My location')"); await page.wait_for_timeout(500)
        check("N21 new-investigation form takes the native fix", await page.input_value("input[aria-label^='Location']") == "27.7000, 85.3000")
        await page.keyboard.press("Escape"); await page.wait_for_timeout(300)

        # ---- haptics, connection, back button ----
        hp = await calls(page, "haptics")
        check("N22 haptics fired for taps", len(hp) >= 3 and all(c[1]["style"] in ("LIGHT", "MEDIUM") for c in hp), len(hp))
        await page.evaluate("window.__fake.listeners.network({ connected: false })"); await page.wait_for_timeout(300)
        check("N23 network plugin drives the offline bar", await page.is_visible(".offline-bar"))
        await page.evaluate("window.__fake.listeners.network({ connected: true })"); await page.wait_for_timeout(300)
        check("N24 and clears it", not await page.is_visible(".offline-bar"))
        await page.click(".tab[data-nav=explore]"); await page.wait_for_timeout(400)
        await page.click(".saved [aria-label=Settings]") if False else None
        await page.evaluate("window.__echo.app.sheets.settings()"); await page.wait_for_timeout(500)
        await page.evaluate("window.__fake.listeners.backButton()"); await page.wait_for_timeout(400)
        check("N25 hardware back closes the sheet and does not exit", await page.locator(".sheet-modal").count() == 0 and not await calls(page, "exitApp"))
        await page.evaluate("window.__echo.views.explore.setSnap('half')"); await page.wait_for_timeout(400)
        await page.evaluate("window.__fake.listeners.backButton()"); await page.wait_for_timeout(400)
        check("N26 back steps the sheet down (half -> peek), still no exit", await page.evaluate("window.__echo.views.explore.snap()") == "peek" and not await calls(page, "exitApp"))
        await page.click(".tab[data-nav=pulse]"); await page.wait_for_timeout(400)
        await page.evaluate("window.__fake.listeners.backButton()"); await page.wait_for_timeout(400)
        check("N27 back from another tab returns to Explore", await page.get_attribute(".tab[data-nav=explore]", "aria-current") == "page" and not await calls(page, "exitApp"))
        await page.evaluate("window.__fake.listeners.backButton()"); await page.wait_for_timeout(300)
        check("N28 back at the root leaves the app", len(await calls(page, "exitApp")) == 1)
        await b.close()

        # ---- Preferences-only storage ----
        b, ctx, page = await new_phone(p, port, log, problems, init=PREFS_ONLY)
        check("N29 iOS-flavoured native: os class", "os-ios" in await page.get_attribute("body", "class"))
        await page.evaluate("window.__echo.app.store.setSettings({ showLabels: false })"); await page.wait_for_timeout(500)
        await page.reload(); await page.wait_for_selector(".bsheet"); await page.wait_for_timeout(700)
        check("N30 Preferences fallback persists across relaunch", await page.evaluate("window.__echo.app.store.settings().showLabels") is False and await page.evaluate("localStorage.getItem('echo-data-v1')") is None)
        await b.close()

        ok = summary(problems)
        sys.exit(0 if ok else 1)
asyncio.run(main())
