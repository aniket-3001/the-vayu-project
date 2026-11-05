# Releasing the phone apps

The lanes in `apps/mobile/fastlane/Fastfile` and the workflow `.github/workflows/release-mobile.yml` build the iPhone and Android
apps and send them to **TestFlight** and **Google Play's internal track**. **They have never been run.** They were written from
Fastlane's documentation in an environment with no Apple or Google account. Expect to fix small things on the first run, and run
it once by hand on a Mac before trusting the workflow.

## One-time setup (the account owner)

### iPhone

1. Apple Developer Program membership (paid). Create the app record in App Store Connect with bundle id `com.vayu.app`.
2. App Store Connect → Users and Access → Integrations → create an **API key** (role App Manager). Keep the `.p8` file.
3. Create a **private** git repository to hold signing certificates, then on a Mac run `bundle exec fastlane match appstore` once.
4. Add these as GitHub repository secrets: `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_P8_BASE64` (the `.p8`, base64), `MATCH_PASSWORD`,
   `MATCH_GIT_URL`, `MATCH_GIT_BASIC_AUTHORIZATION`.
5. In `apps/mobile/ios`, set the signing team in Xcode once, and commit the project file only if that is what you want in the repo.
   (Today a free personal team is written into `project.pbxproj` by Xcode: see `MOBILE.md`.)

### Android

1. Google Play Console developer account (one-time fee). Create the app with package name `com.vayu.app`. Enrol in Play App Signing.
2. Make an **upload keystore** (`keytool -genkeypair -v -storetype JKS -keyalg RSA -keysize 2048 -validity 10000 -alias upload -keystore upload.jks`).
   Keep it and its passwords somewhere safe outside the repository. Losing it is recoverable only through Play support.
3. Play Console → Setup → API access → create a service account with release permissions; download its JSON key.
4. Add as GitHub secrets: `ANDROID_KEYSTORE_BASE64` (the keystore, base64), `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`,
   `ANDROID_KEY_PASSWORD`, `PLAY_SERVICE_ACCOUNT_JSON`.

## Every release

1. Merge to `main` once CI is green.
2. Raise `APP_VERSION` in `apps/web/src/analytics/device.ts` and `apps/web/package.json` together, and `MARKETING_VERSION`
   (Xcode) and `versionName` (`apps/mobile/android/app/build.gradle`) to match.
3. Actions → **release-mobile** → Run workflow. Build numbers rise by themselves.
4. Install the TestFlight / internal build on a real phone and go through `MOBILE.md`'s checks (the coloured V, the notch, the
   microphone, location, camera, the build line on Account).
5. Promote the build to production in App Store Connect / Play Console when satisfied.

## Retiring an old build

The API can refuse an out-of-date phone app. Set the oldest version still supported when deploying:
`cd infra && npx cdk deploy -c minAppVersion=0.2.0`. Phone apps older than that show a plain "Update Vayu" screen. The check fails
open, so an outage never locks anyone out. The website is not affected.
