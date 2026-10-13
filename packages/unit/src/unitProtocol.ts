/**
 * What a Vayu measuring unit says over Bluetooth Low Energy, and how the app reads it. The unit is an ESP32 with a
 * Sensirion SPS30 particle sensor (and, if fitted, a temperature and humidity sensor). It sends one small packet about
 * every two seconds on a notify characteristic. The same layout is in `firmware/vayu-unit/vayu-unit.ino`.
 */

/** The unit's one service, and the characteristic its readings arrive on. */
export const UNIT_SERVICE_UUID = 'b7c5a1f0-6a7e-4c1b-9b6d-5a1d76617975';
export const UNIT_READING_UUID = 'b7c5a1f1-6a7e-4c1b-9b6d-5a1d76617975';
/** The name every unit advertises, followed by the last four digits of its address: "Vayu-3F2A". */
export const UNIT_NAME_PREFIX = 'Vayu-';

/** The packet is this many bytes, little-endian, so it fits in one default Bluetooth packet (20 bytes). */
export const PACKET_BYTES = 20;
/** A unit from before the purifier tag sends 18 bytes, without the tag; it is read as not on a purifier. */
export const LEGACY_PACKET_BYTES = 18;
export const PACKET_VERSION = 1;

/** Bits of the flags byte. */
export const FLAG_PM_VALID = 0b0001;
export const FLAG_CLIMATE_VALID = 0b0010;
/** Set for the first reading after the sensor has started: its fan is still settling, so the number is not trusted. */
export const FLAG_WARMING = 0b0100;
/** Set while the unit reads the tag on the purifier: the air it measures is the purifier's output. */
export const FLAG_ON_PURIFIER = 0b1000;

/** One reading from a unit, in the units people use: PM in µg/m³, temperature in °C, humidity in per cent. */
export interface UnitReading {
  readonly pm1: number;
  readonly pm25: number;
  readonly pm4: number;
  readonly pm10: number;
  /** Absent when the unit has no temperature and humidity sensor, or it did not answer. */
  readonly temperatureC?: number;
  readonly humidityPct?: number;
  /** Seconds since the unit started. */
  readonly uptimeS: number;
  /** True while the sensor's fan is still settling after start: shown, but not counted. */
  readonly warming: boolean;
  /** Where the unit is: on the purifier (it read the purifier's tag) or free, in a room or outdoors. */
  readonly context: 'free' | 'purifier';
  /** The short id of the tag on the purifier. Present only when `context` is 'purifier'. */
  readonly purifierTag?: number;
}

/** Why a packet was not a reading. */
export type PacketProblem = 'too_short' | 'wrong_version' | 'no_particle_reading' | 'out_of_range';

/** The largest PM2.5 the SPS30 is specified for, in µg/m³; anything above is a fault, not air. */
const MAX_PM = 1000;

/**
 * Reads one packet. Layout (little-endian):
 *   0  u8   version (1)
 *   1  u8   flags: bit 0 particles valid, bit 1 climate valid, bit 2 warming, bit 3 on the purifier
 *   2  u16  PM1.0  in tenths of µg/m³
 *   4  u16  PM2.5  in tenths of µg/m³
 *   6  u16  PM4.0  in tenths of µg/m³
 *   8  u16  PM10   in tenths of µg/m³
 *  10  i16  temperature in hundredths of °C
 *  12  u16  relative humidity in hundredths of a per cent
 *  14  u32  uptime in seconds
 *  18  u16  short id of the tag on the purifier, 0 when none (absent from an older unit's 18-byte packet)
 * A packet that is short, from another version, flagged as having no particle reading, with a value no real
 * sensor gives, or flagged as on the purifier without a tag id is refused, so a fault is never shown as air.
 */
export function parsePacket(bytes: Uint8Array): UnitReading | PacketProblem {
  if (bytes.length < LEGACY_PACKET_BYTES) return 'too_short';
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint8(0) !== PACKET_VERSION) return 'wrong_version';
  const flags = view.getUint8(1);
  if ((flags & FLAG_PM_VALID) === 0) return 'no_particle_reading';
  const tenth = (offset: number): number => view.getUint16(offset, true) / 10;
  const pm1 = tenth(2);
  const pm25 = tenth(4);
  const pm4 = tenth(6);
  const pm10 = tenth(8);
  if ([pm1, pm25, pm4, pm10].some((v) => v > MAX_PM)) return 'out_of_range';
  // The sizes are nested: PM1 is part of PM2.5, which is part of PM4, which is part of PM10. A reading that breaks
  // that by a wide margin is a fault in the sensor or the link.
  if (pm1 > pm25 + 1 || pm25 > pm4 + 1 || pm4 > pm10 + 1) return 'out_of_range';
  const onPurifier = (flags & FLAG_ON_PURIFIER) !== 0;
  const tag = bytes.length >= PACKET_BYTES ? view.getUint16(18, true) : 0;
  if (onPurifier && tag === 0) return 'out_of_range';
  const climate = (flags & FLAG_CLIMATE_VALID) !== 0;
  return {
    pm1,
    pm25,
    pm4,
    pm10,
    ...(climate
      ? {
          temperatureC: view.getInt16(10, true) / 100,
          humidityPct: view.getUint16(12, true) / 100,
        }
      : {}),
    uptimeS: view.getUint32(14, true),
    warming: (flags & FLAG_WARMING) !== 0,
    context: onPurifier ? 'purifier' : 'free',
    ...(onPurifier ? { purifierTag: tag } : {}),
  };
}

/** Makes a packet, for tests. */
export function encodePacket(reading: UnitReading): Uint8Array {
  const bytes = new Uint8Array(PACKET_BYTES);
  const view = new DataView(bytes.buffer);
  const climate = reading.temperatureC !== undefined && reading.humidityPct !== undefined;
  view.setUint8(0, PACKET_VERSION);
  view.setUint8(
    1,
    FLAG_PM_VALID |
      (climate ? FLAG_CLIMATE_VALID : 0) |
      (reading.warming ? FLAG_WARMING : 0) |
      (reading.context === 'purifier' ? FLAG_ON_PURIFIER : 0),
  );
  view.setUint16(2, Math.round(reading.pm1 * 10), true);
  view.setUint16(4, Math.round(reading.pm25 * 10), true);
  view.setUint16(6, Math.round(reading.pm4 * 10), true);
  view.setUint16(8, Math.round(reading.pm10 * 10), true);
  if (climate) {
    view.setInt16(10, Math.round((reading.temperatureC ?? 0) * 100), true);
    view.setUint16(12, Math.round((reading.humidityPct ?? 0) * 100), true);
  }
  view.setUint32(14, reading.uptimeS, true);
  view.setUint16(18, reading.purifierTag ?? 0, true);
  return bytes;
}

export const isReading = (value: UnitReading | PacketProblem): value is UnitReading =>
  typeof value !== 'string';
