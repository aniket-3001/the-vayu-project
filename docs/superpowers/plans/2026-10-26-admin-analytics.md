# Admin Analytics Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collect behaviour and technical usage from web and phone apps, store it cheaply, and show it (group stats and per-account timelines) only to the two admin emails on a separate panel.

**Architecture:** The app queues small events and posts batches to a new ingest route (public for anonymous devices, token-checked for signed-in accounts). The API Lambda aggregates each batch into per-day DynamoDB counters (one dimension at a time) plus a per-account timeline, all in the existing `Watch` table. A `GET /v1/admin/*` route group, behind the Cognito JWT authorizer, compares the verified ID-token email to an allow-list from Lambda config and refuses everyone else with 403. The panel is a lazy-loaded `/admin` screen that sends the ID token and falls back to the home screen on any refusal.

**Tech Stack:** TypeScript, Vitest, AWS CDK (HTTP API, DynamoDB, Cognito), React + react-router (HashRouter), existing `dynamoQuota`, `Clock`, `failure/ok` helpers.

**Spec:** `docs/superpowers/specs/2026-10-26-admin-analytics-design.md`

## Global Constraints

- Admins only: `aniketgupta3001@gmail.com`, `harsh22198@iiitd.ac.in`. Compared lower-cased, and only when the token's `email_verified` is `"true"`.
- Admin check is on the server. The list is configuration (`ADMIN_EMAILS` Lambda env, set from CDK context `adminEmails`), not in the app bundle. Empty or missing list means nobody is admin (fail closed).
- Individual view: signed-in accounts only. Anonymous use counts in all group totals.
- No exact addresses or coordinates stored. Location is rounded to 1 decimal client-side and turned into a city name (or `Other`/`Unknown`) on the server; only the city is stored.
- No notice to users. No third-party service. Reuse the existing `Watch` table (key `pk`,`sk`; TTL attribute `expiresAt`, epoch seconds). No new table.
- Raw per-account events and error samples expire after 90 days (errors 30 days); daily counters and active markers also get `expiresAt` of 400 days.
- Sending is fire-and-forget: analytics failure never throws into the app, never shows UI, queue is bounded.
- Nothing existing is renamed or removed. Website bundle contains no native-only code (use `isNative()`).
- Account deletion (`DELETE /v1/me`) also deletes that account's analytics.
- Run tests with `NODE_OPTIONS=--no-experimental-webstorage npm test` (or `npx vitest run <file>`); `make lint` and `make typecheck` must stay clean. jsdom tests need `// @vitest-environment jsdom` and `afterEach(cleanup)`.
- Commit messages end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus

1. A signed-in non-admin calls any `/v1/admin/*` route: 403 `forbidden`, empty body of data (Task 1, Task 4).
2. Token email equals an admin address but `email_verified` is not `"true"`, or differs only by letter case: unverified refused, case ignored (Task 1).
3. `ADMIN_EMAILS` empty or unset: nobody is admin (Task 1).
4. Malformed, oversized or hostile batch (bad JSON, 26+ events, unknown kind, 10 000-char detail, `n` of `NaN`, negative or huge, body claiming a `userId`): refused with 400/413, or the bad parts dropped; nothing bad is written and the body's `userId` is never used (Task 3).
5. Network down, 429/500 or a throwing `fetch` in the client: `track` never throws, queue stays at or under 200 events, oldest dropped first (Task 7).

---

## File Structure

API (`apps/api/src/`), one responsibility per file:
- `adminGuard.ts`: `isAdmin(request, allowList)`; the only place that decides who is an admin.
- `analyticsModel.ts`: event kinds, allow-listed details, validation of a batch (pure), city lookup (`cityOf`).
- `analyticsStore.ts`: `AnalyticsStore` interface, `dynamoAnalyticsStore`, `memoryAnalyticsStore` (tests).
- `eventsRoute.ts`: `POST /v1/events` and `POST /v1/me/events`.
- `adminRoute.ts`: `GET /v1/admin/*`.
- Modify `respond.ts` (add `email`, `emailVerified`), `handler.ts` (claims, deps, env), `routes.ts` (wire), `accountRoute.ts` (delete analytics).

Infra: modify `infra/lib/VayuStack.ts` (+ `infra/lib/Accounts.ts` if the authorizer is reused from there) and `infra/test/VayuStack.test.ts`.

