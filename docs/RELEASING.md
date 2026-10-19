# Releasing ECHO

Read this before you publish anything. It lists what I could not do or test from the build environment (no Electron, no Android Studio, no Xcode, no real devices, and no access to NASA or Esri servers from there), so those steps are yours to run and check. The same list for the stores, as tick boxes, is in [`store/submission-checklist.md`](../store/submission-checklist.md).

## 0. One-time setup

1. Install Node.js 20+ and run `npm install`.
2. The dependencies in `package.json` are set to `"latest"` because I could not install them here to pin exact versions. After your first successful install, replace each `"latest"` with the version number that was installed (`npm ls --depth=0` shows them), and commit `package-lock.json`. Do this before your first release so builds are repeatable.
3. Capacitor's Android and iOS projects need a matching set of plugin versions. Keep every `@capacitor/*` package on the same major version, and read Capacitor's current requirements for Android Studio, JDK, Xcode and CocoaPods at https://capacitorjs.com/docs/getting-started/environment-setup.
4. Run `npm test`, then `python3 tools/e2e/run.py` (needs `pip install playwright pillow` and `playwright install chromium`).

## 1. Decide these before the first public release

**App identity.** The id `com.bandkoconnect.echo` is set in `capacitor.config.json` and in `package.json` (`build.appId`). Change both now if you want a different one. It cannot be changed after the store listings exist. Also set `author`, `license` and the copyright line in `package.json`.

**Imagery licensing.** NASA GIBS and EONET are free to use and ask for attribution (the apps show it). The satellite base map and place names come from Esri's public tile address (`ESRI_IMAGERY` in `packages/map/echo-map.js`). Esri's terms decide whether a published app may use that address and whether you need an ArcGIS account or key, and the rules differ for free and commercial use and have changed over time. Read the current terms for "World Imagery" and "World Boundaries and Places" before you publish. If they do not fit, change the two tile addresses in that one file to a provider you are licensed for (both apps pick it up); attribution text lives next to them.

**The AI service.** Anything an app can call, anyone can call. If you point the shipped apps at your own function, people can find the address and use your AI budget. Before launch:
- Put a hard spending limit on the provider account.
- Add real rate limiting (Netlify rate limiting rules, Cloudflare, or an API gateway). The per-IP counter in `netlify/functions/echo-chat.js` is best-effort only, because serverless instances do not share memory.
- Consider requiring a sign-in or an app-attestation token (Play Integrity, Apple App Attest) once there are many users.
- Set `ECHO_ALLOWED_ORIGINS` for the web prototype. Native apps do not send a useful origin, so origin checks do not protect against a determined caller.
- Or leave the address empty in your release. Ask ECHO still works with its built-in guide.

**Privacy policy.** Fill in `store/privacy-policy.md`, host it at a public address, and check it against your jurisdiction. It describes what the code does today; update it if you add analytics, accounts or sync.

**Licence.** `package.json` says `UNLICENSED`, meaning all rights reserved. Pick a licence if you want others to use or contribute.

## 2. Desktop app

```
npm run desktop           # run it
npm run desktop:dist      # build installers into release/
```

electron-builder builds for the operating system you run it on: Windows installers on Windows, macOS on a Mac, Linux on Linux. To build all three without three machines, use CI with one job per OS (GitHub Actions runners work).

| OS | Output | Notes |
| --- | --- | --- |
| Windows | NSIS installer (`.exe`) | Unsigned installers work but Windows SmartScreen warns. Sign with a code-signing certificate (set `CSC_LINK` and `CSC_KEY_PASSWORD`) or a signing service. |
| macOS | `.dmg` and `.zip` | To open without a warning the app must be signed with a Developer ID certificate and notarized (needs an Apple Developer account: set `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` and enable notarization in the `mac` block). Hardened runtime is already on. |
| Linux | `AppImage` and `.deb` | No signing needed. |

See https://www.electron.build/code-signing for the current signing steps; they change between versions.

Things I could not test: that the packaged app starts (the `app://echo` protocol reading from inside the `asar` archive), the native menus and the open/save dialogs, window-position memory across monitors, and the installers. After your first build, open the packaged app and do this: create an investigation, drag the compare slider, export a report and a backup, import the backup, quit and relaunch (everything should still be there), and open an external link (it should open in your normal browser).

Not included: auto-update, Mac App Store and Microsoft Store packaging. They are separate pieces of work.

The app icon is `apps/desktop/build/icon.png` (1024 x 1024).

## 3. Phone app

### First time

```
npm run mobile:setup
```

This builds the web part into `dist/mobile`, creates the `android/` and `ios/` projects (`cap add`), generates the icons and splash screens from `resources/` (`npm run mobile:assets`), and syncs. Commit the `android/` and `ios/` folders; the `.gitignore` already leaves out build output and signing files. iOS projects can only be created and built on a Mac with Xcode.

