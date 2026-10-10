import { seededRandom } from '@vayu/core';
import type { RawHour } from '@vayu/contracts';
import type { Station } from './station';

/**
 * Sample stations near the four demo places (`DEMO_PLACES` in `@vayu/contracts`), plus one
 * deliberately closer station with no PM2.5 sensor so `nearestStation` has something real to
 * skip. Coordinates are illustrative, not a claim about real CPCB/DPCC station siting.
 */
export const FIXTURE_STATIONS: readonly Station[] = [
  { id: 'fx-home-near', name: 'Sample station near Home', lat: 28.59, lng: 77.05, hasPm25: true },
  {
    id: 'fx-home-no-sensor',
    name: 'Sample station near Home (no PM2.5)',
    lat: 28.591,
    lng: 77.047,
    hasPm25: false,
  },
  {
    id: 'fx-school-near',
    name: 'Sample station near School',
    lat: 28.565,
    lng: 77.18,
    hasPm25: true,
  },
  {
    id: 'fx-office-near',
    name: 'Sample station near Office',
    lat: 28.635,
    lng: 77.21,
    hasPm25: true,
  },
  { id: 'fx-park-near', name: 'Sample station near Park', lat: 28.59, lng: 77.225, hasPm25: true },
];

const HOUR_MS = 60 * 60 * 1000;

/** A deterministic, repeatable pm25/pm10 series for a station, with no network and no clock. */
export function syntheticHourlySeries(stationId: string, asOf: string, hoursBack = 72): RawHour[] {
  const seed = Array.from(stationId).reduce((sum, ch) => sum + (ch.codePointAt(0) ?? 0), 0);
  const random = seededRandom(seed);
  const endMs = Math.floor(new Date(asOf).getTime() / HOUR_MS) * HOUR_MS;
  const baseline = 40 + (seed % 60);

  return Array.from({ length: hoursBack }, (_, indexFromStart) => {
    const index = hoursBack - 1 - indexFromStart;
    const hourStart = new Date(endMs - (index + 1) * HOUR_MS).toISOString();
    const wobble = Math.sin(index / 6) * 20 + (random() - 0.5) * 10;
    const pm25 = Math.max(5, Math.round(baseline + wobble));
    return { hourStart, pm25, pm10: Math.round(pm25 * 1.6) };
  });
}
