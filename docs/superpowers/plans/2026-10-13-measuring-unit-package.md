# Measuring unit package and purifier tag Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (the user chose native execution). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the measuring unit's code into its own package, `@vayu/unit`, and let the unit report that it sits on the purifier (read from a tag), so the app treats those readings as the purifier's output and never as the room's.

**Architecture:** `packages/unit` holds the protocol, both Bluetooth transports, the controller, the measured-hours store, a pure purifier-performance function and the purifier-link store. It imports only `@vayu/core`. The packet grows from 18 to 20 bytes (a flag bit and a 16-bit short id), still version 1. The controller keeps purified readings apart from the room's. The firmware gets a reader interface with a stub.

**Tech Stack:** TypeScript, Vitest, React (the app), Arduino C++ (firmware).

**Spec:** `docs/superpowers/specs/2026-10-13-measuring-unit-package-design.md`

## Global Constraints

- Harsh's AWS resources and website are never touched: no `aws`, `cdk deploy`, `cdk diff` or `deploy-site` command. Nothing in this plan needs AWS.
- The browser build stays free of native code: after every task that changes `apps/web` or `packages/unit`, a website build (`VITE_API_URL= npm run build -w @vayu/web`) must hold no `bluetooth-le` or `Capacitor` text.
- Packet version stays `1`. An 18-byte packet from an old unit must still parse, as `free`.
- A purified reading is never added to the room's measured hours, `latest` or `recent`.
- The package imports nothing from `apps/web`, and no React.
- The unit never guesses indoor or outdoor; it reports only `free` or `purifier`.
- Style: strict TypeScript, no `any`, no non-null assertions (`!`), explicit return types, `consistent-type-imports`, Prettier. Lint ignores are not to be added for source files.
- Work on branch `feature/mobile-apps`; commit after every task.

## Review Focus

- A 20-byte packet with the purifier flag set but a zero short id must be refused, not shown as a purifier reading (Task 2).
- An old 18-byte packet must parse as `free` (Task 2).
- Purified readings must not enter `recent`, `latest` or the measured hours (Task 3).
- The unit lifted off the purifier: the next free reading puts the app back to the room (Task 3).
- The performance figure with a stale free or purified reading (older than 10 minutes) must say "not enough data", and a room reading of 0 must not divide by zero (Task 3).
- The same short id seen twice must ask for a name once (Task 4).
- Website bundle must not grow native code from the move (Task 1 and the last task).

## File Structure

| File                                                          | Responsibility                                                     |
| ------------------------------------------------------------- | ------------------------------------------------------------------ |
| `packages/unit/package.json`, `tsconfig.json`, `src/index.ts` | The workspace and its public exports                               |
| `packages/unit/src/unitProtocol.ts` (moved)                   | Packet layout, parse, encode, now with the tag fields              |
| `packages/unit/src/ble.ts`, `nativeBle.ts` (moved)            | The two Bluetooth transports and their types                       |
| `packages/unit/src/unitController.ts` (moved)                 | The live link; keeps purified readings apart                       |
| `packages/unit/src/measured.ts` (moved)                       | Measured hours, on device                                          |
| `packages/unit/src/performance.ts` (new)                      | `purifierPerformance(free, purified, nowMs)`                       |
| `packages/unit/src/purifierLinks.ts` (new)                    | Short id to purifier name, on device                               |
| `apps/web/src/devices/transport.ts`                           | Stays: picks the transport by build                                |
| `apps/web/src/devices/ui/RoomScreen.tsx`                      | Shows "Purified air", the performance figure and the naming prompt |
| `firmware/vayu-unit/`                                         | Reader interface, stub, packet writer                              |

---

### Task 1: Extract `@vayu/unit` (no behaviour change)

**Files:** Create `packages/unit/*`; move `unitProtocol.ts`, `ble.ts`, `nativeBle.ts`, `unitController.ts`, `measured.ts` and the tests `unitProtocol.test.ts`, `nativeBle.test.ts`, `measured.test.ts` from `apps/web/src/devices/`; modify the files that import them.

- [ ] **Step 1: Create the package files**

`packages/unit/package.json`:

```json
{
  "name": "@vayu/unit",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": { "typecheck": "tsc -p ." },
  "dependencies": {
    "@vayu/core": "*",
    "@capacitor-community/bluetooth-le": "^8.3.0"
  }
}
```

`packages/unit/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "lib": ["ES2023", "DOM"], "types": [] },
  "include": ["src"]
}
```

Add `"packages/unit"` to `workspaces` in the root `package.json` (after `packages/watch`), and `"@vayu/unit": "*"` to `apps/web/package.json` dependencies. Run `npm install`.

- [ ] **Step 2: Move the files with history**

```bash
mkdir -p packages/unit/src
cd apps/web/src/devices
for f in unitProtocol ble nativeBle unitController measured; do git mv $f.ts ../../../../packages/unit/src/$f.ts; done
for f in unitProtocol nativeBle measured; do git mv $f.test.ts ../../../../packages/unit/src/$f.test.ts; done
```

- [ ] **Step 3: Make `measured.ts` independent of the app.** Replace its first line and the two calls:

```ts
import { localDate, localHour } from '@vayu/core';
```

and in `recordReading`: `const date = localDate(iso);` and `const hour = localHour(iso);` (remove the `isoDate`/`hourOfDay` use and `Math.floor`).

- [ ] **Step 4: Write `packages/unit/src/index.ts`**

```ts
export * from './unitProtocol';
export * from './ble';
export * from './nativeBle';
export * from './unitController';
export * from './measured';
```

- [ ] **Step 5: Point the app at the package.** In `apps/web/src/devices/transport.ts` import `webBluetooth`, `nativeBle`, `type UnitTransport` from `'@vayu/unit'`. In `useUnit.ts`, `useRoom.ts`, `useDevices.ts`, `ui/AddDeviceSheet.tsx`, `ui/RoomScreen.tsx`, `ui/RoomPage.test.tsx`, `useUnit.test.tsx`, `exposure/model.ts`, `exposure/measuredUnit.test.ts`, `exposure/rooms.test.ts`, `devices/transport.test.ts` replace imports from `./ble`, `../ble`, `./unitProtocol`, `./unitController`, `./measured`, `../devices/measured` and their `../` forms with `'@vayu/unit'`. Find them all with:

```bash
grep -rnE "from '(\.\./)*(devices/)?\.?/?(unitProtocol|ble|unitController|measured|nativeBle)'" apps/web/src
```

Expected afterwards: no matches.

- [ ] **Step 6: Run everything that could break**

```bash
npx vitest run packages/unit apps/web/src/devices apps/web/src/exposure
npm run typecheck -w @vayu/unit && npm run typecheck -w @vayu/web
node node_modules/eslint/bin/eslint.js packages/unit apps/web/src/devices apps/web/src/exposure
```

Expected: all pass; the moved tests pass unchanged.

- [ ] **Step 7: Check the website bundle**

```bash
VITE_API_URL= npm run build -w @vayu/web && node scripts/check-bundle.mjs
grep -rlE "bluetooth-le|Capacitor" apps/web/dist/assets || echo none
```

Expected: `no made-up data`, then `none`.

- [ ] **Step 8: Add the package to the repo map in `README.md`** (row after `packages/watch`: `` `packages/unit` | The measuring unit: packet protocol, Bluetooth transports, controller, measured hours``), run Prettier on it, and commit:

```bash
git add -A packages/unit apps/web package.json package-lock.json README.md
git commit -m "Unit: move the measuring unit into its own package

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Packet carries the purifier flag and tag short id

**Files:** Modify `packages/unit/src/unitProtocol.ts`, `packages/unit/src/unitProtocol.test.ts`.

**Interfaces:** Produces `FLAG_ON_PURIFIER = 0b1000`, `PACKET_BYTES = 20`, `LEGACY_PACKET_BYTES = 18`; `UnitReading` gains `context: 'free' | 'purifier'` and `purifierTag?: number`; `parsePacket` accepts 18 or 20+ bytes; `encodePacket` writes 20 bytes.

- [ ] **Step 1: Write the failing tests** (append to `unitProtocol.test.ts`; use its existing `base` reading helper or the object below)

```ts
const BASE = { pm1: 20, pm25: 30, pm4: 33, pm10: 36, uptimeS: 100, warming: false } as const;

