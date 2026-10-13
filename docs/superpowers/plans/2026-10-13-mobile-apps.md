# Android and iOS apps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Installable Android and iOS test builds of the existing web app, using a Capacitor shell, with Bluetooth working natively on both.

**Architecture:** A new `apps/mobile` workspace holds the Capacitor config and the generated `android/` and `ios/` projects. The web app is built a second time with `VITE_NATIVE=true` into `apps/mobile/www`, never into `apps/web/dist`. Native-only code (the Bluetooth adapter) is reached through `import.meta.env.VITE_NATIVE`, so the normal web build drops it entirely. CORS for the apps is added in CloudFront on a separate branch, as a pull request for Harsh Kumar to deploy.

**Tech Stack:** Capacitor (core, cli, android, ios), `@capacitor-community/bluetooth-le`, Vite, React, Vitest, AWS CDK (TypeScript).

**Spec:** `docs/superpowers/specs/2026-10-13-mobile-apps-design.md`

## Global Constraints

- **Harsh's deployed AWS resources and website must not change.** Never run `cdk deploy`, `cdk diff`, `make deploy-diff`, `make deploy-site`, `scripts/deploy-site.sh`, or any `aws` command. Set no `AWS_PROFILE` and no AWS credentials. `cdk synth` (inside `make prove`) is local and allowed.
- The browser build must be unchanged: with `VITE_NATIVE` unset, `apps/web/dist` must contain no native-plugin code. Task 7 checks this.
- Mobile builds write to `apps/mobile/www`, never to `apps/web/dist`.
- The infrastructure change lives on its own branch `infra/mobile-cors`, never on `main` or `feature/mobile-apps`, and is never deployed from here.
- App id `com.vayu.app`, app name `Vayu`. Android scheme `https` (origin `https://localhost`); iOS origin `capacitor://localhost`.
- The apps call the existing address `https://d3lmq1mze2gup3.cloudfront.net`.
- Node 22 or later. Keep `make prove` passing and green at the end of every task that touches `apps/web` or `infra`.
- Code style follows the repo: strict TypeScript, no `any`, no non-null assertions, explicit return types, `consistent-type-imports`, Prettier.
- Test builds only: no store listings, push notifications, background Bluetooth or release signing.
- Custom app icon and splash art are out of scope (no source artwork in the repo); the Capacitor defaults ship.

## Review Focus

- The person declines the Bluetooth permission prompt: connect rejects with a readable message, not a raw plugin error (Task 3).
- The person closes the device picker without choosing: connect rejects with "No unit was chosen." and the UI is not left on "connecting" (Task 3).
- Bluetooth is switched off on the phone: a readable "Bluetooth is off" message (Task 3).
- The unit goes out of range: `onDisconnect` fires exactly once, and packets arriving afterwards are ignored (Task 3).
- `useUnit` ignores `defaultTransport` and always uses `webBluetooth`, so the iOS app would never use native Bluetooth: `useUnit.ts` must use `defaultTransport` (Task 4).
- Normal web build accidentally ships the native plugin or flips to the native transport (Tasks 4 and 7).
- The apps are opened before Harsh deploys the CORS change: API calls fail and the existing error screen must show, not a blank page (manual check, Task 9).

## File Structure

| File                                                                     | Responsibility                                                                              |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| `apps/web/src/devices/nativeBle.ts` (new)                                | `UnitTransport` over the Capacitor Bluetooth LE plugin; maps plugin errors to readable ones |
| `apps/web/src/devices/nativeBle.test.ts` (new)                           | Tests for the adapter with a fake plugin                                                    |
| `apps/web/src/devices/transport.ts` (modify)                             | `pickTransport(native)` and `defaultTransport`                                              |
| `apps/web/src/devices/transport.test.ts` (new)                           | Tests transport selection                                                                   |
| `apps/web/src/devices/useUnit.ts` (modify)                               | Default to `defaultTransport`                                                               |
| `apps/web/src/env.d.ts` (modify)                                         | Type `VITE_NATIVE`                                                                          |
| `apps/mobile/package.json`, `tsconfig.json`, `capacitor.config.ts` (new) | The mobile workspace                                                                        |
| `apps/mobile/scripts/build-web.mjs` (new)                                | Builds the web app for the shell into `www`                                                 |
| `apps/mobile/android/`, `apps/mobile/ios/` (generated)                   | Native projects, committed                                                                  |
| `docs/MOBILE.md` (new), `README.md` (modify)                             | How to build and install                                                                    |
| `infra/lib/Site.ts` (modify, branch `infra/mobile-cors`)                 | CORS for the app origins at CloudFront                                                      |
| `infra/test/VayuStack.test.ts` (modify, same branch)                     | Tests for the CORS change                                                                   |

---

### Task 1: Branch and clean starting point

**Files:** none changed.

- [ ] **Step 1: Check the working tree**

