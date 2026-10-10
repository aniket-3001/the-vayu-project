import { RawHour, type Place } from '@vayu/contracts';
import synthetic from '@vayu/contracts/fixtures/synthetic-hourly.json';
import { z } from 'zod';
import type { DataSource, Located, PlaceObservations } from './DataSource';
import { DEMO_PLACES, SAMPLE_SCALE } from './places';

const Fixture = z.object({ hours: z.array(RawHour) });
const SAMPLE_HOURS = Fixture.parse(synthetic).hours;

/** 06:00 India time on 12 December 2025, in the sample series. */
export const FIXTURE_AS_OF = '2025-12-12T00:30:00.000Z';

/** A data source built from the synthetic fixture. Always labelled as sample data. */
export function fixtureDataSource(
  asOf: string = FIXTURE_AS_OF,
  /** Multiplies every reading. The sample day is very polluted; tests use a smaller number to get a clean hour. */
  airScale = 1,
): DataSource {
  return {
    load(placeId: string, where?: Located): Promise<PlaceObservations> {
      const place: Place | undefined =
        where === undefined
          ? DEMO_PLACES.find((candidate) => candidate.id === placeId)
          : {
              id: 'gps',
              kind: 'other',
              lat: where.lat,
              lng: where.lng,
              name: where.name ?? 'Your location',
            };
      if (place === undefined) return Promise.reject(new RangeError(`Unknown place: ${placeId}`));
      // A pinned place arrives as coordinates; the sample places are matched by position.
      const sample =
        where === undefined
          ? placeId
          : DEMO_PLACES.find(
              (candidate) =>
                Math.abs(candidate.lat - where.lat) < 0.01 &&
                Math.abs(candidate.lng - where.lng) < 0.01,
            )?.id;
      const scale = (SAMPLE_SCALE[sample ?? ''] ?? 1) * airScale;
      return Promise.resolve({
        place,
        asOf,
        mode: 'replay',
        simulated: true,
        station: {
          id: `sample-${placeId}`,
          name: `Sample station near ${place.name}`,
          distanceKm: 3,
        },
        observed: SAMPLE_HOURS.map((hour) => ({
          hourStart: hour.hourStart,
          pm25: hour.pm25 === null ? null : hour.pm25 * scale,
          pm10: hour.pm10 === null ? null : hour.pm10 * scale,
        })),
      });
    },
  };
}