describe('the purifier tag in the packet', () => {
  it('writes twenty bytes and reads the context back', () => {
    const bytes = encodePacket({ ...BASE, context: 'purifier', purifierTag: 0xbeef });
    expect(bytes).toHaveLength(20);
    const got = parsePacket(bytes);
    expect(isReading(got) && got.context).toBe('purifier');
    expect(isReading(got) && got.purifierTag).toBe(0xbeef);
  });

  it('reads a reading with no tag as free', () => {
    const got = parsePacket(encodePacket({ ...BASE, context: 'free' }));
    expect(isReading(got) && got.context).toBe('free');
    expect(isReading(got) && got.purifierTag).toBeUndefined();
  });

  it('still reads the 18-byte packet of an older unit, as free', () => {
    const bytes = encodePacket({ ...BASE, context: 'free' }).slice(0, 18);
    const got = parsePacket(bytes);
    expect(isReading(got) && got.context).toBe('free');
  });

  it('refuses the purifier flag with no tag id, rather than call it a purifier reading', () => {
    const bytes = encodePacket({ ...BASE, context: 'purifier', purifierTag: 0xbeef });
    bytes[18] = 0;
    bytes[19] = 0;
    expect(parsePacket(bytes)).toBe('out_of_range');
  });
});
```

Make sure the file imports `describe, expect, it` from vitest and `encodePacket, isReading, parsePacket` from `./unitProtocol`.

- [ ] **Step 2: Run, see them fail.** `npx vitest run packages/unit/src/unitProtocol.test.ts` → FAIL (`context` does not exist).

- [ ] **Step 3: Implement.** In `unitProtocol.ts`:
  - Replace `export const PACKET_BYTES = 18;` with `export const LEGACY_PACKET_BYTES = 18;` and `export const PACKET_BYTES = 20;`, and update its comment: "A packet is 20 bytes, little-endian, which still fits one default Bluetooth packet. An older unit sends 18."
  - Add after `FLAG_WARMING`: `/** Set while the unit reads the tag on the purifier: the air it measures is the purifier's output. */ export const FLAG_ON_PURIFIER = 0b1000;`
  - Add to `UnitReading`: `readonly context: 'free' | 'purifier';` and `readonly purifierTag?: number;` (documented: "The short id of the tag on the purifier, present only when context is 'purifier'").
  - Add to the layout comment: `* 18 u16 short id of the tag on the purifier, 0 when none`.
  - In `parsePacket`: change the length check to `if (bytes.length < LEGACY_PACKET_BYTES) return 'too_short';` and, after computing flags, add:

```ts
const onPurifier = (flags & FLAG_ON_PURIFIER) !== 0;
const tag = bytes.length >= PACKET_BYTES ? view.getUint16(18, true) : 0;
if (onPurifier && tag === 0) return 'out_of_range';
```

and include in the returned object `context: onPurifier ? 'purifier' : 'free',` and `...(onPurifier ? { purifierTag: tag } : {}),`.

- In `encodePacket`: allocate `PACKET_BYTES`, OR `FLAG_ON_PURIFIER` into the flags when `reading.context === 'purifier'`, and `view.setUint16(18, reading.purifierTag ?? 0, true);`.

- [ ] **Step 4: Fix existing callers and tests.** Any test or code that builds a `UnitReading` literal now needs `context: 'free'`. Find them: `npm run typecheck -w @vayu/unit && npm run typecheck -w @vayu/web` and add `context: 'free'` where it complains (for example `useUnit.test.tsx`, `RoomPage.test.tsx`, `unitProtocol.test.ts`'s existing `base`). Update any existing assertion that expects 18 bytes to 20.

- [ ] **Step 5: Run.** `npx vitest run packages/unit apps/web/src/devices` → all pass. Lint and typecheck as in Task 1 Step 6.

- [ ] **Step 6: Commit** `Unit: packet carries the purifier flag and tag short id`.

---

### Task 3: Keep purified readings apart, and the performance figure

**Files:** Modify `packages/unit/src/unitController.ts`; create `packages/unit/src/performance.ts`, `performance.test.ts`, and add tests to a new `packages/unit/src/unitController.test.ts`; export from `index.ts`.

**Interfaces:** Produces `UnitState.purified?: { reading: UnitReading; atMs: number }` and `UnitState.onPurifier: boolean`; `purifierPerformance(free, purified, nowMs): { cleanerPct: number } | null` and `PERFORMANCE_WINDOW_MS = 600_000`.

- [ ] **Step 1: Write the failing performance tests** (`performance.test.ts`)

```ts
import { describe, expect, it } from 'vitest';
import { PERFORMANCE_WINDOW_MS, purifierPerformance } from './performance';

