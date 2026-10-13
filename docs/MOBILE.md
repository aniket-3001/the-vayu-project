# The Android and iOS apps

The apps are the website inside a native shell (Capacitor). They read the same live data from the same address. Nothing about the website or its AWS stack changes when you build them.

## Before the apps can load data

The apps run from `https://localhost` (Android) and `capacitor://localhost` (iOS), so the browser engine inside them treats calls to the API as cross-site. The API's CloudFront address must allow those two origins. That change is on the branch `infra/mobile-cors` (see the pull request); until it is deployed, the apps open but show the "air data could not be loaded" screen.

## Build

Needs Node 22 or later.

```bash
npm ci
npm run mobile:sync        # builds the web app for the shell into apps/mobile/www and copies it in
```

The apps use `https://d3lmq1mze2gup3.cloudfront.net`. To point them elsewhere set `VAYU_API_URL` before running `mobile:sync`.

### Android

Needs the Android SDK (Android Studio, or the command-line tools alone) and JDK 17 or 21.

```bash
npm run mobile:android     # opens Android Studio; press Run with a phone attached
# or, without opening it:
cd apps/mobile/android && ./gradlew assembleDebug
# the APK is at apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk
```

### iOS (on a Mac)

Needs Xcode. A free Apple ID installs for seven days on your own phone; TestFlight needs the paid programme.

```bash
npm ci
npm run mobile:ios         # opens Xcode
```

In Xcode: select the App target, Signing and Capabilities, choose your team, pick the phone, press Run.

## What to check on a phone

- My Air loads (needs the CORS change).
- Detect my location asks for permission and works.
- AIR Lens asks for the camera and shows the picture.
- Add device finds the unit, connects, and shows readings (Android and iPhone).
- The top of the page is clear of the notch or status bar; the tab bar is clear of the home bar.

## Limits

- The Bluetooth path has not been tried against the real unit; only the adapter is tested, against a fake.
- No custom icon or splash screen yet; the Capacitor defaults are used.
- The APK and the iOS app have not been built or run yet; the native projects are generated and committed.
- Test builds only: no store listing, push notifications or release signing.
