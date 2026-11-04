# Production-readiness checklist

Living list of what a widely used app has that ours lacks. Tick an item only when it is done **and verified**; put the
evidence (test, file, command) beside it. Items marked `[you]` need a person with AWS, Apple or Google access: code
cannot finish them. Sources: `AS-BUILT.md` known limits, `architecture.md` pillars, `cost.md`.

## Phase 1: quick, high value

- [ ] `[you]` Subscribe an email to the alarm topic: `cd infra && npx cdk deploy -c alertEmail=you@example.com`, then confirm the SNS mail. Until then no alarm reaches anyone.
- [x] Permission-string lint: every permission the web or native code uses has an iOS usage string and an Android permission. `tests/lint/permissions.test.ts` (runs in `npm test` and CI).
- [~] Origin secret: CloudFront adds a secret header, the API refuses requests without it, so the per-caller limit cannot be dodged by calling API Gateway directly. Code, tests and synth done (`apps/api/src/originGuard.ts`, `infra/test/VayuStack.test.ts`); off by default. `[you]` deploy with `-c originSecret=on` after the apps and smoke test all use the CloudFront address (old phone builds that call `execute-api` directly will stop working; `tests/smoke/live.ts` defaults to the direct address).
- [ ] Client crash and error reporting with release tags and source maps (Sentry or Crashlytics).
- [x] Dependency scanning in CI: `.github/dependabot.yml`, `npm audit --audit-level=critical` in `ci.yml`, `.github/workflows/codeql.yml` (becomes visible once pushed to GitHub; code scanning must be enabled in repo settings `[you]`).
- [~] Fix the vulnerabilities `npm audit --omit=dev` reports. **zod migrated to 4.6.7 (the high one): typecheck, lint, 1,488 tests, synth and web build pass.** Still open: react-router-dom 6 (moderate, open redirect, fix is v7); aws-cdk-lib/minimatch (moderate, build time only). Then raise the CI audit level to `high`.
- [x] `SECURITY.md`: how to report a vulnerability, security contact.
- [x] Smoke test and the web app's development fallback default to the CloudFront address, not `execute-api` (`tests/smoke/live.ts`, `apps/web/src/config.ts`). Still `[you]`: rebuild and reinstall any phone build made before this that was pointed at `execute-api`.
- [ ] Branch protection and required CI on `main`. `[you]`

## Phase 2: security and operations

- [~] AWS WAF on CloudFront: `infra/lib/Edge.ts` (per-address rate limits, harder on the assistant and voice routes, plus AWS's IP-reputation, known-bad-input and common rule sets), tested. Off until deployed. `[you]`: `cd infra && npx cdk deploy VayuEdge -c edge=on`, then `npx cdk deploy Vayu -c webAclArn=<the ARN it prints>`. Watch the WAF metrics in CloudWatch for a week for false blocks.
- [ ] Cognito: switch from `USER_PASSWORD_AUTH` to SRP; add optional MFA.
- [ ] Tokens (id, access and **refresh** token) are kept in `localStorage` (verified in `apps/web/src/account/AccountContext.tsx`). In the phone apps move them to Keychain/Keystore through a Capacitor secure-storage plugin; needs a real-device test.
- [ ] Staging stack and a deploy pipeline (CDK Pipelines or GitHub Actions) with rollback.
- [x] Runbook: provider outage, kill switches, by-symptom table: `docs/RUNBOOK.md`. Still needed: a named person to call, and the commands tried once for real. `[you]`
- [ ] SLOs (uptime, p95 latency, data freshness) with alarms on them.
- [ ] Budget anomaly detection, not only email budgets. `[you]`
- [~] Threat model written down: `docs/THREAT-MODEL.md` (15 threats, what stops each, what is left). Still `[you]`: an outside review or pen test before a public launch.

## Phase 3: quality and performance

- [x] Flaky `nativeSpeech.test.ts` fixed: it waited one timer tick for a dynamic import; it now waits for the call.
- [ ] End-to-end tests in CI (Playwright for web; Maestro or Detox for the native shell).
- [ ] Real-device matrix: iPhone, Android, Bluetooth on each. `[you]`
- [ ] Accessibility audit with VoiceOver and TalkBack, Dynamic Type, reduced motion.
- [x] Route-level code splitting: the map and the Lens now load on demand. Main script 1,871 KB to 775 KB (the map's 1,071 KB loads only when the map is opened). Further: split Exposure and the recorded days, and check first-load time on a real phone.
- [x] Bundle-size budget: `scripts/check-bundle.mjs` fails `make prove` if the main script passes 900 KB (now 775 KB).
- [ ] Offline: show the last good reading when there is no network.
- [~] Load test script `scripts/load-test.mjs` (read-only routes only, capped at 50 requests a second, needs `--yes`). `[you]` run it against the live address before a launch and record the numbers.

## Phase 4: product and release

- [ ] Native push notifications for severe-air alerts (the largest feature gap).
- [ ] Notification settings, onboarding, in-app feedback and support.
- [ ] Home-screen widgets.
- [ ] Interface in Hindi (today only the assistant is).
- [ ] Automated iOS and Android builds and signing (Fastlane or Xcode Cloud), TestFlight and Play internal track. `[you]`
- [ ] Forced-update check so a broken build can be retired.

## Phase 5: legal and trust

- [~] Privacy policy and terms drafted from what the app actually does: `docs/PRIVACY-POLICY.md`, `docs/TERMS.md`. `[you]` fill in the responsible person and contact, have a lawyer review (children's data under DPDP is flagged), publish at a public address, link from the app and both stores.
- [ ] DPDP Act (and GDPR if beyond India) review: consent, export, retention.
- [ ] Health-disclaimer review by a qualified person.
- [~] Validation plan for the sensor, the room verdict, the purifier's CADR, GRAP and the advice thresholds: `docs/VALIDATION-PLAN.md`. `[you]` needs the hardware and a reference monitor.