const NOW = 1_000_000_000;
const at = (pm25: number, agoMs: number): { pm25: number; atMs: number } => ({
  pm25,
  atMs: NOW - agoMs,
});

describe('how much cleaner the purifier makes the air', () => {
  it('gives the percent cleaner than the room', () => {
    expect(purifierPerformance(at(100, 60_000), at(25, 10_000), NOW)).toEqual({ cleanerPct: 75 });
  });
  it('is not sure without both readings', () => {
    expect(purifierPerformance(undefined, at(25, 0), NOW)).toBeNull();
    expect(purifierPerformance(at(100, 0), undefined, NOW)).toBeNull();
  });
  it('is not sure when either reading is older than ten minutes', () => {
    expect(purifierPerformance(at(100, PERFORMANCE_WINDOW_MS + 1), at(25, 0), NOW)).toBeNull();
    expect(purifierPerformance(at(100, 0), at(25, PERFORMANCE_WINDOW_MS + 1), NOW)).toBeNull();
  });
  it('is not sure when the room is already clean, so it never divides by nothing', () => {
    expect(purifierPerformance(at(0, 0), at(0, 0), NOW)).toBeNull();
  });
  it('says 0 and never a negative figure when the output is no cleaner than the room', () => {
    expect(purifierPerformance(at(20, 0), at(30, 0), NOW)).toEqual({ cleanerPct: 0 });
  });
});
```

- [ ] **Step 2: Run, see it fail** (`Cannot find module './performance'`).
- [ ] **Step 3: Implement `performance.ts`**

```ts
/** How recent a room reading and a purifier reading must both be, to be compared. */
export const PERFORMANCE_WINDOW_MS = 10 * 60_000;

export interface Sample {
  readonly pm25: number;
  readonly atMs: number;
}

/**
 * How much cleaner the air at the purifier's output is than the room, in per cent, from the unit's latest reading off
 * the purifier and its latest reading on it. Null (not enough to say) unless both are fresh and the room has particles
 * to remove; never a negative figure.
 */
export function purifierPerformance(
  free: Sample | undefined,
  purified: Sample | undefined,
  nowMs: number,
): { readonly cleanerPct: number } | null {
  if (free === undefined || purified === undefined) return null;
  if (nowMs - free.atMs > PERFORMANCE_WINDOW_MS || nowMs - purified.atMs > PERFORMANCE_WINDOW_MS)
    return null;
  if (free.pm25 <= 0) return null;
  const pct = Math.round(((free.pm25 - purified.pm25) / free.pm25) * 100);
  return { cleanerPct: Math.max(0, pct) };
}
```

Export it from `index.ts`. Run the tests: PASS.

- [ ] **Step 4: Write the failing controller tests** (`unitController.test.ts`, jsdom for `Storage`)

```ts
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { UnitHandlers, UnitTransport } from './ble';
import { measuredHourly } from './measured';
import { UnitController } from './unitController';
import { encodePacket, type UnitReading } from './unitProtocol';

const AT = Date.parse('2026-10-10T06:00:00.000Z');
const free: UnitReading = {
  pm1: 20,
  pm25: 80,
  pm4: 85,
  pm10: 90,
  uptimeS: 100,
  warming: false,
  context: 'free',
};
const purified: UnitReading = {
  ...free,
  pm1: 4,
  pm25: 10,
  pm4: 11,
  pm10: 12,
  context: 'purifier',
  purifierTag: 0xbeef,
};