### Every time you change the app

```
npm run mobile:android     # build, sync, open Android Studio
npm run mobile:ios         # build, sync, open Xcode
```

Press Run in the IDE to try it on an emulator or a plugged-in phone.

### Do these edits once in the native projects

1. **Lock to portrait** (the phone design is for portrait).
   - Android: in `android/app/src/main/AndroidManifest.xml`, add `android:screenOrientation="portrait"` to the `<activity>` element.
   - iOS: in Xcode, select the App target > General > Deployment Info and untick Landscape Left and Right for iPhone.
2. **Location permission text** (iOS). In `ios/App/App/Info.plist` set `NSLocationWhenInUseUsageDescription` to something like: "ECHO uses your location once, when you tap My location, to start an investigation where you are."
3. **Permissions** (Android). The Geolocation plugin adds location permissions to the manifest. ECHO only needs a single approximate-or-precise fix; remove `ACCESS_FINE_LOCATION` if you want approximate only.
4. **Version numbers.** Android: `versionCode` (a whole number that must rise with every upload) and `versionName` in `android/app/build.gradle`. iOS: Version and Build in Xcode's General tab. Keep `version` in `package.json` in step; the app's About text reads it from `dist/mobile/version.json`.
5. **Icons and splash.** Replace the artwork in `resources/` (edit `resources/icon.svg`, run `python3 resources/render.py`, then `npm run mobile:assets`). Check the adaptive icon on a real Android launcher.

### What to check on a real phone (I could only test in a desktop browser with a fake Capacitor)

- The map draws and the compare slider drags; the bottom sheet drags between peek, half and full, and flicks.
- Open the keyboard in a note or in Ask ECHO: the input must stay visible above it, on iPhone and on Android. This is the least certain area. If it misbehaves, look at `watchViewport()` in `apps/mobile/www/app/main.js`.
- Status bar and bottom gesture bar: nothing important is hidden behind them. Recent Android versions draw apps edge to edge, so check the top and bottom spacing on Android 15 and later.
- Back button / back gesture on Android: closes a sheet first, then leaves a sub-view, then goes to Explore, then exits.
- My location prompt, allowed and denied.
- Export a report: the share sheet appears and "Save to Files" or Drive works. Import a backup file from Files.
- Airplane mode: the offline bar appears; saved investigations and the last event list still show.
- Kill the app and reopen: data is still there. (Data is a JSON file in the app's private folder with a backup copy; it is removed when the app is uninstalled.)
- Small and old phones, and a tablet.

### Store release

The steps, in order, with the Play Console and App Store Connect details, are in [`store/submission-checklist.md`](../store/submission-checklist.md). Text to paste is in [`store/listing.md`](../store/listing.md); privacy questionnaire answers are in [`store/data-safety.md`](../store/data-safety.md). You will need to take screenshots yourself on a device or simulator at the sizes the stores ask for.

Review risk to plan for: Apple can reject apps that are just a website in a wrapper (guideline 4.2). ECHO ships its interface inside the app, works offline, stores data privately, uses the share sheet, native back handling, haptics and device location, and adds notes and exports; say so in the review notes and give the reviewer a path to try (open the Nepal demo, drag the compare slider).

## 4. Releasing an update

1. Change code, run `npm test` and `python3 tools/e2e/run.py`.
2. Bump `version` in `package.json` (and the Android `versionCode` / iOS Build for the phone).
3. Desktop: `npm run desktop:dist` on each OS. Phone: `npm run mobile:sync`, then archive in Android Studio and Xcode.
4. Update "What's new" in `store/listing.md`.

Saved data is written with a `schema` number (`SCHEMA_VERSION` in `packages/core/src/store.js`, currently 1). Loading is tolerant: it normalises every record and skips damaged ones. But nothing branches on the number yet, so there is no migration code. If you ever change what is stored in a way old data cannot satisfy, add a migration step in `hydrate()` keyed on `parsed.schema`, raise `SCHEMA_VERSION`, and add a test in `packages/core/test/investigation-store.test.js` so existing users keep their investigations.

## 5. Troubleshooting

- **`npm install` fails or the apps will not start after an update**: you are probably on "latest" for a package that made a breaking change. Pin the last version that worked.
- **Blank map on the phone**: check the Content-Security-Policy in `apps/mobile/www/index.html` allows the tile hosts in `img-src`; a new imagery provider needs adding there (and in `apps/desktop/renderer/index.html` for the desktop).
- **Imagery missing for a date**: NASA GIBS does not have every layer for every day, and clouds hide the ground. The app shows a banner when tiles fail; try another date or layer.
- **Ask ECHO says "built-in guide"**: no AI address is set, or the address failed. Use Settings > Test connection.
