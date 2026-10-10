import type { RawHour } from '@vayu/contracts';
import { describe, expect, it } from 'vitest';
import type { ForecastSnapshot, StationSnapshot } from './harvest';
import { fromHarvest } from './fromHarvest';

const NOW = '2026-10-08T10:00:00.000Z';
const minutesAgo = (m: number): string => new Date(Date.parse(NOW) - m * 60_000).toISOString();
const hour = (hourStart: string, pm25: number | null): RawHour => ({ hourStart, pm25, pm10: null });

const station = (over: Partial<StationSnapshot> = {}): StationSnapshot => ({
  schemaVersion: 1,
  harvestedAt: minutesAgo(10),
  placeId: 'school',
  status: 'fresh',
  station: { id: 's1', name: 'Anand Lok', lat: 28.5, lng: 77.2, distanceKm: 4.3 },
  hours: [hour('2026-10-08T07:00:00.000Z', 80), hour('2026-10-08T08:00:00.000Z', 90)],
  ...over,
});
const forecast = (over: Partial<ForecastSnapshot> = {}): ForecastSnapshot => ({
  schemaVersion: 1,
  harvestedAt: minutesAgo(10),
  placeId: 'school',
  status: 'ok',
  hours: [
    hour('2026-10-08T09:00:00.000Z', 1),
    hour('2026-10-08T10:00:00.000Z', 100),
    hour('2026-10-08T11:00:00.000Z', 110),
  ],
  ...over,
});

describe('fromHarvest', () => {
  it('turns a recent harvest into what a live lookup would give, and says when it was fetched', () => {
    const out = fromHarvest(station(), forecast(), NOW);
    expect(out.station?.nearest).toMatchObject({
      station: { id: 's1', name: 'Anand Lok', hasPm25: true },
      distanceKm: 4.3,
    });
    expect(out.station?.observed).toHaveLength(2);
    expect(out.fetchedAt).toBe(minutesAgo(10));
  });

  it('keeps only forecast hours from now on, as the live forecast does', () => {
    expect(fromHarvest(station(), forecast(), NOW).forecast?.map((h) => h.hourStart)).toEqual([
      '2026-10-08T10:00:00.000Z',
      '2026-10-08T11:00:00.000Z',
    ]);
  });

  it('does not use a harvest older than 45 minutes: the schedule may have stopped', () => {
    const old = fromHarvest(
      station({ harvestedAt: minutesAgo(50) }),
      forecast({ harvestedAt: minutesAgo(50) }),
      NOW,
    );
    expect(old.station).toBeUndefined();
    expect(old.forecast).toBeUndefined();
  });

  it('does not use a station whose newest reading is more than six hours old by now', () => {
    const aged = station({ hours: [hour('2026-10-08T01:00:00.000Z', 80)] });
    expect(fromHarvest(aged, forecast(), NOW).station).toBeUndefined();
  });

  it('does not trust a "no fresh station" answer: that may have been a rate limit, so look again live', () => {
    expect(
      fromHarvest(station({ status: 'no_fresh_station', hours: [] }), forecast(), NOW).station,
    ).toBeUndefined();
  });

  it('uses the station and the forecast independently', () => {
    expect(fromHarvest(station(), forecast({ status: 'failed', hours: [] }), NOW)).toMatchObject({
      station: expect.anything() as unknown,
      forecast: undefined,
    });
    expect(fromHarvest(undefined, forecast(), NOW).forecast).toHaveLength(2);
  });

  it('never uses hours that had not ended by now (rule I1), even if a harvest from the future says so', () => {
    const odd = station({
      hours: [hour('2026-10-08T07:00:00.000Z', 80), hour('2026-10-08T09:30:00.000Z', 999)],
    });
    const out = fromHarvest(odd, undefined, NOW);
    expect(out.station?.observed.map((h) => h.pm25)).toEqual([80]);
  });

  it('does not use a harvest dated after now', () => {
    expect(
      fromHarvest(station({ harvestedAt: minutesAgo(-5) }), undefined, NOW).station,
    ).toBeUndefined();
  });
});
