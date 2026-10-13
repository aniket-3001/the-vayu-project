# Android and iOS apps for the Vayu web app

Status: draft for review, 13 October 2026.

## Goal

Installable test builds of the existing web app on Android (a debug APK) and iOS (a device or TestFlight install), so the app can be tried on real phones. Store release is a later step and out of scope.

## Decisions already made

- **Wrap, do not rewrite.** The existing Vite and React app runs inside a Capacitor native shell. The web build and its tests keep working unchanged.
- **Backend unchanged, plus CORS.** The API stays in Harsh Kumar's AWS account, reached at the existing CloudFront address. Harsh adds CORS to his CDK stack. Until he deploys it, the apps cannot call the API.
- **Test builds only.** No store listings, push notifications, background Bluetooth or release signing.

## Why Capacitor

| Option                          | Verdict                                                                                                                                |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Capacitor wrapper               | Chosen. Reuses the whole UI (about 77k lines, MapLibre, the particle canvas, the Exposure dial) and gives iOS a native Bluetooth path. |
| React Native or Flutter rewrite | Rejected. A full rewrite for a test build.                                                                                             |
| PWA or Trusted Web Activity     | Rejected. iOS has no Web Bluetooth and no practical test install.                                                                      |

## Design

### 1. Structure

- New workspace `apps/mobile` holds `capacitor.config.ts` and the generated `android/` and `ios/` projects (committed; build outputs ignored).
- `capacitor.config.ts` sets `webDir` to `../web/dist`, `server.androidScheme` to `https`, and the app id and name.
- A small `apps/web/src/platform.ts` exports `isNative()` (true when running inside Capacitor). Native-only behaviour sits behind it, so the browser path is unchanged.
- The mobile build runs `vite build` for `apps/web` with `VITE_API_URL` set to the CloudFront address, then `cap sync`.
- Scripts at the repo root: `mobile:sync`, `mobile:android` (builds a debug APK with Gradle) and `mobile:ios` (opens Xcode; macOS only).

### 2. Bluetooth

`devices/ble.ts` already implements the `UnitTransport` interface (`supported()` and `connect(handlers)`), and `devices/transport.ts` picks the implementation.

- Add `devices/nativeBle.ts`, a `UnitTransport` built on `@capacitor-community/bluetooth-le`. It scans filtered by `UNIT_SERVICE_UUID`, connects, subscribes to `UNIT_READING_UUID` notifications and passes the bytes to `onPacket`. Disconnects call `onDisconnect`.
- `transport.ts` exports `isNative() ? nativeBle : webBluetooth`.
- `unitProtocol.ts`, `useUnit` and the UI are untouched.
- Permissions: Android `BLUETOOTH_SCAN` and `BLUETOOTH_CONNECT` (plus location for older Android versions); iOS `NSBluetoothAlwaysUsageDescription`.
- iOS gains Bluetooth through the native plugin, which Safari cannot offer.

### 3. API, CORS and sign-in

- `API_URL` already reads `VITE_API_URL`, so the mobile build needs no code change there.
- **CORS change (for Harsh, as a small PR to `infra/`):** allow the origins `https://localhost` (Android) and `capacitor://localhost` (iOS), methods GET, POST and OPTIONS, and the headers the app sends, including `authorization` for `/v1/me`. `infra/lib/VayuStack.ts` currently says "No CORS" on purpose; that comment and the infra assertion tests change with it.
- Cognito calls go directly to `cognito-idp.ap-south-1.amazonaws.com`, which allows cross-origin requests, so sign-in should work unchanged. Sessions are kept in localStorage, which persists in the webview.
- The CloudFront content-security policy does not apply inside the native shell.

### 4. Native behaviours

- Geolocation, camera (AIR Lens) and speech work in the webview once the permission strings are in the manifests: iOS `NSLocationWhenInUseUsageDescription` and `NSCameraUsageDescription`, and the matching Android permissions.
- Hindi speech depends on the voices installed on the phone; the app already falls back to Polly audio.
- Map tiles, Open-Meteo and Photon are called from the webview and allow cross-origin requests.
- Routing is `HashRouter`, so no server rewrites are needed.
- Add an app icon, a splash screen, and safe-area padding for notches and the status bar. This is the part most likely to need visual adjustment on a real phone.

### 5. Build and testing

- `make prove` is unchanged and does not need the mobile toolchains.
- New unit tests: transport selection by `isNative()`, and the native BLE adapter against a fake plugin (connect, packet delivery, disconnect, rejection when the person declines).
- Android: needs Android Studio (or the SDK) and JDK 17. The debug APK is built with Gradle.
- iOS: needs a Mac with Xcode, and an Apple ID for installing on a device (a free account allows 7-day installs; TestFlight needs the paid programme).
- The Bluetooth hardware path cannot be verified without a unit and a phone; only the plugin wiring is tested in code.

## Known risks

- The apps do nothing useful until Harsh deploys the CORS change.
- Hardware Bluetooth, camera and notch layout need a real-phone check; none is covered by tests.
- The MapLibre map and the AIR Lens canvas may run slower in older webviews.
- Android 12 and later and iOS both ask for Bluetooth permission at runtime; a denial must show a readable message, not a silent failure.

## Open questions

- Does the user have a Mac for iOS builds? If not, iOS builds need a cloud Mac service or a borrowed machine.
- Final app id and display name (proposed: `com.vayu.app`, "Vayu").