Run: `git status --short | grep -v '^D '`
Expected: the earlier documentation edits (README, docs) show as modified and uncommitted.

- [ ] **Step 2: Ask the user whether to commit those documentation edits first**

They belong to the hackathon-removal work, not to this feature. If the user says yes:

```bash
git add README.md docs
git commit -m "Docs: remove hackathon material and references

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 3: Create the feature branch**

```bash
git switch -c feature/mobile-apps
```

Expected: `Switched to a new branch 'feature/mobile-apps'`.

---

### Task 2: Mobile workspace and Capacitor config

**Files:**

- Create: `apps/mobile/package.json`, `apps/mobile/tsconfig.json`, `apps/mobile/capacitor.config.ts`, `apps/mobile/scripts/build-web.mjs`
- Modify: `package.json` (workspaces and scripts), `.gitignore`

**Interfaces:**

- Produces: workspace `@vayu/mobile`; root scripts `mobile:sync`, `mobile:android`, `mobile:ios`; build output `apps/mobile/www`.

- [ ] **Step 1: Create `apps/mobile/package.json`**

```json
{
  "name": "@vayu/mobile",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "build:web": "node scripts/build-web.mjs",
    "sync": "npm run build:web && cap sync",
    "typecheck": "tsc -p ."
  },
  "dependencies": {},
  "devDependencies": {}
}
```

- [ ] **Step 2: Install Capacitor and the Bluetooth plugin into the workspace**

Root `package.json` must list the workspace first. Edit `package.json`: add `"apps/mobile"` after `"apps/web"` in `workspaces`, and add these scripts:

```json
"mobile:sync": "npm run sync -w @vayu/mobile",
"mobile:android": "npm run mobile:sync && npm exec -w @vayu/mobile cap -- open android",
"mobile:ios": "npm run mobile:sync && npm exec -w @vayu/mobile cap -- open ios"
```

Then run:

```bash
npm install -w @vayu/mobile @capacitor/core @capacitor/android @capacitor/ios @capacitor-community/bluetooth-le
npm install -w @vayu/mobile -D @capacitor/cli
```

Expected: both succeed. Record the resolved major version of `@capacitor/core` (`npm ls @capacitor/core`); all four Capacitor packages must share it. If `@capacitor-community/bluetooth-le` refuses that major version, install the newest Capacitor major it supports instead.

- [ ] **Step 3: Create `apps/mobile/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "types": ["node"] },
  "include": ["capacitor.config.ts"]
}
```

- [ ] **Step 4: Create `apps/mobile/capacitor.config.ts`**

```ts
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.vayu.app',
  appName: 'Vayu',
  webDir: 'www',
  server: {
    // The app is served from https://localhost on Android; iOS uses capacitor://localhost.
    androidScheme: 'https',
  },
  ios: {
    // Keep the page out of the notch and the home bar without any change to the web app's styles.
    contentInset: 'always',
  },
};

export default config;
```

- [ ] **Step 5: Create `apps/mobile/scripts/build-web.mjs`**

```js
// Builds the web app for the native shell into apps/mobile/www. It never writes to apps/web/dist, which is what
// the website's own deploy uploads.
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const web = join(here, '..', '..', 'web');
const out = join(here, '..', 'www');
const api = process.env.VAYU_API_URL ?? 'https://d3lmq1mze2gup3.cloudfront.net';

const result = spawnSync('npx', ['vite', 'build', '--outDir', out, '--emptyOutDir'], {
  cwd: web,
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, VITE_NATIVE: 'true', VITE_API_URL: api },
});
process.exit(result.status ?? 1);
```

- [ ] **Step 6: Ignore the build output**

Append to `.gitignore`:

```
# The web app built for the native shell
apps/mobile/www/
```

- [ ] **Step 7: Verify the config typechecks**

Run: `npm run typecheck -w @vayu/mobile`
Expected: exits 0.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json .gitignore apps/mobile
git commit -m "Mobile: add the Capacitor workspace and web build for the shell

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Native Bluetooth adapter (test first)

**Files:**

- Create: `apps/web/src/devices/nativeBle.ts`
- Test: `apps/web/src/devices/nativeBle.test.ts`

**Interfaces:**

- Consumes: `UnitTransport`, `UnitHandlers`, `UnitLink` from `./ble`; `UNIT_SERVICE_UUID`, `UNIT_READING_UUID` from `./unitProtocol`.
- Produces: `interface BleClientLike`; `function createNativeBle(load?: () => Promise<BleClientLike>): UnitTransport`; `const nativeBle: UnitTransport`.

- [ ] **Step 1: Write the failing tests** in `apps/web/src/devices/nativeBle.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { createNativeBle, type BleClientLike } from './nativeBle';
import { UNIT_READING_UUID, UNIT_SERVICE_UUID } from './unitProtocol';

