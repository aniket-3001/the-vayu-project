# The measuring unit as its own package, with a purifier tag

Status: draft for review, 13 October 2026.

## Goal

1. The measuring unit's code lives in its own package, `packages/unit` (`@vayu/unit`), so the unit is an independent device that any app can use.
2. The unit can tell when it is sitting on the purifier, by reading an NFC or RFID tag fixed to the purifier, and says so in every reading. The app then treats those readings as the purifier's output, not as the room.

## Decisions already made

- **Separate package.** The unit's protocol, Bluetooth transports, controller and measured-hours logic move out of `apps/web` into `packages/unit`. The package imports nothing from the React app.
- **The reader is on the unit.** The unit must know where it sits, so the tag reader is part of the unit's hardware and firmware.
- **Room or outdoor is set by the person in the app.** The unit reports only "on the purifier" or "free". The app already knows which place the unit is assigned to and whether it is indoors or outdoors. The unit never guesses.
- **Reader module not chosen yet.** The firmware gets a reader interface and a marked stub; a PN532 or RC522 driver is added later without touching the packet code.

## Design

### 1. The package `packages/unit`

Moves in, with their tests: `unitProtocol.ts`, `ble.ts` (browser Bluetooth and the `UnitTransport` types), `nativeBle.ts`, `unitController.ts`, `measured.ts`.

- Exports: the protocol (`parsePacket`, `encodePacket`, constants), `UnitTransport`, `UnitLink`, `UnitHandlers`, `webBluetooth`, `createNativeBle`, `nativeBle`, `UnitController`, and the measured-hours functions.
- The package has no React and no DOM beyond `navigator.bluetooth`. Capacitor's Bluetooth plugin is loaded lazily, as today, so the website bundle still holds no native code.
- `apps/web` keeps the screens, `useUnit`, room advice and exposure, and imports the rest from `@vayu/unit`. Choosing the transport by `VITE_NATIVE` stays in `apps/web/src/devices/transport.ts`, because it is a build decision.
- The move changes no behaviour; the existing tests move with the code and must pass unchanged.
- The workspace is added to the root `package.json` and the repo map in `README.md`.

### 2. Protocol (version stays 1)

The packet is 18 bytes today inside Bluetooth's default 20-byte limit; `parsePacket` accepts any packet of at least 18 bytes, so an older app ignores extra bytes.

- New flag: `FLAG_ON_PURIFIER = 0b1000`, set while the tag is in range.
- New field: bytes 18 and 19, a little-endian 16-bit short id (a checksum of the tag's full ID). Zero when no tag is present. The packet is then 20 bytes.
- `UnitReading` gains `context: 'free' | 'purifier'` and an optional `purifierTag: number`.
- Parsing rules: a packet shorter than 20 bytes parses as `free` (an old unit); the flag set with a zero short id is refused as `out_of_range`-style fault rather than shown as a purifier reading.

### 3. Firmware (`firmware/vayu-unit`)

- A small `TagReader` interface: `readTag()` returns a tag ID or none.
- The reader is polled once a second. The tag counts as present for 3 seconds after its last read, so a brief missed read does not flip the context.
- `readTag()` is a clearly marked stub that returns none until a module is chosen; a driver for the chosen module replaces it. Without it the unit behaves exactly as today.
- The packet writer sets the flag and the short id from the reader's last result.
- Cannot be run or tested without hardware. Only the packet layout is tested, in the package.

### 4. What the app does

- Free readings behave exactly as today.
- Purified readings are labelled "Purified air" and kept apart. They never replace or enter the room's reading in Your room or Exposure, since that would make the room look cleaner than it is.
- Purifier performance: when the app has a purified reading and a free reading of the same unit close in time (within 10 minutes), it shows how much cleaner the purifier's output is than the room, as a percentage. With only one of the two it says there is not enough data; it never fills the gap.
- Linking: the first time a short id is seen, the app asks which purifier it is and remembers it with the other saved settings.

### 5. Testing

- Package tests: the existing ones, moved; new tests for the packet with and without the flag and short id, for a 20-byte packet from a new unit and an 18-byte packet from an old one, and for the refused flag-with-no-id case.
- App tests: a purified reading is never counted in the room's hours; the performance figure appears only with both readings close in time; the link prompt appears once per short id.
- `make prove` stays green; the website bundle check still shows no native code.

## Known risks

- The tag path is untested on hardware until a reader is chosen and fitted.
- A tag read can fail or the unit can be lifted off briefly; the 3-second hold covers short gaps only.
- Moving files changes many import paths in `apps/web`; this is done as its own step before any new behaviour.

## Out of scope

Choosing or wiring a reader module, outdoor tags, any guess of indoor or outdoor by the unit, sending unit readings to AWS.

## Relationship to the mobile apps

The mobile spec and plan refer to `apps/web/src/devices/nativeBle.ts`. After the move that file lives in `packages/unit`, and the transport choice in `apps/web/src/devices/transport.ts` imports it from `@vayu/unit`. The mobile plan's remaining tasks (documentation, the CloudFront CORS branch) are unaffected.