function setup(): { send: (r: UnitReading) => void; controller: UnitController; storage: Storage } {
  let handlers: UnitHandlers | undefined;
  const transport: UnitTransport = {
    supported: () => true,
    connect(h) {
      handlers = h;
      return Promise.resolve({ name: 'Vayu-3F2A', disconnect: () => undefined });
    },
  };
  window.localStorage.clear();
  const storage = window.localStorage;
  const controller = new UnitController({ storage: () => storage, now: () => AT });
  return { send: (r) => handlers?.onPacket(encodePacket(r)), controller, storage };
}

describe('readings taken on the purifier', () => {
  it('are kept apart: not the room reading, not the room chart, not the measured hours', async () => {
    const { send, controller, storage } = setup();
    await controller
      .connect(
        {
          supported: () => true,
          connect: (h) => {
            /* replaced below */ return Promise.reject(new Error('unused'));
          },
        },
        () => 'unit-1',
      )
      .catch(() => undefined);
  });
});
```

Replace the body above with a working version: build `setup()` so it returns the `transport`, then `await controller.connect(transport, () => 'unit-1')`. Then assert, after `send(free)` ×60 and `send(purified)` ×60 (every packet calls `now()` returning the same `AT`, which lands in one hour):

- `controller.getSnapshot().latest?.reading.context` is `'free'` and `latest.reading.pm25` is `80`;
- `controller.getSnapshot().recent.every((r) => r.pm25 === 80)` is true;
- `controller.getSnapshot().purified?.reading.pm25` is `10` and `.purified?.reading.purifierTag` is `0xbeef`;
- `controller.getSnapshot().onPurifier` is `true`;
- `measuredHourly(storage, 'unit-1', '2026-10-10')[11]` is `80` (06:00 UTC is 11:30 in India; 60 free readings reach the minimum, and none of the purified ones are in the mean);
- then `send(free)` once more and `controller.getSnapshot().onPurifier` is `false` (lifted off).
  Write each assertion as its own `it`, sharing `setup()`.

- [ ] **Step 5: Run, see them fail.** Then implement in `unitController.ts`:
  - `UnitState` gains `readonly purified?: { readonly reading: UnitReading; readonly atMs: number };` and `readonly onPurifier: boolean;`. Initial and reset states get `onPurifier: false`; every `this.set({...})` that builds a fresh state (connect start, failure) includes `onPurifier: false`.
  - In `onPacket`, after `const atMs = now();` add a branch before the existing recording:

```ts
if (parsed.context === 'purifier') {
  this.set({
    ...this.state,
    status: 'connected',
    onPurifier: true,
    purified: { reading: parsed, atMs },
  });
  return;
}
```

- In the existing `this.set({... latest ...})` for free readings add `onPurifier: false,` and keep `purified` from `s` (`...(s.purified === undefined ? {} : { purified: s.purified })`).
- [ ] **Step 6: Run** `npx vitest run packages/unit apps/web/src/devices` (the `useUnit` and `RoomPage` tests must still pass), typecheck, lint.
- [ ] **Step 7: Commit** `Unit: keep purified readings apart and compute the purifier's performance`.

---

### Task 4: Naming a purifier, and showing it in the room screen

**Files:** Create `packages/unit/src/purifierLinks.ts` and `purifierLinks.test.ts`; modify `apps/web/src/devices/ui/RoomScreen.tsx`.

**Interfaces:** Produces `purifierName(storage, tag): string | undefined`, `linkPurifier(storage, tag, name): void`, `PURIFIER_LINKS_KEY = 'vayu.purifiers.v1'`.

- [ ] **Step 1: Write the failing test**

