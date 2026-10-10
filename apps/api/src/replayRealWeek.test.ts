import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ReplayManifest, ReplayPlaceSeries, Timeline } from '@vayu/contracts';
import { fixedClock } from '@vayu/core';
import {
  fixtureFireRepo,
  fixtureForecastRepo,
  fixtureStationRepo,
  memoryReplayRepo,
  type ReplayWeek,
} from '@vayu/data';
import { fixtureLinkStore } from '@vayu/watch';
import { describe, expect, it } from 'vitest';
import { createRouter } from './routes';

// The prepared week W1 (a real December 2025 week from the OpenAQ archive), as committed.
const dir = fileURLToPath(
  new URL('../../../packages/data/replay-data/replay/W1/', import.meta.url),
);
const read = (name: string): unknown => JSON.parse(readFileSync(`${dir}${name}.json`, 'utf8'));
const places = ['home', 'school', 'office', 'park'];
const week: ReplayWeek = {
  manifest: ReplayManifest.parse(read('manifest')),
  series: new Map(places.map((id) => [id, ReplayPlaceSeries.parse(read(id))])),
};
const route = createRouter({
  stationRepo: fixtureStationRepo(),
  forecastRepo: fixtureForecastRepo(),
  fireRepo: fixtureFireRepo(),
  clock: fixedClock('2026-10-08T00:00:00.000Z'),
  mode: 'model',
  linkStore: fixtureLinkStore(),
  telegram: { botToken: 'T', webhookSecret: 'S' },
  replayRepo: memoryReplayRepo([week]),
});

describe('the prepared week W1 (real archive data)', () => {
  it('covers all four demo places with a station within 3 km', () => {
    for (const id of places) {
      expect(week.series.get(id)?.station.distanceKm).toBeLessThan(3);
    }
  });

  it('holds no instrument faults', () => {
    for (const series of week.series.values()) {
      for (const hour of series.hours) expect(hour.pm25 ?? 0).toBeLessThanOrEqual(1000);
    }
  });

  it.each(places)(
    'answers for %s at every six hours of the week, using only hours already ended (rule I1)',
    async (place) => {
      for (let hours = 0; hours <= 7 * 24; hours += 6) {
        const asOf = new Date(Date.parse(week.manifest.start) + hours * 3_600_000).toISOString();
        const response = await route({
          method: 'GET',
          path: '/v1/replay',
          query: { week: 'W1', place, asOf },
          headers: {},
        });
        expect(response.statusCode).toBe(200);
        const timeline = Timeline.parse(response.body);
        for (const hour of timeline.hours.filter((h) => h.kind === 'observed')) {
          expect(Date.parse(hour.hourStart) + 3_600_000).toBeLessThanOrEqual(Date.parse(asOf));
        }
        expect(timeline.mode).toBe('replay');
      }
    },
  );

  it('shows the worst of the week as bad air, not a walk', async () => {
    const response = await route({
      method: 'GET',
      path: '/v1/replay',
      query: { week: 'W1', place: 'school', asOf: '2025-12-12T06:00:00.000Z' },
      headers: {},
    });
    const timeline = Timeline.parse(response.body);
    expect(timeline.hours.some((h) => h.kind === 'observed' && (h.pm25 ?? 0) > 150)).toBe(true);
  });
});
