#!/usr/bin/env python3
"""Accounts on the web app: the sign-in screen, the three welcome cards after sign-up (never after
log-in), logging out and back in, errors, phones, and Ask ECHO switched off for now."""
import asyncio, json, sys
from web_helpers import *
from playwright.async_api import async_playwright

GATE = "#gate"
OB = "dialog.onboarding[open]"

async def open_form(page, which="signup"):
    """From the landing, press Create account or Log in and wait for the form to rise."""
    await page.click(f"#gate-cta-{which}")
    await page.wait_for_selector("#gate[data-view='form'] .gate-panel", state="visible")
    await page.wait_for_timeout(900)

async def sign_up(page, name="Ada Lovelace", email="ada@example.com", password="orbit-705km"):
    if await page.get_attribute("#gate", "data-view") == "landing": await open_form(page, "signup")
    await page.fill("#gate-name", name)
    await page.fill("#gate-email", email)
    await page.fill("#gate-password", password)
    await page.click(".gate-submit")

async def main():
    srv, port = serve_root()
    log, problems = [], []
    async with async_playwright() as p:
        # ---- first visit: the sign-in screen comes before the map ----
        b, ctx, page = await open_web(p, port, log, problems, signed_in=False, wait_ready=False, hash="#inv=demo-nepal")
        await page.wait_for_selector(GATE)
        await page.wait_for_timeout(300)
        check("L1 a first visit opens on the landing page, not the map or a form", await page.is_visible(".gate-hero-title") and "See the whole story." in await page.inner_text(".gate-hero-title") and await page.is_hidden("#gate-name") and not await page.evaluate("!!document.querySelector('#map')"))
        check("L2 the landing's only actions are Create account (first) and Log in", [t.strip() for t in await page.locator(".gate-cta button").all_inner_texts()] == ["Create account", "Log in"] and "btn-primary" in await page.get_attribute("#gate-cta-signup", "class"))
        check("L3 the landing has the Earth image and the orbit", await page.evaluate("(() => { const i = document.querySelector('.gate-earth img'); return i.complete && i.naturalWidth >= 2000 && !!document.querySelector('.gate-orbit ellipse'); })()"))
        await page.keyboard.press("Tab"); await page.keyboard.press("Tab")
        check("L4 keyboard users reach Create account straight after the corner Log in", await page.evaluate("document.activeElement.id") == "gate-cta-signup")
        await open_form(page, "signup")
        await page.click(".gate-back")
        await page.wait_for_timeout(1000)
        check("L5 Back returns to the landing", await page.get_attribute(GATE, "data-view") == "landing" and await page.is_visible(".gate-hero-title") and await page.is_hidden(".gate-card"))
        await open_form(page, "signup")
        await page.keyboard.press("Escape")
        await page.wait_for_timeout(700)
        check("L6 Escape also returns to the landing", await page.get_attribute(GATE, "data-view") == "landing")
        await page.click(".gate-bar-login")
        await page.wait_for_timeout(1000)
        check("L7 the Log in button in the corner opens the form on Log in", await page.get_attribute("#tab-login", "aria-selected") == "true" and await page.is_visible("#gate-email") and await page.is_hidden(".gate-hero-title"))
        await page.click(".gate-back"); await page.wait_for_timeout(700)
        await open_form(page, "signup")
        check("A1 Create account opens the form on Sign up", await page.is_visible("#gate-name") and await page.get_attribute("#tab-signup", "aria-selected") == "true")
        check("A2 the form says accounts stay in this browser (device mode)", "this browser only" in await page.inner_text(GATE))
        check("A3 the name field has focus", await page.evaluate("document.activeElement.id") == "gate-name")

        await page.click(".gate-submit")
        check("A4 an empty form asks for a name", "Enter your name" in await page.inner_text("#gate-name-error") and await page.get_attribute("#gate-name", "aria-invalid") == "true")
        await page.fill("#gate-name", "Ada Lovelace")
        await page.fill("#gate-email", "ada@")
        await page.fill("#gate-password", "orbit-705km")
        await page.click(".gate-submit")
        check("A5 a malformed email is caught", "valid email" in await page.inner_text("#gate-email-error"))
        await page.fill("#gate-email", "ada@example.com")
        await page.fill("#gate-password", "short")
        await page.click(".gate-submit")
        check("A6 a short password is caught", "at least 8" in await page.inner_text("#gate-password-error"))
        await page.click(".gate-reveal")
        check("A7 the password can be shown", await page.get_attribute("#gate-password", "type") == "text" and await page.get_attribute(".gate-reveal", "aria-pressed") == "true")
        await page.click(".gate-reveal")

        await page.fill("#gate-password", "orbit-705km")
        await page.click(".gate-submit")
        await page.wait_for_selector(".app.is-ready", timeout=10000)
        await page.wait_for_selector(OB, timeout=4000)
        check("A8 signing up opens the map with the welcome cards on top", await page.is_visible("#map") and await page.is_visible(OB))
        check("A9 the sign-in screen is gone", not await page.evaluate("!!document.querySelector('#gate')"))
        check("A10 the deep link survives sign-up (Nepal report open)", "Nepal" in await page.inner_text(".report-title"))
        stored = await page.evaluate("localStorage.getItem('echo-web-auth-v1')")
        check("A11 the password is not stored, only a salted hash", "orbit-705km" not in stored and len(json.loads(stored)["users"][0]["hash"]) == 64)

        # ---- the three cards ----
        check("A12 card 1 greets by first name", "Welcome to ECHO, Ada." in await page.inner_text(OB) and await page.get_attribute(OB, "data-card") == "1")
        check("A13 card 1 has Skip and Next, no Back", await page.is_visible(".ob-skip") and await page.inner_text(".ob-next") == "Next" and await page.is_hidden(".ob-back"))
        await page.click(".ob-next")
        check("A14 Next goes to card 2", await page.get_attribute(OB, "data-card") == "2" and await page.is_visible(".ob-back"))
        await page.click(".ob-back")
        check("A15 Back returns to card 1", await page.get_attribute(OB, "data-card") == "1")
        await page.click(".ob-next"); await page.click(".ob-next")
        check("A16 card 3 ends with Start exploring", await page.get_attribute(OB, "data-card") == "3" and await page.inner_text(".ob-next") == "Start exploring")
        await page.wait_for_timeout(450)
        await page.screenshot(path="auth-cards-desktop.png")
        await page.click(".ob-next")
        await page.wait_for_timeout(300)
        check("A17 Start exploring closes the cards and leaves the map ready", not await page.evaluate("!!document.querySelector('dialog.onboarding')") and await page.is_visible("#map"))

        # ---- returning: no gate, no cards ----
        await page.reload()
        await page.wait_for_selector(".app.is-ready", timeout=10000)
        await page.wait_for_timeout(600)
        check("A18 a reload keeps you signed in, without the cards", not await page.evaluate("!!document.querySelector('#gate, dialog.onboarding')"))
        check("A19 the account button shows initials", (await page.inner_text("#account-button")).strip() == "AL")

        # ---- Ask ECHO is switched off ----
        await page.click(".report-nav .nav-link:text('Ask ECHO')")
        await page.wait_for_selector(".toast:has-text('Ask ECHO will be here soon')", timeout=3000)
        check("A20 the Ask ECHO tab says it is coming soon", True)
        await page.click(".chat-send")
        await page.wait_for_timeout(200)
        check("A21 sending does not start a chat", await page.locator(".msg").count() == 0 and await page.locator(".toast:has-text('here soon')").count() >= 1)

        # ---- log out, then log back in ----
        await page.click("#account-button")
        await page.wait_for_selector("dialog[open]")
        check("A22 the account dialog shows who is signed in", "ada@example.com" in await page.inner_text("dialog[open]"))
        await page.click("dialog[open] .btn-primary:has-text('Log out')")
        await page.wait_for_selector(GATE, timeout=10000)
        await page.wait_for_timeout(300)
        check("A23 after logging out, the landing leads with Log in", [t.strip() for t in await page.locator(".gate-cta button").all_inner_texts()] == ["Log in", "Create account"] and "btn-primary" in await page.get_attribute("#gate-cta-login", "class"))
        await open_form(page, "login")
        check("A23b Log in opens the form on Log in", await page.get_attribute("#tab-login", "aria-selected") == "true" and await page.is_hidden("#gate-name"))
        await page.fill("#gate-email", "ada@example.com")
        await page.fill("#gate-password", "wrong-password")
        await page.click(".gate-submit")
        await page.wait_for_selector("#gate-password-error:not(:empty)")
        check("A24 a wrong password is refused", "do not match" in await page.inner_text("#gate-password-error"))
        await page.fill("#gate-email", "ADA@example.com ")
        await page.fill("#gate-password", "orbit-705km")
        await page.click(".gate-submit")
        await page.wait_for_selector(".app.is-ready", timeout=10000)
        await page.wait_for_timeout(700)
        check("A25 logging in (email in any case) opens the map with no cards", not await page.evaluate("!!document.querySelector('dialog.onboarding')"))

        # ---- a second account with the same email ----
        await page.click("#account-button")
        await page.click("dialog[open] .btn-primary:has-text('Log out')")
        await page.wait_for_selector(GATE, timeout=10000)
        await page.wait_for_timeout(300)
        await sign_up(page, name="Someone Else")
        await page.wait_for_selector("#gate-email-error:not(:empty)")
        check("A26 an email can only be used once", "already exists" in await page.inner_text("#gate-email-error"))
        await page.keyboard.press("Shift+Tab")
        await page.focus("#tab-signup")
        await page.keyboard.press("ArrowRight")
        check("A27 arrow keys switch the tabs", await page.get_attribute("#tab-login", "aria-selected") == "true" and await page.evaluate("document.activeElement.id") == "tab-login")
        await b.close()

        # ---- Skip, and Escape ----
        for key, label in (("skip", "A28 Skip closes the cards at once"), ("escape", "A29 Escape closes the cards")):
            b, ctx, page = await open_web(p, port, log, problems, signed_in=False, wait_ready=False)
            await page.wait_for_selector(GATE)
            await sign_up(page, email=f"{key}@example.com")
            await page.wait_for_selector(OB, timeout=10000)
            if key == "skip": await page.click(".ob-skip")
            else: await page.keyboard.press("Escape")
            await page.wait_for_timeout(300)
            check(label, not await page.evaluate("!!document.querySelector('dialog.onboarding')") and await page.is_visible("#map"))
            await b.close()

        # ---- phone ----
        b, ctx, page = await open_web(p, port, log, problems, w=390, h=844, mobile=True, scale=2, signed_in=False, wait_ready=False)
        await page.wait_for_selector(GATE)
        await page.wait_for_timeout(400)
        check("A30 the phone screen has no sideways scroll", await page.evaluate("document.documentElement.scrollWidth <= innerWidth && getComputedStyle(document.querySelector('#gate')).overflowX === 'clip'"))
        cta = await rect(page, "#gate-cta-signup")
        title = await rect(page, ".gate-hero-title")
        check("A30b on phones the headline and buttons fit and sit on screen", title["x"] >= 0 and title["r"] <= 390 and cta["b"] <= 844 and cta["w"] >= 280, (title, cta))
        await page.screenshot(path="auth-landing-phone.png")
        await open_form(page, "signup")
        card = await rect(page, ".gate-card")
        check("A31 the form fits the phone width", card["x"] >= 0 and card["r"] <= 390, card)
        check("A32 inputs are 16px so iOS does not zoom", await page.evaluate("getComputedStyle(document.querySelector('#gate-email')).fontSize") == "16px")
        await page.screenshot(path="auth-gate-phone.png")
        await sign_up(page, email="phone@example.com")
        await page.wait_for_selector(OB, timeout=10000)
        await page.wait_for_timeout(500)
        ob = await rect(page, OB)
        check("A33 the cards float inside the phone screen, like desktop", ob["x"] >= 8 and ob["r"] <= 382 and ob["y"] >= 8 and ob["b"] <= 836, ob)
        await page.screenshot(path="auth-cards-phone.png")
        await page.click(".ob-skip")
        for _ in range(3):  # open the explore sheet until its footer (About, Settings) shows
            if await page.is_visible(".sb-foot button:has-text('Settings')"): break
            await page.evaluate("window.__echo.app.cycleSheet('sidebar')"); await page.wait_for_timeout(500)
        await page.click(".sb-foot button:has-text('Settings')")
        await page.wait_for_selector("dialog[open]")
        check("A34 on phones, Settings shows the account and Log out", "phone@example.com" in await page.inner_text("dialog[open]") and await page.is_visible("dialog[open] button:has-text('Log out')"))
        await b.close()

        # ---- desktop screenshot of the sign-in screen ----
        b, ctx, page = await open_web(p, port, log, problems, signed_in=False, wait_ready=False)
        await page.wait_for_selector(GATE)
        await page.wait_for_timeout(400)
        await page.screenshot(path="auth-landing-desktop.png")
        await open_form(page, "signup")
        await page.screenshot(path="auth-gate-desktop.png")
        await b.close()

    srv.shutdown()
    sys.exit(0 if summary(problems) else 1)

asyncio.run(main())
