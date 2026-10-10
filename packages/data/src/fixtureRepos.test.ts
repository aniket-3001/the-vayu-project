import { DEMO_PLACES, RawHour } from '@vayu/contracts';
import { describe, expect, it } from 'vitest';
import { fixtureForecastRepo, fixtureStationRepo } from './fixtureRepos';
import { nearestStation } from './station';

const ASOF = '2025-12-12T06:00:00.000Z';

function requireDefined<Value>(value: Value | undefined, message: string): Value {
  if (value === undefined) throw new Error(message);
  return value;
}

describe('fixtureStationRepo (02.2, razor: works for all four demo places, no network)', () => {
  const repo = fixtureStationRepo();

  it.each(DEMO_PLACES)('returns a valid hourly shape for $name', async (place) => {
    const stations = await repo.stationsNear(place, ASOF);
    const nearest = requireDefined(nearestStation(place, stations), 'expected a nearest station');

    const hours = await repo.hourlyFor(nearest.station.id, ASOF);
    expect(hours.length).toBeGreaterThan(0);
    for (const hour of hours) {
      expect(() => RawHour.parse(hour)).not.toThrow();
    }
  });

  it('never returns an hour that ends after asOf (rule I1)', async () => {
    const home = requireDefined(DEMO_PLACES[0], 'expected a first demo place');
    const stations = await repo.stationsNear(home, ASOF);
    const nearest = requireDefined(nearestStation(home, stations), 'expected a nearest station');
    const hours = await repo.hourlyFor(nearest.station.id, ASOF);
    const limitMs = new Date(ASOF).getTime();
    for (const hour of hours) {
      expect(new Date(hour.hourStart).getTime() + 60 * 60 * 1000).toBeLessThanOrEqual(limitMs);
    }
  });

  it('is deterministic: the same station and asOf always return the same series', async () => {
    const a = await repo.hourlyFor('fx-home-near', ASOF);
    const b = await repo.hourlyFor('fx-home-near', ASOF);
    expect(a).toEqual(b);
  });
});

describe('fixtureForecastRepo', () => {
  const repo = fixtureForecastRepo();

  it.each(DEMO_PLACES)('returns a valid forecast shape for $name', async (place) => {
    const hours = await repo.forecastFor(place, ASOF);
    expect(hours.length).toBeGreaterThan(0);
    for (const hour of hours) {
      expect(() => RawHour.parse(hour)).not.toThrow();
    }
  });
});