```ts
// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { linkPurifier, purifierName } from './purifierLinks';

beforeEach(() => {
  window.localStorage.clear();
});

describe('naming the purifier a tag belongs to', () => {
  it('knows nothing about a tag until it is named, then remembers the name', () => {
    expect(purifierName(window.localStorage, 0xbeef)).toBeUndefined();
    linkPurifier(window.localStorage, 0xbeef, 'Living room');
    expect(purifierName(window.localStorage, 0xbeef)).toBe('Living room');
    expect(purifierName(window.localStorage, 0x1234)).toBeUndefined();
  });
  it('trims the name and ignores an empty one', () => {
    linkPurifier(window.localStorage, 1, '   ');
    expect(purifierName(window.localStorage, 1)).toBeUndefined();
    linkPurifier(window.localStorage, 1, '  Bedroom ');
    expect(purifierName(window.localStorage, 1)).toBe('Bedroom');
  });
  it('survives a damaged store', () => {
    window.localStorage.setItem('vayu.purifiers.v1', '{not json');
    expect(purifierName(window.localStorage, 1)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run, see it fail; implement**

```ts
export const PURIFIER_LINKS_KEY = 'vayu.purifiers.v1';

function load(storage: Storage): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(PURIFIER_LINKS_KEY) ?? '{}');
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

/** The name the person gave the purifier whose tag has this short id, if they have. */
export function purifierName(storage: Storage, tag: number): string | undefined {
  const name = load(storage)[String(tag)];
  return typeof name === 'string' && name !== '' ? name : undefined;
}

/** Remembers which purifier a tag belongs to. An empty name is ignored. */
export function linkPurifier(storage: Storage, tag: number, name: string): void {
  const trimmed = name.trim();
  if (trimmed === '') return;
  try {
    storage.setItem(
      PURIFIER_LINKS_KEY,
      JSON.stringify({ ...load(storage), [String(tag)]: trimmed }),
    );
  } catch {
    // Best effort: asked again next time.
  }
}
```

Export from `index.ts`. Tests pass.

- [ ] **Step 3: Read `apps/web/src/devices/ui/RoomScreen.tsx`** (360 lines) and find where the live reading headline is rendered. Add, using `useUnitState()` for `purified` / `onPurifier` and the existing `reading`/`recent` for the room side:
  - When `unit.onPurifier` is true: a short block labelled **"Purified air"** that shows the purified PM2.5 (`unit.purified.reading.pm25`) and the purifier's name; the main room figures stay as they were (they come from the last free reading and age as usual).
  - When `purifierPerformance({pm25, atMs} of the latest free reading, {pm25, atMs} of unit.purified, Date.now())` is not null: one line "The purifier makes the air N% cleaner than the room." Otherwise, while on the purifier: "Not enough to compare yet. Take the unit off the purifier for a few minutes, then put it back." (never a number).
  - When the tag has no name (`purifierName(...)` undefined): a small form, label "Which purifier is this?", one text input and a Save button, calling `linkPurifier(window.localStorage, tag, value)` and then re-rendering (use local `useState` for the saved name). Use the existing form and button classes in the file; follow its accessibility pattern (a `<label htmlFor>`).
- [ ] **Step 4: Write a component test** in `apps/web/src/devices/ui/RoomPage.test.tsx` style (reuse its `fake` transport and `sharedUnit`): after sending a free packet and then a purified packet, the screen shows "Purified air"; with no name, shows "Which purifier is this?"; after saving "Living room", the form is gone and the name appears; with both readings close in time, shows "cleaner than the room"; with only a purified reading shows the "Not enough to compare" sentence. Run; make them pass.
- [ ] **Step 5: Run** the device and exposure tests, typecheck, lint, website bundle check as in Task 1.
- [ ] **Step 6: Commit** `App: show purified air, the purifier's performance and a way to name it`.

---

### Task 5: Firmware reader interface and packet writer

**Files:** Modify `firmware/vayu-unit/vayu-unit.ino`; add `firmware/vayu-unit/TagReader.h`.

- [ ] **Step 1: Read `vayu-unit.ino`** around where the packet is built (search for `PACKET`, `flags`, `uptime`) and the main loop.
- [ ] **Step 2: Create `TagReader.h`**