interface Fake {
  readonly client: BleClientLike;
  readonly calls: string[];
  readonly requested: { services: string[] }[];
  push(bytes: number[]): void;
  drop(): void;
}

function fake(
  options: {
    failAt?: 'initialize' | 'requestDevice' | 'connect' | 'startNotifications';
    error?: Error;
  } = {},
): Fake {
  const calls: string[] = [];
  const requested: { services: string[] }[] = [];
  let notify: ((value: DataView) => void) | undefined;
  let dropped: (() => void) | undefined;
  const maybeFail = (step: NonNullable<typeof options.failAt>): Promise<void> =>
    options.failAt === step ? Promise.reject(options.error) : Promise.resolve();
  const client: BleClientLike = {
    async initialize() {
      calls.push('initialize');
      await maybeFail('initialize');
    },
    async requestDevice(request) {
      calls.push('requestDevice');
      requested.push(request);
      await maybeFail('requestDevice');
      return { deviceId: 'AA:BB', name: 'Vayu-3F2A' };
    },
    async connect(deviceId, onDisconnect) {
      calls.push(`connect ${deviceId}`);
      dropped = () => {
        onDisconnect(deviceId);
      };
      await maybeFail('connect');
    },
    async startNotifications(deviceId, service, characteristic, callback) {
      calls.push(`notify ${deviceId} ${service} ${characteristic}`);
      notify = callback;
      await maybeFail('startNotifications');
    },
    disconnect(deviceId) {
      calls.push(`disconnect ${deviceId}`);
      dropped?.();
      return Promise.resolve();
    },
  };
  return {
    client,
    calls,
    requested,
    push(bytes) {
      notify?.(new DataView(new Uint8Array(bytes).buffer));
    },
    drop() {
      dropped?.();
    },
  };
}

const handlers = (): {
  packets: number[][];
  disconnects: { count: number };
  value: { onPacket: (b: Uint8Array) => void; onDisconnect: () => void };
} => {
  const packets: number[][] = [];
  const disconnects = { count: 0 };
  return {
    packets,
    disconnects,
    value: {
      onPacket: (bytes) => packets.push([...bytes]),
      onDisconnect: () => {
        disconnects.count += 1;
      },
    },
  };
};

describe('the native Bluetooth transport', () => {
  it('is always supported inside the app', () => {
    expect(createNativeBle(() => Promise.resolve(fake().client)).supported()).toBe(true);
  });

  it('looks for the unit by its service, connects and hands over each packet as bytes', async () => {
    const f = fake();
    const h = handlers();
    const link = await createNativeBle(() => Promise.resolve(f.client)).connect(h.value);
    expect(f.requested).toEqual([{ services: [UNIT_SERVICE_UUID] }]);
    expect(f.calls).toContain(`notify AA:BB ${UNIT_SERVICE_UUID} ${UNIT_READING_UUID}`);
    expect(link.name).toBe('Vayu-3F2A');
    f.push([1, 2, 3]);
    expect(h.packets).toEqual([[1, 2, 3]]);
  });

  it('tells the app once when the unit drops, and ignores packets after that', async () => {
    const f = fake();
    const h = handlers();
    await createNativeBle(() => Promise.resolve(f.client)).connect(h.value);
    f.drop();
    f.drop();
    f.push([9]);
    expect(h.disconnects.count).toBe(1);
    expect(h.packets).toEqual([]);
  });

  it('disconnects the unit when the person does, and says so once', async () => {
    const f = fake();
    const h = handlers();
    const link = await createNativeBle(() => Promise.resolve(f.client)).connect(h.value);
    link.disconnect();
    link.disconnect();
    expect(f.calls.filter((c) => c === 'disconnect AA:BB')).toHaveLength(1);
    expect(h.disconnects.count).toBe(1);
  });

  it('says plainly that no unit was chosen when the picker is closed', async () => {
    const f = fake({ failAt: 'requestDevice', error: new Error('requestDevice cancelled') });
    await expect(
      createNativeBle(() => Promise.resolve(f.client)).connect(handlers().value),
    ).rejects.toThrow('No unit was chosen.');
  });

  it('says plainly that permission was refused', async () => {
    const f = fake({ failAt: 'initialize', error: new Error('Permission denied') });
    await expect(
      createNativeBle(() => Promise.resolve(f.client)).connect(handlers().value),
    ).rejects.toThrow('Bluetooth permission was refused');
  });

  it('says plainly that Bluetooth is off', async () => {
    const f = fake({ failAt: 'initialize', error: new Error('Bluetooth is disabled') });
    await expect(
      createNativeBle(() => Promise.resolve(f.client)).connect(handlers().value),
    ).rejects.toThrow('Bluetooth is off');
  });

  it('lets go of the unit if it fails after connecting', async () => {
    const f = fake({ failAt: 'startNotifications', error: new Error('gatt error 133') });
    await expect(
      createNativeBle(() => Promise.resolve(f.client)).connect(handlers().value),
    ).rejects.toThrow('Could not connect to the unit: gatt error 133');
    expect(f.calls).toContain('disconnect AA:BB');
  });
});
```

- [ ] **Step 2: Run the tests and see them fail**

Run: `npx vitest run apps/web/src/devices/nativeBle.test.ts`
Expected: FAIL, `Cannot find module './nativeBle'`.

- [ ] **Step 3: Write `apps/web/src/devices/nativeBle.ts`**

```ts
import type { UnitHandlers, UnitLink, UnitTransport } from './ble';
import { UNIT_READING_UUID, UNIT_SERVICE_UUID } from './unitProtocol';