Web (`apps/web/src/`): `analytics/collector.ts`, `analytics/device.ts`, `analytics/index.ts`, `admin/AdminScreen.tsx`, `admin/adminApi.ts`, `admin/*.test.tsx`; modify `App.tsx`, `main.tsx`, `styles.css`, and the instrumentation call sites in Task 8.

## Shared vocabulary (used by Tasks 2, 3, 4, 7, 9)

```ts
// apps/api/src/analyticsModel.ts
export const KINDS = ['session_start','screen','feature','permission','bluetooth','error','api','active'] as const;
export type Kind = (typeof KINDS)[number];
export interface AnalyticsEvent { readonly kind: Kind; readonly detail: string; readonly n: number; readonly at: string }
export interface DeviceInfo { readonly platform: 'web'|'android'|'ios'; readonly appVersion: string; readonly os: string;
  readonly model: string; readonly screen: string; readonly lang: string; readonly cell?: { lat: number; lng: number } }
export interface Batch { readonly deviceId: string; readonly sessionId: string; readonly device: DeviceInfo; readonly events: readonly AnalyticsEvent[] }
export const DIMENSIONS = ['all','platform','version','region','auth','visitor'] as const;
export type Dimension = (typeof DIMENSIONS)[number];
```
Allow-listed `detail` values: `screen` = `myair|place|account|exposure|map|lens|room|week|admin`; `feature` = `detect_location|add_place|search|air_lens|assistant|exposure|map_layer|recorded_days|bluetooth_connect`; `permission` = `location:granted|location:denied`; `bluetooth` = `connect:ok|connect:fail`; `session_start` and `active` detail is `''`; `error` and `api` detail is free text, `[A-Za-z0-9 :_./-]`, trimmed to 80 chars. `n` is an integer 1 to 3600 (default 1); for `active` it is seconds.

DynamoDB layout in `Watch` (all rows carry `expiresAt`):
- Counter: `pk=STAT#<day>` (India day via `dayKey`), `sk=<dimension>#<value>#<metric>`, numeric `count`. Metric is `sessions`, `users`, `active_seconds`, `errors`, or `<kind>:<detail>` for `screen`/`feature`/`permission`/`bluetooth`.
- Active marker: `pk=ACTIVE#<day>`, `sk=<deviceId>`, written once per device per day (conditional put); only a first write increments `users`.
- Device profile: `pk=DEV#<deviceId>`, `sk=PROFILE` (firstSeen, lastSeen, sessions, device fields, region, `userId?`, `firstPlaceAt?`).
- Account: `pk=USERS`, `sk=<userId>` (email, firstSeen, lastSeen, sessions, platform, appVersion, region, firstPlaceAt?). Timeline: `pk=UEVT#<userId>`, `sk=<at>#<seq>` (kind, detail, n).
- Error sample: `pk=ERR#<day>`, `sk=<at>#<seq>` (detail, platform, appVersion, region), 30-day TTL.

---

### Task 1: Verified identity and the admin guard

**Files:**
- Modify: `apps/api/src/respond.ts` (ApiRequest), `apps/api/src/handler.ts:196-201` (claims)
- Create: `apps/api/src/adminGuard.ts`
- Test: `apps/api/src/adminGuard.test.ts`

**Interfaces:**
- Produces: `ApiRequest.email?: string` and `ApiRequest.emailVerified?: boolean` (set only from authorizer claims; never from headers or body); `parseAllowList(raw: string | undefined): readonly string[]`; `isAdmin(request: ApiRequest, allowList: readonly string[]): boolean`.

