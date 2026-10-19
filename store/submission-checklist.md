# Submission checklist

Work through these in order. Items marked (you) need your accounts, devices or decisions; I could not do or test them from the build environment.

## Before anything
- [ ] (you) Change the app id `com.bandkoconnect.echo` if you want a different one. It must match in `capacitor.config.json`, the `build.appId` in `package.json`, the Apple App ID and the Play listing, and it cannot be changed after release.
- [ ] (you) Decide on imagery licensing. The base map uses Esri World Imagery from the public tile address. Check Esri's current terms for use in a published app (an ArcGIS Location Platform account and key may be required, and attribution must stay visible). If it is not acceptable, change `ESRI_IMAGERY` and the labels layer in `packages/map/echo-map.js` to a provider you are licensed for (the Desktop app shares that file, so change it once). NASA GIBS and EONET are free to use with attribution.
- [ ] (you) Fill in the contact details in `store/privacy-policy.md` and publish it at a public URL.
- [ ] (you) Commit `package-lock.json` after your first `npm install`, and replace `"latest"` in `package.json` with the versions that installed so builds are repeatable.

## Android (Google Play)
- [ ] (you) Install Android Studio and the Android SDK; `npm install`; `npm run mobile:setup`.
- [ ] (you) Run on a real phone: `npm run mobile:android`, press Run. Check: map draws, compare slider drags, bottom sheet drags, keyboard does not hide the notes box, back button behaves (closes sheets, then goes to Explore, then exits), My location prompt, Share sheet on export, airplane mode shows the offline bar.
- [ ] (you) Lock to portrait: in `android/app/src/main/AndroidManifest.xml` add `android:screenOrientation="portrait"` to the main activity (the phone UI is designed for portrait).
- [ ] (you) Create an upload key and sign a release bundle (Build > Generate Signed App Bundle). Keep the keystore out of git (the `.gitignore` already excludes `*.keystore` and `*.jks`).
- [ ] (you) Play Console: create the app, upload the .aab to an internal test track first, fill in the Data safety form (`store/data-safety.md`), content rating, screenshots, then roll out. New personal developer accounts must run a closed test with testers before production; check Google's current rules.

## iOS (App Store)
- [ ] (you) A Mac with Xcode and an Apple Developer Program membership.
- [ ] (you) `npm install`; `npm run mobile:setup`; `npm run mobile:ios`; select your team under Signing & Capabilities.
- [ ] (you) Add the location permission text from `store/data-safety.md` to `Info.plist`.
- [ ] (you) Restrict supported orientations to Portrait for iPhone in the target's General tab.
- [ ] (you) Test on a real iPhone (keyboard behaviour with the bottom sheet and the visual viewport is the least certain part).
- [ ] (you) Archive, upload through Xcode Organizer, add to TestFlight, then submit with the App Privacy answers and screenshots.
- [ ] (you) Review risk: Apple rejects apps that are only a repackaged website (guideline 4.2). ECHO ships its UI locally, works offline, stores data privately on the device, uses the share sheet, haptics, native back handling and device location, which is the case to make in the review notes. Add a short note saying so, and a demo path ("open the Nepal demo and drag the compare slider").

## After release
- [ ] (you) Watch the first reviews and crash reports (Play Console and Xcode Organizer provide crash data without adding an SDK).
