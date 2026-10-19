# Store privacy questionnaires: suggested answers

Based on what the app's code does in version 1.0.0. Re-check them if you add analytics, accounts, crash reporting or an AI service of your own that logs requests. You are responsible for the final answers you submit.

## Apple: App Privacy ("nutrition label")
- Data collected by you (the developer): **Data Not Collected**. The app has no server of yours and no third-party SDKs that collect data.
- Reasoning: location, if granted, is read on the device and never leaves it except as coordinates the user chooses to put into an investigation, which stay on the device. Map and event requests go straight to NASA and Esri.
- Tracking: **No**. There is no advertising ID use and no data shared with data brokers.
- If you point the Settings > AI service address at your own server, you then collect what it receives; update the label to match (User Content: other user content, linked to no one if you do not store it).

Permission text for Info.plist (Capacitor adds the key; edit the wording):
- `NSLocationWhenInUseUsageDescription`: "ECHO uses your location once, when you tap My location, to start an investigation where you are."

## Google Play: Data safety form
- Does your app collect or share any of the required user data types? **No data collected, no data shared** (location is processed on the device only and not sent off it to you; third-party map and event services receive ordinary request data, which Google treats as the user's connection to those services, not as data you collect. If you read the form differently, declare "Approximate location" and "Precise location" as processed on device, not shared.)
- Is all of the user data encrypted in transit? **Yes** (all requests use HTTPS; the app refuses non-HTTPS AI service addresses except localhost for testing).
- Can users request that data be deleted? Not applicable (no data held); the app has "Erase all data".
- Permissions in AndroidManifest: `INTERNET` and `ACCESS_COARSE_LOCATION` / `ACCESS_FINE_LOCATION` (added by the Geolocation plugin). Remove fine location if you want approximate only.
- Content rating: complete the IARC questionnaire; expect "Everyone".
- Target audience: 13+ or "not primarily children".