```cpp
// The tag on the purifier. A reader module gives this sketch the tag's ID; which module is not decided yet, so this is
// an interface with a stub that sees no tag. Replace readTag() with the driver for the chosen module (PN532, RC522, ...).
#pragma once
#include <stdint.h>

// Fills `id` with the tag's unique ID and returns its length in bytes, or 0 when no tag is in range.
inline uint8_t readTag(uint8_t* id, uint8_t maxLen) {
  (void)id;
  (void)maxLen;
  return 0;  // STUB: no reader fitted
}

// A short id for the packet: a 16-bit checksum of the tag's ID, never 0 (0 means "no tag").
inline uint16_t tagShortId(const uint8_t* id, uint8_t len) {
  uint16_t h = 0x811c;
  for (uint8_t i = 0; i < len; i++) h = (uint16_t)((h ^ id[i]) * 0x0101u);
  return h == 0 ? 1 : h;
}
```

- [ ] **Step 3: Use it in the sketch.** `#include "TagReader.h"`. Add `static const unsigned long TAG_POLL_MS = 1000; static const unsigned long TAG_HOLD_MS = 3000; static uint16_t lastTag = 0; static unsigned long lastTagSeenMs = 0; static unsigned long lastTagPollMs = 0;`. In the main loop, once a second: `uint8_t id[10]; uint8_t n = readTag(id, sizeof id); if (n > 0) { lastTag = tagShortId(id, n); lastTagSeenMs = millis(); }`. When building the packet: `bool onPurifier = lastTag != 0 && (millis() - lastTagSeenMs) < TAG_HOLD_MS;` set bit `0b1000` in the flags byte when `onPurifier`, grow the packet buffer from 18 to 20 bytes, and write `onPurifier ? lastTag : 0` little-endian at bytes 18 and 19. Keep the notify length equal to the new size.
- [ ] **Step 4: Check.** No Arduino toolchain here, so re-read the diff for types, the packet size constant everywhere it is used, and that behaviour without a reader is unchanged (flag clear, bytes 18-19 zero). Say in the commit message that it is not compiled.
- [ ] **Step 5: Commit** `Firmware: tag reader interface and the purifier flag in the packet (not compiled)`.

---

### Task 6: Documentation

**Files:** Modify `docs/UNIT.md`, `docs/MOBILE.md` (one line), `docs/architecture.md` repo map row.

- [ ] **Step 1:** In `docs/UNIT.md` change the packet description to 20 bytes and add the two new fields and the flag, with the rule that an 18-byte packet from an older unit reads as free. Add a short section "Telling when the unit is on the purifier": what the tag does, the 3-second hold, that room or outdoor is set in the app, that the reader module is not chosen and the firmware reader is a stub, and that none of this has been tried on hardware.
- [ ] **Step 2:** In `README.md`'s "What is built" table, add a row: `Purifier tag (unit knows it is on the purifier) | Built in the code and tested against fake packets; no reader module chosen or fitted, not tried on hardware`.
- [ ] **Step 3:** Prettier on the touched docs; commit `Docs: the purifier tag and the unit package`.

---

### Task 7: Android build on GitHub

**Files:** Create `.github/workflows/android-debug.yml`.

- [ ] **Step 1:** Look at `.github/workflows/ci.yml` for the Node version and style. Create a workflow that runs on `workflow_dispatch` only (so it never runs by itself and spends nothing unless started), with `actions/checkout`, `actions/setup-node` (Node 22, npm cache), `actions/setup-java` (temurin 21), `npm ci`, `npm run mobile:sync`, then `cd apps/mobile/android && ./gradlew assembleDebug`, then `actions/upload-artifact` of `apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk`. Pin actions to the major versions `ci.yml` already uses.
- [ ] **Step 2:** Add one line to `docs/MOBILE.md` under Android: "Or run the _Android debug build_ workflow in the repository's Actions tab and download the APK."
- [ ] **Step 3:** Commit `CI: build the Android debug APK on request`. Do not run it; starting it is the user's choice.

---

### Task 8: Final verification

- [ ] Run lint (`npm run lint`), typecheck (`npm run typecheck`), the whole suite (`NODE_OPTIONS=--no-experimental-webstorage npx vitest run`), `cd infra && npx cdk synth --quiet`, the website build and `node scripts/check-bundle.mjs`, and the native-code search of `apps/web/dist/assets`.
- [ ] Expected: everything passes except the one failure that also fails on `main` (`assistant.test.tsx`, fire text); report it as such.
- [ ] Run `git diff --stat main..HEAD -- infra scripts` and confirm it is empty for this branch.
