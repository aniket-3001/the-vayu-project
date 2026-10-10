import { RawHour } from '@vayu/contracts';
import synthetic from '@vayu/contracts/fixtures/synthetic-hourly.json';
import { z } from 'zod';

const Fixture = z.object({ hours: z.array(RawHour) });
const ALL_HOURS = Fixture.parse(synthetic).hours;

export interface ReplayWeek {
  readonly id: string;
  readonly label: string;
  readonly startAt: string;
  readonly endAt: string;
  readonly outdoor: readonly RawHour[];
  /** Present only for a real week: the station its hours came from. Absent means sample data. */
  readonly real?: { readonly stationName: string; readonly distanceKm: number };
}

/**
 * The sample week the simulator falls back to when the API has no real week. It is synthetic, so
 * its label says so; it must never be called a real GRAP stage. Real weeks come from `ReplaySource`.
 */
export const REPLAY_WEEKS: readonly ReplayWeek[] = [
  {
    id: 'sample',
    label: 'Sample week (synthetic data)',
    startAt: ALL_HOURS[0]?.hourStart ?? '2025-12-05T00:00:00.000Z',
    endAt: ALL_HOURS.at(-1)?.hourStart ?? '2025-12-18T23:00:00.000Z',
    outdoor: ALL_HOURS,
  },
];