/** The part of the Capacitor Bluetooth LE plugin used here, so a test can pass a fake. */
export interface BleClientLike {
  initialize(options?: { androidNeverForLocation?: boolean }): Promise<void>;
  requestDevice(options: {
    services: string[];
  }): Promise<{ readonly deviceId: string; readonly name?: string | undefined }>;
  connect(deviceId: string, onDisconnect: (deviceId: string) => void): Promise<void>;
  startNotifications(
    deviceId: string,
    service: string,
    characteristic: string,
    callback: (value: DataView) => void,
  ): Promise<void>;
  disconnect(deviceId: string): Promise<void>;
}

/** The plugin is loaded only when a unit is first connected, so the website's build never holds it. */
const loadPlugin = async (): Promise<BleClientLike> =>
  (await import('@capacitor-community/bluetooth-le')).BleClient;

/** The plugin's own messages are for developers; these are for the person holding the phone. */
function readable(error: unknown): Error {
  const text = error instanceof Error ? error.message : String(error);
  if (/cancel/iu.test(text)) return new Error('No unit was chosen.');
  if (/permission|denied|unauthori[sz]ed/iu.test(text)) {
    return new Error(
      'Bluetooth permission was refused. Allow it in the phone settings to connect a unit.',
    );
  }
  if (/disabled|powered off|not enabled|turned off|bluetooth is off/iu.test(text)) {
    return new Error('Bluetooth is off. Turn it on and try again.');
  }
  return new Error(`Could not connect to the unit: ${text}`);
}