- [ ] **Step 1: Write failing tests** in `adminGuard.test.ts`: (a) verified `Aniketgupta3001@Gmail.com` with list `['aniketgupta3001@gmail.com']` → true; (b) same email with `emailVerified: false` or undefined → false; (c) email not in list → false; (d) no `email` → false; (e) `parseAllowList(undefined)`, `''`, `' , '` → `[]` and `isAdmin(verifiedRequest, [])` → false; (f) `parseAllowList(' A@x.com, b@y.com ')` → `['a@x.com','b@y.com']`; (g) a request whose `headers['x-email']` and body both name an admin but has no `email` field → false.
- [ ] **Step 2: Run** `npx vitest run apps/api/src/adminGuard.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** `adminGuard.ts` as above; add the two optional fields to `ApiRequest` in `respond.ts`; in `handler.ts` read `claims.email` (string) and `claims.email_verified === 'true' || === true` beside `userIdOf`, and put them on the request next to `userId`.
- [ ] **Step 4: Run** the test again plus `npx vitest run apps/api/src/routes.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(api): verified email on the request and an admin guard`.

### Task 2: Analytics model and store

**Files:**
- Create: `apps/api/src/analyticsModel.ts`, `apps/api/src/analyticsStore.ts`
- Test: `apps/api/src/analyticsModel.test.ts`, `apps/api/src/analyticsStore.test.ts`

**Interfaces:**
- Produces (model): the vocabulary above; `parseBatch(raw: unknown): { ok: true; batch: Batch } | { ok: false; code: string; message: string }`; `cityOf(lat: number, lng: number): string` (nearest of ~30 bundled Indian cities within 60 km, else `'Other'`; callers pass `'Unknown'` themselves when there is no cell).
- Produces (store):
  ```ts
  export interface AnalyticsStore {
    record(args: { batch: Batch; userId?: string; email?: string; now: string }): Promise<void>;
    summary(days: number, now: string): Promise<DaySummary[]>;          // dimension 'all', one entry per day, oldest first
    groups(by: Dimension, days: number, now: string): Promise<GroupRow[]>; // rows: value, sessions, users, activeSeconds, errors, features: Record<string, number>
    accounts(limit: number): Promise<AccountRow[]>;
    account(userId: string, limit: number): Promise<{ row: AccountRow; events: TimelineEvent[] } | undefined>;
    errors(limit: number, now: string): Promise<ErrorRow[]>;
    removeUser(userId: string): Promise<void>;
  }
  export function memoryAnalyticsStore(): AnalyticsStore;
  export function dynamoAnalyticsStore(tableName: string, client?: DynamoDBDocumentClient): AnalyticsStore;
  ```
  `record` semantics: a `session_start` event counts `sessions` and sets `visitor` to `new` when no device profile existed, else `returning`; a device's first event of the day adds one `users`; `auth` is `signed_in` when `userId` is set else `anonymous`; every counter is added under `all`, `platform`, `version`, `region`, `auth`, `visitor`; `error` events add `errors` and write an error sample; `active` adds `n` to `active_seconds`; `feature:add_place` sets `firstPlaceAt` once; when `userId` is set the account row and timeline items are written and the device profile gets `userId`.

- [ ] **Step 1: Write failing tests.** Model: `parseBatch` accepts a valid batch; rejects (each with its own code) `events.length > 25`, unknown `kind`, `feature` detail outside the allow-list, `deviceId` with spaces or over 64 chars, `n` of `0`, `-1`, `1.5`, `NaN`, `99999`; strips a `userId` field in the body (result has none); trims `error` detail to 80 chars and removes characters outside `[A-Za-z0-9 :_./-]`; rounds `cell` to 1 decimal. `cityOf(12.97, 77.59)` is `'Bengaluru'`, `cityOf(28.61, 77.21)` is `'Delhi'`, `cityOf(0, 0)` is `'Other'`. Store (run against `memoryAnalyticsStore`; the Dynamo store gets a shared contract suite run against both where a fake DocumentClient is practical, otherwise a command-shape test like `roomStores.test.ts`): first batch for a new device then a second day gives `visitor` `new` then `returning`; two batches the same day from one device give `users` 1 and `sessions` 2; `groups('platform')` splits android and web; anonymous and signed-in both appear in `all` and `auth` groups but only the signed-in appears in `accounts()`; `account()` returns events newest first up to `limit`; `removeUser` removes row and timeline but leaves counters.
- [ ] **Step 2: Run** both files. Expected: FAIL.
- [ ] **Step 3: Implement** the model (pure; hand-written checks, no new dependency) and both stores. Aggregate one batch into a `Map<string, number>` of `sk → increment` and send one `UpdateCommand ADD count` per key; per-day `ACTIVE#` marker uses `ConditionExpression attribute_not_exists(pk)` and treats `ConditionalCheckFailedException` as "already counted". Reads use `QueryCommand` on `STAT#<day>` for each of the last `days` days (cap `days` at 90), `Query` on `USERS` (cap `limit` at 500) and `UEVT#<userId>` descending. `removeUser` pages through the timeline with `BatchWriteCommand` deletes. Use `traced(new DynamoDBClient({}))` like `accountStore.ts`.
- [ ] **Step 4: Run** both files. Expected: PASS.
- [ ] **Step 5: Commit** `feat(api): analytics model and DynamoDB store`.

