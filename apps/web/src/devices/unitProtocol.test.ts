import { describe, expect, it } from 'vitest';
import {
  encodePacket,
  isReading,
  PACKET_BYTES,
  parsePacket,
  UNIT_NAME_PREFIX,
  type UnitReading,
} from './unitProtocol';

const reading: UnitReading = {
  pm1: 18.4,
  pm25: 24.6,
  pm4: 27.1,
  pm10: 30.2,
  temperatureC: 28.45,
  humidityPct: 52.3,
  uptimeS: 98_765,
  warming: false,
};

describe('a unit’s Bluetooth packet', () => {
  it('is 18 bytes, which fits in one default Bluetooth packet', () => {
    expect(encodePacket(reading)).toHaveLength(PACKET_BYTES);
    expect(PACKET_BYTES).toBeLessThanOrEqual(20);
  });

  it('is read back as it was sent, to the tenth of a microgram and the hundredth of a degree', () => {
    const got = parsePacket(encodePacket(reading));
    expect(isReading(got)).toBe(true);
    if (isReading(got)) {
      expect(got.pm25).toBeCloseTo(24.6, 5);
      expect(got.pm10).toBeCloseTo(30.2, 5);
      expect(got.temperatureC).toBeCloseTo(28.45, 5);
      expect(got.humidityPct).toBeCloseTo(52.3, 5);
      expect(got.uptimeS).toBe(98_765);
      expect(got.warming).toBe(false);
    }
  });

  it('has no temperature or humidity when the unit has no sensor for them, and is flagged while warming', () => {
    const got = parsePacket(
      encodePacket({
        pm1: reading.pm1,
        pm25: reading.pm25,
        pm4: reading.pm4,
        pm10: reading.pm10,
        uptimeS: reading.uptimeS,
        warming: true,
      }),
    );
    expect(isReading(got)).toBe(true);
    if (isReading(got)) {
      expect(got.temperatureC).toBeUndefined();
      expect(got.warming).toBe(true);
    }
  });

  it('refuses a packet that is short, from another version, without a particle reading, or impossible', () => {
    expect(parsePacket(new Uint8Array(5))).toBe('too_short');
    const wrong = encodePacket(reading);
    wrong[0] = 9;
    expect(parsePacket(wrong)).toBe('wrong_version');
    const none = encodePacket(reading);
    none[1] = 0;
    expect(parsePacket(none)).toBe('no_particle_reading');
    // 2000 µg/m³ is beyond what the sensor is specified for.
    expect(parsePacket(encodePacket({ ...reading, pm25: 2000, pm4: 2000, pm10: 2000 }))).toBe(
      'out_of_range',
    );
    // PM2.5 larger than PM10 cannot be real.
    expect(parsePacket(encodePacket({ ...reading, pm25: 90, pm4: 91, pm10: 40 }))).toBe(
      'out_of_range',
    );
  });

  it('advertises a name every unit shares, so the app can find them', () => {
    expect(UNIT_NAME_PREFIX).toBe('Vayu-');
  });
});
