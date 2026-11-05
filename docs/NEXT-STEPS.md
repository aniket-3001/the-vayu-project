# Next steps that were not built, and why

`PRODUCTION-CHECKLIST.md` says what is done. These are the items left that need something code alone cannot give (an account, a
device, a translator, a decision), each with the design already thought through so the work can start straight away.

## 1. Push notifications for severe-air alerts (the biggest gap)

Today alerts exist only inside the app and as Telegram messages that are switched off. A person who is not looking at the app
learns nothing. This is what most widely used air apps lead with.

**Blocked on:** an Apple Developer account with a push key (`.p8`), a Firebase project for Android, and a decision on what
triggers a push.

**Design**

- **Client.** `@capacitor/push-notifications`. On the Account page, a "Alerts on this phone" switch asks the system for permission (never
  at start-up) and, if granted, registers the device token. Settings: which alerts (GRAP stage, smog, stubble burning, rain), and quiet
  hours. The iOS permission text and the `aps-environment` entitlement must be added, and `tests/lint/permissions.test.ts` extended to
  require them.
- **Server.** `PUT /v1/me/push` (signed-in only, token checked by API Gateway like `/v1/me`) stores `{token, platform, places, kinds,
quietHours}` in the Watch table under the account, with an expiry. `DELETE` removes it. Deleting the account removes it (the
  `onDelete` hook already exists).
- **Sending.** After each harvest, a function compares each place's alert set with the last one sent (`alerts/model.ts` already works out
  the alerts) and sends only a change. Send through SNS mobile push (one platform application each for APNs and FCM). Rules, in
  code and tested: never more than one push per place per six hours; quiet hours respected; wording from the fixed alert text, never
  from the model; "unofficial: our estimate" kept on every GRAP message (`AGENT-BOUNDARIES.md`); a daily cap as a cost guard.
- **Privacy.** The device token and the places chosen are personal data: add them to `PRIVACY-POLICY.md`, and to the account-deletion test.
- **Test.** Unit tests for the change detection and the caps; a fake SNS for the sender; a Playwright test that the switch asks for
  permission only when pressed (browser permission stubbed).

**First step:** the `/v1/me/push` route and store with tests, which need no credentials.

## 2. Home-screen widgets and a lock-screen glance

A small widget showing the home place's AQI, its colour and the age of the reading.

**Blocked on:** native code (Swift WidgetKit, Kotlin Glance) that cannot be built or tried without Xcode and Android Studio.

**Design.** The web app already keeps the last good reading on the device (`air/store.ts`). Write it also to a place the widget can
read (an iOS App Group `UserDefaults`, Android `SharedPreferences`) through a small Capacitor plugin, with the reading's time. The widget
shows the number, the band colour from the same table as `design/levels.ts`, and "37 min ago", growing as the clock moves
(never frozen). If the reading is older than three hours it shows "Open Vayu" and no number, the same rule the app uses.

## 3. A Hindi interface

Only the assistant speaks Hindi today (fixed, hand-written wording). The rest of the screens are English. For a Delhi audience this
is a real gap.

**Blocked on:** translation by a person who writes good Hindi. Machine translation is not acceptable here: `DESIGN.md` says every string is
read through, and `AGENT-BOUNDARIES.md` keeps Hindi wording hand-written for safety.

**Design**

- A language setting (English, हिन्दी, Auto) beside Appearance on the Account page.
- A small `t(key)` helper and one dictionary file per language, with `useLang()`. No heavy library. Numbers, units and times stay
  formatted by the existing code.
- Extract strings screen by screen, starting with My Air, the place page, the alert sheet and the tab bar, and adding a test that
  fails when a key exists in English and not in Hindi.
- Keep the Hindi rules in `assistantRulesHi.ts` as they are.
- Fonts: check that Hanken Grotesk's Devanagari fallback looks right; probably add Noto Sans Devanagari (open source).
- Roughly 150 to 300 strings for the main screens.

## 4. Multi-factor sign-in (MFA)

**Blocked on:** a choice of method and a live pool to test against. Authenticator-app codes (TOTP) cost nothing; SMS costs per message and
needs an AWS SMS sandbox exit.

**Design.** Pool: `mfa: OPTIONAL`, `mfaSecondFactor: { otp: true, sms: false }` in `infra/lib/Accounts.ts`. Client (`cognito.ts`): after
the SRP step, handle the `SOFTWARE_TOKEN_MFA` challenge with `RespondToAuthChallenge`; for turning it on, `AssociateSoftwareToken`
(returns a secret), show it as text and as a QR code, then `VerifySoftwareToken` and `SetUserMFAPreference`. UI: a code box after the
password, and an "Add a second step" section on the Account page. Tests with a fake Cognito for each branch. Until the SRP sign-in has
been tried on a live pool (see the checklist), do not start this.

## 5. A first-run walkthrough

Three short cards on first open: what the number means, "add a place", "ask the assistant". It should be skippable, never shown
again, and not shown on the recorded days. A product decision about wording and tone (see the Voice section of `DESIGN.md`) comes
first, so it is left for a person to decide.

## 6. Tests on real phones

Maestro (or Detox) flows for the native shell on an iOS simulator and an Android emulator: first launch, sign-in, adding a place,
microphone and location permission prompts, Bluetooth pairing is hardware and stays manual. Runs on a Mac runner for iOS. The permission
lint already protects the most expensive mistake (a missing permission text).