/** Bluetooth Low Energy through the app's native plugin: the same unit and packets as in the browser, also on iPhone. */
export function createNativeBle(load: () => Promise<BleClientLike> = loadPlugin): UnitTransport {
  return {
    supported: () => true,
    async connect(handlers: UnitHandlers): Promise<UnitLink> {
      const ble = await load();
      let deviceId: string | undefined;
      let open = true;
      const closed = (): void => {
        if (!open) return;
        open = false;
        handlers.onDisconnect();
      };
      try {
        await ble.initialize({ androidNeverForLocation: true });
        const device = await ble.requestDevice({ services: [UNIT_SERVICE_UUID] });
        deviceId = device.deviceId;
        await ble.connect(deviceId, closed);
        await ble.startNotifications(deviceId, UNIT_SERVICE_UUID, UNIT_READING_UUID, (value) => {
          if (open)
            handlers.onPacket(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
        });
        const id = deviceId;
        return {
          name: device.name ?? 'Vayu unit',
          disconnect: () => {
            if (!open) return;
            void ble.disconnect(id).finally(closed);
          },
        };
      } catch (error) {
        open = false;
        if (deviceId !== undefined) await ble.disconnect(deviceId).catch(() => undefined);
        throw readable(error);
      }
    },
  };
}

export const nativeBle: UnitTransport = createNativeBle();
```

- [ ] **Step 4: Run the tests and see them pass**

Run: `npx vitest run apps/web/src/devices/nativeBle.test.ts`
Expected: 8 tests PASS. If the "disconnects the unit when the person does" test counts the callback twice, check that `closed` is guarded by `open` and that `disconnect` returns before the fake's own callback runs `closed` a second time.

- [ ] **Step 5: Typecheck and lint**

Run: `npm run typecheck -w @vayu/web && npx eslint apps/web/src/devices`
Expected: exits 0. If TypeScript says the real `BleClient` does not satisfy `BleClientLike`, adjust the `BleClientLike` parameter types to match the plugin's published types, keeping the five methods used.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/devices/nativeBle.ts apps/web/src/devices/nativeBle.test.ts
git commit -m "Devices: native Bluetooth transport for the mobile apps

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Choose the transport by build, and use it everywhere

**Files:**

- Modify: `apps/web/src/devices/transport.ts`, `apps/web/src/devices/useUnit.ts`, `apps/web/src/env.d.ts`
- Test: `apps/web/src/devices/transport.test.ts`

**Interfaces:**

- Consumes: `nativeBle` from `./nativeBle`, `webBluetooth` from `./ble`.
- Produces: `pickTransport(native: boolean): UnitTransport`, `defaultTransport: UnitTransport`.

- [ ] **Step 1: Write the failing test** `apps/web/src/devices/transport.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { webBluetooth } from './ble';
import { nativeBle } from './nativeBle';
import { defaultTransport, pickTransport } from './transport';

describe('choosing how to reach a unit', () => {
  it('uses the native plugin inside the app and the browser API everywhere else', () => {
    expect(pickTransport(true)).toBe(nativeBle);
    expect(pickTransport(false)).toBe(webBluetooth);
  });

  it('uses the browser API in a normal build, which sets no native flag', () => {
    expect(defaultTransport).toBe(webBluetooth);
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest run apps/web/src/devices/transport.test.ts`
Expected: FAIL, `pickTransport` is not exported.

- [ ] **Step 3: Replace `apps/web/src/devices/transport.ts`**

```ts
import { webBluetooth, type UnitTransport } from './ble';
import { nativeBle } from './nativeBle';

/** Native inside the phone app, the browser's own Bluetooth everywhere else. */
export const pickTransport = (native: boolean): UnitTransport =>
  native ? nativeBle : webBluetooth;

/**
 * How the app reaches a unit. `VITE_NATIVE` is set only by the build for the phone apps; in the website's build it
 * is replaced by a constant, so the native branch and its plugin are dropped from the files that are served.
 */
export const defaultTransport = pickTransport(import.meta.env.VITE_NATIVE === 'true');
```

- [ ] **Step 4: Type the flag.** In `apps/web/src/env.d.ts`, inside `ImportMetaEnv`, after `VITE_ASSISTANT_URL`:

```ts
  /** "true" only in the build for the Android and iOS apps; unset for the website. */
  readonly VITE_NATIVE?: string;
```

- [ ] **Step 5: Make `useUnit` use the shared default.** In `apps/web/src/devices/useUnit.ts` change line 2 and line 32:

```ts
import type { UnitTransport } from './ble';
import { defaultTransport } from './transport';
```

and

```ts
const transport = options.transport ?? defaultTransport;
```

- [ ] **Step 6: Confirm nothing else uses the browser transport directly**

Run: `grep -rn "webBluetooth" apps/web/src --include=*.ts --include=*.tsx`
Expected: only `ble.ts`, `transport.ts`, `transport.test.ts`.

- [ ] **Step 7: Run all device tests and the typecheck**

Run: `npx vitest run apps/web/src/devices && npm run typecheck -w @vayu/web`
Expected: PASS, exit 0.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/devices apps/web/src/env.d.ts
git commit -m "Devices: pick the Bluetooth transport by build, native in the apps

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Android project and permissions

**Files:**

- Create (generated): `apps/mobile/android/`
- Modify: `apps/mobile/android/app/src/main/AndroidManifest.xml`

- [ ] **Step 1: Build the web app for the shell and add the platform**

```bash
npm run build:web -w @vayu/mobile
cd apps/mobile && npx cap add android
```

Expected: `apps/mobile/www/index.html` exists; `apps/mobile/android/` is created.

- [ ] **Step 2: Add the permissions.** In `apps/mobile/android/app/src/main/AndroidManifest.xml`, directly after the existing `<uses-permission android:name="android.permission.INTERNET" />` line, add:

```xml
    <!-- Bluetooth unit (Android 12 and later) -->
    <uses-permission android:name="android.permission.BLUETOOTH_SCAN" android:usesPermissionFlags="neverForLocation" />
    <uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />
    <!-- Bluetooth unit (Android 11 and earlier) -->
    <uses-permission android:name="android.permission.BLUETOOTH" android:maxSdkVersion="30" />
    <uses-permission android:name="android.permission.BLUETOOTH_ADMIN" android:maxSdkVersion="30" />
    <!-- Detect my location, and live location; Bluetooth scanning on Android 11 and earlier -->
    <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
    <!-- AIR Lens -->
    <uses-permission android:name="android.permission.CAMERA" />
    <uses-feature android:name="android.hardware.camera" android:required="false" />
    <uses-feature android:name="android.hardware.bluetooth_le" android:required="false" />
```

- [ ] **Step 3: Sync and check the plugin was picked up**

Run: `cd apps/mobile && npx cap sync android`
Expected: output lists `@capacitor-community/bluetooth-le` under Android plugins.

- [ ] **Step 4: Check whether an APK can be built on this machine**

Run: `java -version; echo "ANDROID_HOME=$ANDROID_HOME"`
The Android Gradle build needs JDK 17 or 21 and the Android SDK. When `ANDROID_HOME` is empty or Java is 24, report that the APK cannot be built here and leave the build to a machine with Android Studio; do not install an SDK without asking the user. When both are present: `cd apps/mobile/android && ./gradlew assembleDebug` (on Windows `gradlew.bat assembleDebug`), expecting `BUILD SUCCESSFUL` and `app/build/outputs/apk/debug/app-debug.apk`.

- [ ] **Step 5: Commit** (generated native projects are committed; their own `.gitignore` files exclude build output)

```bash
git add apps/mobile/android
git commit -m "Mobile: Android project with Bluetooth, location and camera permissions

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: iOS project and permissions

**Files:**

- Create (generated): `apps/mobile/ios/`
- Modify: `apps/mobile/ios/App/App/Info.plist`

- [ ] **Step 1: Try to add the platform**

Run: `cd apps/mobile && npx cap add ios`
Expected on a Mac: `apps/mobile/ios/` created. On Windows the command may refuse or skip the CocoaPods step. If it refuses, skip to Step 4 and hand this task to Harsh, who has a Mac.

- [ ] **Step 2: Add the usage descriptions.** In `apps/mobile/ios/App/App/Info.plist`, before the final `</dict>`, add:

```xml
	<key>NSBluetoothAlwaysUsageDescription</key>
	<string>Vayu connects to your measuring unit over Bluetooth to show your room's air.</string>
	<key>NSLocationWhenInUseUsageDescription</key>
	<string>Vayu uses your location to show the air where you are.</string>
	<key>NSCameraUsageDescription</key>
	<string>Vayu uses the camera for AIR Lens, which draws the air over what you see. Nothing is recorded or sent.</string>
```

- [ ] **Step 3: Sync and commit**

```bash
cd apps/mobile && npx cap sync ios
git add apps/mobile/ios
git commit -m "Mobile: iOS project with Bluetooth, location and camera descriptions

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 4: If this was not possible on Windows,** write the three commands Harsh runs on the Mac into `docs/MOBILE.md` (Task 8) and mark this task as handed over: `npm ci`, `npm run mobile:sync`, then `cd apps/mobile && npx cap add ios`, edit `Info.plist` as in Step 2, `npx cap sync ios`, commit `apps/mobile/ios`.

---

### Task 7: Prove the website build is unchanged

**Files:** none changed.

- [ ] **Step 1: Run the full proof**

Run: `make prove`
Expected: ends with `prove: lint, types, tests, cdk synth bundle check passed`. This builds the website bundle with `VITE_API_URL=` and no `VITE_NATIVE`.

- [ ] **Step 2: Check that the native plugin is not in the website bundle**

Run: `grep -rlE "bluetooth-le|Capacitor" apps/web/dist/assets || echo "none"`
Expected: `none`.

- [ ] **Step 3: Check that the website build wrote nothing into the mobile folder and the mobile build nothing into the website's**

Run: `git status --short apps/web/dist apps/mobile/www` and confirm both are untracked/ignored (no output).

- [ ] **Step 4: Check that no AWS command was run during the work**

Run: `git log --oneline main..HEAD` and confirm no commit touched `infra/` or `scripts/deploy-site.sh`.
Expected: no output from `git diff --stat main..HEAD -- infra scripts`.

---

### Task 8: Documentation

**Files:**

- Create: `docs/MOBILE.md`
- Modify: `README.md`, `docs/README.md`

- [ ] **Step 1: Write `docs/MOBILE.md`**

````markdown
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

Needs Android Studio (or the Android SDK) and JDK 17 or 21.

```bash
npm run mobile:android     # opens Android Studio; press Run with a phone attached
# or, without opening it:
cd apps/mobile/android && ./gradlew assembleDebug
# the APK is at apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk
```

### iOS (on a Mac)

Needs Xcode and CocoaPods. A free Apple ID installs for seven days on your own phone; TestFlight needs the paid programme.

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
- Test builds only: no store listing, push notifications or release signing.
````

- [ ] **Step 2: Link it.** In `README.md`, in the Documents table add a row after `docs/UNIT.md`: ``| `docs/MOBILE.md`                  | The Android and iOS apps: build, install, what to check                  |``. In `docs/README.md` add a matching row. Run `npx prettier --write README.md docs/README.md docs/MOBILE.md`.

- [ ] **Step 3: Commit**

```bash
git add README.md docs
git commit -m "Docs: how to build and install the Android and iOS apps

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 9: CORS in CloudFront, on its own branch, for Harsh

**Why CloudFront and not the API:** CloudFront forwards only the viewer's address to the API, so the API never sees an `Origin` header and API Gateway's own CORS would never answer. CORS must be added at CloudFront, including a reply to the browser's `OPTIONS` check, which the API has no route for.

**Files (on branch `infra/mobile-cors`, branched from `main`):**

- Modify: `infra/lib/Site.ts`, `infra/lib/VayuStack.ts` (comment only), `infra/test/VayuStack.test.ts`

**Interfaces:**

- Produces: `MOBILE_ORIGINS`, `API_PREFLIGHT_FUNCTION` exported from `infra/lib/Site.ts`.

- [ ] **Step 1: Branch from main**

```bash
git switch main && git switch -c infra/mobile-cors
```

- [ ] **Step 2: Write the failing tests.** Add to `infra/test/VayuStack.test.ts`: extend the import `import { APP_INDEX_FUNCTION, CONTENT_SECURITY_POLICY } from '../lib/Site';` to also import `API_PREFLIGHT_FUNCTION, MOBILE_ORIGINS`, then add inside `describe('the public site', ...)`:

```ts
describe('letting the phone apps call the API', () => {
  interface Reply {
    statusCode?: number;
    headers?: Record<string, { value: string }>;
    method?: string;
  }
  const preflight = runInNewContext(`${API_PREFLIGHT_FUNCTION}; handler`) as (e: unknown) => Reply;
  const ask = (method: string, origin?: string): Reply =>
    preflight({
      request: {
        method,
        uri: '/v1/today',
        headers: origin === undefined ? {} : { origin: { value: origin } },
      },
    });

  it('allows exactly the two origins the apps run from', () => {
    expect(MOBILE_ORIGINS).toEqual(['https://localhost', 'capacitor://localhost']);
  });

  it('answers the browser’s OPTIONS check itself for an app origin, naming only that origin', () => {
    for (const origin of MOBILE_ORIGINS) {
      const reply = ask('OPTIONS', origin);
      expect(reply.statusCode).toBe(204);
      expect(reply.headers?.['access-control-allow-origin']?.value).toBe(origin);
      expect(reply.headers?.['access-control-allow-headers']?.value).toContain('authorization');
    }
  });

  it('does not answer OPTIONS for any other origin, and leaves every other request alone', () => {
    expect(ask('OPTIONS', 'https://evil.example').statusCode).toBeUndefined();
    expect(ask('OPTIONS').statusCode).toBeUndefined();
    expect(ask('GET', 'https://localhost').statusCode).toBeUndefined();
  });

  it('adds CORS headers to the API behaviors only, not to the website', () => {
    const config = distribution().DistributionConfig as {
      CacheBehaviors: { PathPattern: string; ResponseHeadersPolicyId: unknown }[];
      DefaultCacheBehavior: { ResponseHeadersPolicyId: unknown };
    };
    const policies = Object.entries(
      template.findResources('AWS::CloudFront::ResponseHeadersPolicy'),
    );
    const withCors = policies.filter(([, p]) => JSON.stringify(p).includes('"CorsConfig"'));
    expect(withCors).toHaveLength(1);
    const corsId = JSON.stringify({ Ref: withCors[0]?.[0] });
    for (const behavior of config.CacheBehaviors)
      expect(JSON.stringify(behavior.ResponseHeadersPolicyId)).toBe(corsId);
    expect(JSON.stringify(config.DefaultCacheBehavior.ResponseHeadersPolicyId)).not.toBe(corsId);
    template.hasResourceProperties('AWS::CloudFront::ResponseHeadersPolicy', {
      ResponseHeadersPolicyConfig: Match.objectLike({
        CorsConfig: Match.objectLike({
          AccessControlAllowOrigins: { Items: ['https://localhost', 'capacitor://localhost'] },
          OriginOverride: true,
        }),
      }),
    });
  });

  it('keeps the security headers on the API answers', () => {
    const withCors = Object.values(
      template.findResources('AWS::CloudFront::ResponseHeadersPolicy'),
    ).find((p) => JSON.stringify(p).includes('"CorsConfig"'));
    expect(JSON.stringify(withCors)).toContain('StrictTransportSecurity');
    expect(JSON.stringify(withCors)).toContain('ContentSecurityPolicy');
  });
});
```

- [ ] **Step 3: Run and see them fail**

Run: `npx vitest run infra/test/VayuStack.test.ts -t "phone apps"`
Expected: FAIL, the new exports do not exist.

- [ ] **Step 4: Edit `infra/lib/Site.ts`.** Add to the `aws-cloudfront` import list: `ResponseHeadersPolicy` is already imported; no new import is needed. After `APP_INDEX_FUNCTION`, add:

```ts
/** The origins the Android and iOS apps run from. They are the only sites other than this one that may call the API. */
export const MOBILE_ORIGINS = ['https://localhost', 'capacitor://localhost'] as const;

/**
 * The browser asks "may I?" with an OPTIONS request before it sends a POST or a request with a token. The API has no
 * route for that, so CloudFront answers it for the app origins and passes everything else through untouched.
 */
export const API_PREFLIGHT_FUNCTION = `
var ALLOWED = ${JSON.stringify(MOBILE_ORIGINS)};
function handler(event) {
  var request = event.request;
  if (request.method !== 'OPTIONS') return request;
  var origin = request.headers.origin ? request.headers.origin.value : '';
  if (ALLOWED.indexOf(origin) === -1) return request;
  return {
    statusCode: 204,
    statusDescription: 'No Content',
    headers: {
      'access-control-allow-origin': { value: origin },
      'access-control-allow-methods': { value: 'GET, POST, PUT, DELETE, OPTIONS' },
      'access-control-allow-headers': { value: 'content-type, authorization' },
      'access-control-max-age': { value: '86400' },
      vary: { value: 'Origin' }
    }
  };
}
`;
```

Inside the constructor, replace the `securityHeaders` definition so its two behaviors are shared (the resulting site policy is identical, so nothing existing is replaced):

```ts
const securityBehavior = {
  strictTransportSecurity: {
    accessControlMaxAge: Duration.days(365),
    includeSubdomains: true,
    override: true,
  },
  contentTypeOptions: { override: true },
  frameOptions: { frameOption: HeadersFrameOption.DENY, override: true },
  referrerPolicy: {
    referrerPolicy: HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN,
    override: true,
  },
  contentSecurityPolicy: { contentSecurityPolicy: CONTENT_SECURITY_POLICY, override: true },
};
const customBehavior = {
  // The camera and the location are asked for by the page itself; nothing else may use them.
  customHeaders: [
    {
      header: 'Permissions-Policy',
      value: 'camera=(self), geolocation=(self), microphone=(self), payment=(), usb=()',
      override: true,
    },
  ],
};
const securityHeaders = new ResponseHeadersPolicy(this, 'SecurityHeaders', {
  securityHeadersBehavior: securityBehavior,
  customHeadersBehavior: customBehavior,
});

// The same headers for the API's answers, plus permission for the phone apps to read them.
const apiHeaders = new ResponseHeadersPolicy(this, 'ApiHeaders', {
  securityHeadersBehavior: securityBehavior,
  customHeadersBehavior: customBehavior,
  corsBehavior: {
    accessControlAllowOrigins: [...MOBILE_ORIGINS],
    accessControlAllowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    accessControlAllowHeaders: ['content-type', 'authorization'],
    accessControlAllowCredentials: false,
    accessControlMaxAge: Duration.days(1),
    originOverride: true,
  },
});

const apiPreflight = new CloudFrontFunction(this, 'ApiPreflight', {
  runtime: FunctionRuntime.JS_2_0,
  code: FunctionCode.fromInline(API_PREFLIGHT_FUNCTION),
});
```

In both API behaviors (`'/v1/me'` and `'/v1/*'`) replace `responseHeadersPolicy: securityHeaders,` with:

```ts
          responseHeadersPolicy: apiHeaders,
          functionAssociations: [{ function: apiPreflight, eventType: FunctionEventType.VIEWER_REQUEST }],
```

Update the class comment to end: `... Two origins besides this one, the phone apps', may read the API's answers (see MOBILE_ORIGINS).`

- [ ] **Step 5: Update the comment in `infra/lib/VayuStack.ts`** (the two lines after `createDefaultStage: false,`):

```ts
// No CORS on the HTTP API itself: CloudFront forwards no Origin header to it, so it could never answer one.
// CloudFront adds CORS for the phone apps' origins (see Site.ts); any other origin is refused by the browser.
```

- [ ] **Step 6: Run the infra tests, then the whole proof**

Run: `npx vitest run infra && make prove`
Expected: PASS. In particular the existing tests about the site's security headers, the two API behaviors and the cache policy still pass.

- [ ] **Step 7: Commit and stop. Do not deploy.**

```bash
npx prettier --write infra/lib/Site.ts infra/lib/VayuStack.ts infra/test/VayuStack.test.ts
git add infra
git commit -m "Infra: allow the phone apps' origins to call the API through CloudFront

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
git push -u origin infra/mobile-cors
```

Then tell the user: Harsh reviews and deploys this himself (`cd infra && npx cdk diff` then `cdk deploy`, in his account). After he deploys, he verifies from any terminal:

```bash
curl -i -X OPTIONS https://d3lmq1mze2gup3.cloudfront.net/v1/today \
  -H "Origin: capacitor://localhost" -H "Access-Control-Request-Method: GET"
```

Expected: `HTTP/2 204` and `access-control-allow-origin: capacitor://localhost`; the same with `Origin: https://evil.example` must not return those headers.

- [ ] **Step 8: Return to the feature branch** with `git switch feature/mobile-apps`.

---

### Task 10: On-device check (manual, by the user or Harsh)

- [ ] Install the debug APK on an Android phone and the iOS build on an iPhone (Harsh's Mac), then go through the list in `docs/MOBILE.md` ("What to check on a phone"), noting each failure.
- [ ] Open the apps once **before** the CORS change is deployed and confirm they show the "air data could not be loaded" screen with a Retry, not a blank page.
- [ ] Record the outcome in `docs/MOBILE.md` under a new heading "Checked on".
