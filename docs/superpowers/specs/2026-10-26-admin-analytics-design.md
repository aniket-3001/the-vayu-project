# Admin analytics panel: design

## Intent
The two owners (aniketgupta3001@gmail.com, harsh22198@iiitd.ac.in) can see how people use the app and how it runs for them, as group statistics and as a per-person view. No one else can see it, including the users themselves. It exists to prove the app works, find what is not used, and find what breaks.

## Goals
- Collect behaviour and technical details from the web app and both phone apps.
- Group views: filter and compare by platform, app version, region (city level), signed in vs anonymous, new vs returning. Anonymous use counts in all group totals.
- Individual view: one signed-in account's timeline (sessions, features used, device, errors). Signed-in accounts only.
- Admin check enforced on the server. Hiding the panel is not a control.

## Non-goals
- No individual view for anonymous people. No exact addresses or coordinates stored; region is city level only.
- No notice to users (owners' decision, 2026-10-26).
- No advertising or sharing with third parties; no new third-party service.

## Anti-goals
- Any change that alters or slows what Harsh's deployed site does for normal users.
- An admin route reachable by a non-admin, or analytics data returned by any non-admin route.
- Analytics failure ever breaking the app: sending is fire-and-forget and silent.

## What is collected
Behaviour: sessions (start, length, days active, first/last seen); feature use (Detect my location, Add a place, search, AIR Lens, assistant question, Exposure, Map layers, Recorded days, Bluetooth connect); places saved (count only); funnel steps (first open, first place added, return next day).
Technical: platform, app version, OS/browser, device model, screen size, language; location permission result and GPS switch state; Bluetooth attempts, successes, failures; errors and failed or slow API calls; assistant calls.

## How it works (decided where marked; otherwise the builder's call, marked "call")
- Client: small module queues events and sends them in batches to `POST /v1/events`; device details once per session. Signed-in: the account id from the token. Anonymous: a random id the app generates and keeps on the device, used only for totals (call). Silent on failure; no retry storm (call: drop after one retry).
- Server: `POST /v1/events` validates strictly (size, allowed event names, allowed fields), writes to the existing Watch DynamoDB table (reuse, no new table; call) and updates daily counters. Raw events expire after 90 days (call); daily totals are kept.
- Admin: `GET /v1/admin/*` (summary, groups with filters, one account's timeline). Server compares the verified email claim to the two-address allow-list; anyone else gets 403 with no data. The list lives in configuration, not in the app bundle (call).
- Panel: a separate route in the app, never linked from normal screens, in the existing visual style. Non-admins who open it see the normal not-found.
- Ingest abuse: rate limit per client and cap batch size, using the existing quota approach (call).

## Constraints
- Touches Harsh's stack: one new route group, one Lambda change, permission on the existing table. Both owners agreed; Harsh deploys it. Nothing existing is renamed or removed.
- Website bundle must stay free of native-only code; phone-only collection uses `isNative()`.
- Email must be present in the token API Gateway verifies. Cognito signs in by verified email, but the ID token carries the email and the access token does not. The builder must confirm which token the app sends and, if needed, send the ID token on admin calls only.
- Cost must stay near today's (about $4.50 idle); batching and daily counters are for that.

## Left to the builder
Event schema details, table key layout, chart choices, the panel's exact layout, and tests (API route tests, allow-list refusal tests, client queue tests).

## Open items for the owners
- Confirm the deploy plan with Harsh (CDK change, then deploy).
- Account deletion (`DELETE /v1/me`): decide whether it also deletes that account's analytics events (suggested: yes).
