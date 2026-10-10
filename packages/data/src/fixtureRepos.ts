import { RawHour } from '@vayu/contracts';
import { FIXTURE_STATIONS, syntheticHourlySeries } from './fixtures';
import type { ForecastRepo, StationRepo } from './repos';
import type { Point } from './station';

const availableByAsOf = (hours: readonly RawHour[], asOf: string): RawHour[] => {
  const limit = new Date(asOf).getTime();
  return hours.filter((hour) => new Date(hour.hourStart).getTime() + 60 * 60 * 1000 <= limit);
};

/** A `StationRepo` that needs no network — the razor requirement for 02.2. */
export function fixtureStationRepo(): StationRepo {
  return {
    // Every demo place is within reach of the whole fixture set; nearestStation() does the
    // actual picking, so this doesn't need the point or asOf.
    stationsNear() {
      return Promise.resolve(FIXTURE_STATIONS);
    },
    hourlyFor(stationId: string, asOf: string) {
      const hours = syntheticHourlySeries(stationId, asOf).map((hour) => RawHour.parse(hour));
      return Promise.resolve(availableByAsOf(hours, asOf));
    },
  };
}

/** A `ForecastRepo` fixture: the same shape a regional forecast would return, just synthetic. */
export function fixtureForecastRepo(): ForecastRepo {
  return {
    forecastFor(point: Point, asOf: string) {
      const key = `forecast-${Math.round(point.lat * 100)}-${Math.round(point.lng * 100)}`;
      const future = syntheticHourlySeries(
        key,
        new Date(new Date(asOf).getTime() + 48 * 60 * 60 * 1000).toISOString(),
      )
        .slice(-48)
        .map((hour) => RawHour.parse(hour));
      return Promise.resolve(future);
    },
  };
}
