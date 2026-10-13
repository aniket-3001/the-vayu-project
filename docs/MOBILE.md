# The Android and iOS apps

The steps to deploy the CORS change, build and install the apps, test them on a phone and fit the tag reader are in [`SETUP-GUIDE.md`](SETUP-GUIDE.md).

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

Or, with nothing installed here, run the **android-debug** workflow from the repository's Actions tab (Run workflow) and download the `vayu-debug-apk` file it produces.

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
- The APK and the iOS app have not been built or run yet; the native projects are generated and committed.
- Test builds only: no store listing, push notifications or release signing.

## Icon and startup screen

The app icon is a "V" in the colours of the AQI bands, and the startup screen is the same mark on the page colour (light, and a dark one for phones in dark mode). Both are drawn by `apps/mobile/scripts/make-assets.mjs`, with no outside artwork, so they can be changed in one place:

```bash
npm run assets -w @vayu/mobile   # redraws apps/mobile/assets/*.png and writes every Android and iOS size
```

The startup screen stays up until the app has drawn, and for at least about a second so it never flashes, then fades out (`apps/web/src/native/splash.ts`). In the website nothing of this is loaded.

## Signing in, and guests

The welcome screen offers **Sign in**, **Create an account** (an emailed code confirms it), **Continue as guest** and **Try without login**. A guest uses the live app with places kept on the phone only; it is offered in the phone apps and not on the website. **Try without login** opens the seven recorded past days and saves nothing. A guest can sign in or create an account later from the Account page; the welcome screen then says what that does to places already on the phone.