### Task 3: Ingest routes

**Files:**
- Create: `apps/api/src/eventsRoute.ts`
- Test: `apps/api/src/eventsRoute.test.ts`

**Interfaces:**
- Consumes: `parseBatch`, `AnalyticsStore.record`, `Quota`, `dayKey`, `Clock`, `ApiRequest.userId/email`.
- Produces: `handleEvents(request: ApiRequest, deps: EventsDeps): Promise<ApiResponse>` where `EventsDeps = { store: AnalyticsStore; quota: Quota; clock: Clock; salt: string }` and constants `EVENTS_PER_DEVICE_PER_DAY = 2000`, `EVENTS_PER_CALLER_PER_DAY = 5000`, `MAX_BODY_BYTES = 20_000`. Serves both `POST /v1/events` and `POST /v1/me/events`; the second is signed-in only (401 `sign_in_needed` without `userId`), the first ignores any identity.

- [ ] **Step 1: Write failing tests** (model them on `fireReportsRoute.test.ts`): valid anonymous batch → 200 `{ accepted: n }` and `store.record` called without `userId`; `/v1/me/events` with `userId`+`email` → record called with both; `/v1/me/events` without `userId` → 401; body containing `"userId":"someone-else"` is never passed to the store (record gets the authorizer's id or none); invalid JSON → 400 `invalid_body`; body over 20 000 chars → 413; unknown kind → 400; 26 events → 400; `GET` → 405; per-device quota exhausted → 429 `slow_down` and nothing recorded; store throws → the error propagates to the normal 500 path (the client treats any failure as silent).
- [ ] **Step 2: Run** `npx vitest run apps/api/src/eventsRoute.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `handleEvents`. Quota keys: `evt-dev:<day>:<deviceId>` and `evt-ip:<day>:<hash of salt+sourceIp>`, ttl 2 days, `amount` = number of events; hash with `createHash('sha256')` as `fireReportsRoute.ts` does.
- [ ] **Step 4: Run** the test. Expected: PASS.
- [ ] **Step 5: Commit** `feat(api): event ingest routes`.

### Task 4: Admin routes

**Files:**
- Create: `apps/api/src/adminRoute.ts`
- Test: `apps/api/src/adminRoute.test.ts`

**Interfaces:**
- Consumes: `isAdmin`, `AnalyticsStore`, `Clock`.
- Produces: `handleAdmin(request: ApiRequest, deps: { store: AnalyticsStore; clock: Clock; admins: readonly string[] }): Promise<ApiResponse>` serving, all `GET`: `/v1/admin/whoami` → `{ admin: true }`; `/v1/admin/summary?days=` → `{ days: DaySummary[] }`; `/v1/admin/groups?by=&days=` → `{ by, rows: GroupRow[] }` (400 for `by` not in `DIMENSIONS` or `all`); `/v1/admin/users` → `{ users: AccountRow[] }`; `/v1/admin/users/<userId>` → `{ user, events }` or 404; `/v1/admin/errors` → `{ errors: ErrorRow[] }`. `days` default 14, clamp 1 to 90.

- [ ] **Step 1: Write failing tests**: for **every** path above, a signed-in non-admin gets 403 `forbidden` and the store is not called (assert on a store whose methods throw if called); an admin gets the data; no `userId` (not signed in) gets 401; unverified email gets 403; unknown path under `/v1/admin/` gets 404 for an admin and 403 for a non-admin; non-GET gets 405 only after the admin check; `days=9999` is clamped to 90; `by=bogus` → 400.
- [ ] **Step 2: Run** `npx vitest run apps/api/src/adminRoute.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `handleAdmin`: the admin check is the first statement after the sign-in check, before any path parsing or store call. Reads are `Cache-Control: no-store` (the handler already sets it).
- [ ] **Step 4: Run** the test. Expected: PASS.
- [ ] **Step 5: Commit** `feat(api): admin analytics routes, admin only`.

### Task 5: Wire into the router, handler and account deletion

**Files:**
- Modify: `apps/api/src/routes.ts` (near `/v1/me` at ~164), `apps/api/src/handler.ts` (deps, near `account:` at ~167), `apps/api/src/accountRoute.ts` (DELETE), `apps/api/src/accountRoute.test.ts`, `apps/api/src/routes.test.ts`

**Interfaces:**
- Consumes: Tasks 1 to 4. Produces: `RouterDeps.analytics?: { store: AnalyticsStore; quota: Quota; clock: Clock; salt: string; admins: readonly string[] }`; paths `/v1/events`, `/v1/me/events`, `/v1/admin/*` routed; `AccountDeps.onDelete?: (userId: string) => Promise<void>` called by `DELETE /v1/me` after the profile is removed.

- [ ] **Step 1: Write failing tests**: `routes.test.ts`: with `analytics` absent all three prefixes → 404 `not_found`; present → routed to the handlers. `accountRoute.test.ts`: `DELETE /v1/me` calls `onDelete` with the user id once; a throwing `onDelete` still returns `{ deleted: true }`.
- [ ] **Step 2: Run** both files. Expected: FAIL.
- [ ] **Step 3: Implement** the wiring. In `handler.ts` build `analytics` with `dynamoAnalyticsStore(mustEnv('WATCH_TABLE'), docClient)`, `dynamoQuota`, `liveClock()`, `requestSalt`, `admins: parseAllowList(process.env.ADMIN_EMAILS)`, and set `account.onDelete = (id) => store.removeUser(id)`.
- [ ] **Step 4: Run** `npx vitest run apps/api` and `make typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(api): route analytics and admin, delete analytics with the account`.

### Task 6: Infrastructure

**Files:**
- Modify: `infra/lib/VayuStack.ts` (routes near 206-232, `routeSettings` near 236-243, environment near 122), `infra/lib/Accounts.ts` if the authorizer must be shared; `infra/test/VayuStack.test.ts`

**Interfaces:**
- Produces: HTTP API routes `POST /v1/events` (public), `POST /v1/me/events` and `GET /v1/admin/{proxy+}` (both with the existing Cognito `HttpUserPoolAuthorizer`), all integrated with `apiFunction`; Lambda env `ADMIN_EMAILS` from CDK context `adminEmails` (default `''`); stage throttles `POST /v1/events` 5/10, `POST /v1/me/events` 3/6, `GET /v1/admin/{proxy+}` 3/6. The new routes must be added to `limitedRoutes` so the stage depends on them. Table access already granted (`watch.grantReadWriteData`).

- [ ] **Step 1: Write failing assertions** in `VayuStack.test.ts`: the template has the three routes with the expected authorizer (the two signed-in ones have `AuthorizationType: JWT`, `POST /v1/events` has `NONE`); `ADMIN_EMAILS` is in the function environment when context `adminEmails` is set and is `''` when not; route settings include the three throttles; no existing resource logical id changed (snapshot of existing route keys unchanged).
- [ ] **Step 2: Run** `npx vitest run infra/test/VayuStack.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the CDK changes. Reuse the authorizer object that `Accounts` builds (expose it as a public field if needed) rather than creating a second one.
- [ ] **Step 4: Run** the infra test and `make synth`. Expected: PASS, synth succeeds. **Do not deploy.**
- [ ] **Step 5: Commit** `feat(infra): analytics and admin routes`. Add the deploy command to `docs/SETUP-GUIDE.md`: `cdk deploy -c adminEmails=aniketgupta3001@gmail.com,harsh22198@iiitd.ac.in` (Harsh runs this).

### Task 7: Client collector

**Files:**
- Create: `apps/web/src/analytics/collector.ts`, `apps/web/src/analytics/device.ts`, `apps/web/src/analytics/index.ts`
- Test: `apps/web/src/analytics/collector.test.ts`, `apps/web/src/analytics/device.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface Collector {
    track(kind: Kind, detail?: string, n?: number): void;   // never throws
    flush(): Promise<void>;                                  // never rejects
  }
  export function createCollector(opts: {
    send: (batch: Batch, signedIn: boolean) => Promise<boolean>;  // true when delivered
    deviceId: () => string; sessionId: string; device: () => DeviceInfo;
    now: () => string; maxQueue?: number /*200*/; batchSize?: number /*25*/;
  }): Collector;
  export function deviceInfo(): DeviceInfo;     // platform via window.Capacitor?.getPlatform?.() else 'web'; appVersion from package version; screen "WxH"; lang navigator.language
  export function track(kind: Kind, detail?: string, n?: number): void;  // app-wide singleton from index.ts
  ```
  `Kind`/`Batch`/`DeviceInfo` types are duplicated as a small `types.ts` in the web app (the web app does not import from `apps/api`), kept identical to the vocabulary above. The device id is a random UUID stored in `localStorage` under `vayu.analytics.device` (try/catch around storage; fall back to an in-memory id). Singleton `send` posts JSON to `${API_URL}/v1/me/events` with `authorization: Bearer <freshIdToken>` when a session exists, else `${API_URL}/v1/events`; flushes every 30 s while the page is visible, when 20 events are queued, and on `visibilitychange` to hidden (`fetch` with `keepalive: true`); emits one `session_start` at startup and one `active` event with elapsed visible seconds on each flush; does nothing when `import.meta.env.MODE === 'test'`.

- [ ] **Step 1: Write failing tests**: `track` queues and `flush` sends one batch with `deviceId`, `sessionId` and device info; more than `batchSize` events send several batches in order; `send` returning `false` or rejecting keeps events once for one retry on the next flush, then drops them (no retry storm); `track` and `flush` never throw when `send` throws synchronously; queue never exceeds 200 and the oldest are dropped first (enqueue 250, assert the first sent event is number 51); `deviceInfo` rounds nothing sensitive and never includes a user's email; `device.test.ts` checks the id is stable across calls and survives a throwing `localStorage`.
- [ ] **Step 2: Run** `npx vitest run apps/web/src/analytics`. Expected: FAIL.
- [ ] **Step 3: Implement** as specified (timer and visibility wiring live in `index.ts`, the pure queue logic in `collector.ts`). The primary place's cell: read the first saved place's coordinates from the existing places store and send `{lat,lng}` rounded to 1 decimal; none saved means no `cell`.
- [ ] **Step 4: Run** the tests plus `make typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): analytics collector`.

### Task 8: Instrument the app

**Files:**
- Modify: `apps/web/src/App.tsx` (screen views via `useLocation`), `apps/web/src/main.tsx` (start collector, global `window` `error` and `unhandledrejection` → `error`), `apps/web/src/exposure/ui/PlacePicker.tsx` (`detect_location`, `permission:location:*`), `apps/web/src/places/ui/PlaceSearch.tsx` (`search`, once per completed lookup), the place-adding handler (`add_place`), the Lens, assistant, Exposure, map-layer, recorded-days and Bluetooth connect call sites (locate with `grep`; one `track('feature', …)` each), the shared API fetch helper (`api`: only when a call takes over 3000 ms or fails, `detail` is `"<path> <ms>ms"` or `"<path> <status>"`). Tests alongside the existing ones.

**Interfaces:**
- Consumes: `track` from Task 7. Produces: events using exactly the allow-listed details in "Shared vocabulary".

- [ ] **Step 1: Write failing tests**: with `track` mocked (`vi.mock('../analytics')`), rendering `<App/>` at `#/lens` calls `track('screen','lens')`; `PlaceSearch` typing a query that returns results calls `track('feature','search')` once per lookup, not per keystroke; tapping a result in the Add sheet calls `track('feature','add_place')`; a denied location in `browserLocate`'s caller calls `track('permission','location:denied')`; `track` throwing never breaks rendering (mock it to throw, UI still renders).
- [ ] **Step 2: Run** the new tests. Expected: FAIL.
- [ ] **Step 3: Implement** the call sites. Each is one line; do not restructure components. Details must come from the allow-list constants, not free text from the user (never send what the person typed, a place name, or coordinates).
- [ ] **Step 4: Run** `NODE_OPTIONS=--no-experimental-webstorage npm test` and `make lint typecheck`. Expected: all pass.
- [ ] **Step 5: Commit** `feat(web): record usage events`.

### Task 9: Admin panel

**Files:**
- Create: `apps/web/src/admin/adminApi.ts`, `apps/web/src/admin/AdminScreen.tsx`, `apps/web/src/admin/AdminScreen.test.tsx`
- Modify: `apps/web/src/App.tsx` (lazy route `/admin`), `apps/web/src/styles.css` (admin rules, reusing existing tokens and card classes)

**Interfaces:**
- Consumes: `freshIdToken` and the session from `apps/web/src/account`, `API_URL`. Produces: `createAdminApi(base, getToken, fetchImpl)` with `whoami()`, `summary(days)`, `groups(by, days)`, `users()`, `user(id)`, `errors()`; `AdminScreen` with `api` prop defaulting to the real one.

Panel behaviour: on mount call `whoami()`; any non-200 (including no session, 401, 403, network error) navigates to `/` and renders nothing in the meantime, so a non-admin sees the normal app and no admin chrome. For an admin: tabs **Overview** (today's users, sessions, active minutes, errors; 14-day bars for users and sessions in plain CSS, no chart library), **Groups** (dimension picker `platform|version|region|auth|visitor`, days 7/14/30, a table of sessions, users, average minutes per session, errors, top five features), **Accounts** (list: email, last seen, sessions, platform, version, region; tap one for its profile and a newest-first timeline), **Errors** (recent samples). Never linked from any normal screen; `/#/admin` typed by hand only. Follow the existing look (cards, spacing, 44 px tap targets, 360 px width, dark mode tokens).

- [ ] **Step 1: Write failing tests** (jsdom): `whoami` rejecting 403 → `navigate('/')` and no "Admin" text rendered; `whoami` 200 → Overview numbers render from a stub api; switching the Groups dimension calls `groups('region', 14)`; tapping an account calls `user(id)` and shows the timeline newest first; no link to `/admin` exists anywhere in rendered `<App/>`.
- [ ] **Step 2: Run** `npx vitest run apps/web/src/admin`. Expected: FAIL.
- [ ] **Step 3: Implement** with `React.lazy` so the panel is a separate chunk.
- [ ] **Step 4: Run** tests, lint, typecheck, and `npm run build` for web and the native build (`VITE_NATIVE=true`). Expected: pass; the website bundle contains no new native-only code.
- [ ] **Step 5: Screenshot check:** open `#/admin` in headless Chrome with a stubbed API at 360 px width, light and dark; confirm no overflow. Commit `feat(web): admin panel`.

### Task 10: Documentation and hand-off

**Files:**
- Modify: `README.md` (one short "Admin analytics" paragraph: what is collected, who can see it, how to deploy), `docs/SETUP-GUIDE.md` (the `-c adminEmails=` deploy step, and "sign in with an admin email, then open `/#/admin`").

- [ ] **Step 1:** Write the docs; state plainly what is stored (no addresses, city only) and that the admin list lives in deploy config.
- [ ] **Step 2: Run** `make lint typecheck test synth`. Expected: all pass.
- [ ] **Step 3: Commit** `docs: admin analytics` and push the branch. **Do not deploy**: Harsh deploys after reading the CDK diff.

---

## Self-Review

- **Spec coverage:** server-side admin check (T1, T4, T6); anonymous in group totals and signed-in-only individual view (T2, T3); behaviour and technical fields (shared vocabulary, T2, T7, T8); city-level region (T2, T7); funnel and new vs returning (T2); retention 90 days (T2, Global Constraints); abuse limits (T3, T6); panel never linked, non-admin sees normal app (T9); reuse of existing table and no change to existing resources (T6); delete with account (T5); token carries email, since the app sends the ID token (`freshIdToken`), which has `email`; verified in T1 by reading claims, and T6's assertion covers the authorizer.
- **Cross-dimension filters** (for example "Android users in Bengaluru who never added a place") are not in this version: counters are one dimension at a time. Stated limit; the funnel field `firstPlaceAt` exists per account for the individual view.
- **Type consistency:** `Kind`, `Batch`, `DeviceInfo`, `Dimension`, `AnalyticsStore` method names and `ApiRequest.email/emailVerified` are used identically in T1 to T9.
- **Open risk:** Cognito ID tokens carry `email_verified` as a boolean claim; API Gateway HTTP API passes it as the string `"true"`. T1 accepts both and its tests cover both.
