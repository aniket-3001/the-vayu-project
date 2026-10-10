import { Timeline, type RawHour } from '@vayu/contracts';
import type { DataSource, Located, PlaceObservations } from './DataSource';

/**
 * Real observations from the deployed API's `/v1/timeline`. The API has already chosen a station
 * with a recent reading (or said it has none), so this only reshapes: observed hours become the
 * raw series the Today model expects, and the provenance says whether it is live or an estimate.
 */
export function apiDataSource(baseUrl: string, fetchImpl: typeof fetch = fetch): DataSource {
  const root = baseUrl.replace(/\/$/, '');
  return {
    async load(placeId: string, where?: Located): Promise<PlaceObservations> {
      const query =
        where === undefined
          ? `place=${encodeURIComponent(placeId)}`
          : `lat=${where.lat.toFixed(4)}&lng=${where.lng.toFixed(4)}`;
      const res = await fetchImpl(`${root}/v1/timeline?${query}`);
      if (!res.ok) throw new Error(`Air data request failed: ${res.status}`);
      const timeline = Timeline.parse(await res.json());

      const observed: RawHour[] = timeline.hours
        .filter((hour) => hour.kind === 'observed')
        .map((hour) => ({ hourStart: hour.hourStart, pm25: hour.pm25, pm10: hour.pm10 }));
      const { stationId, stationName, distanceKm } = timeline.prov;

      return {
        place: where?.name === undefined ? timeline.place : { ...timeline.place, name: where.name },
        asOf: timeline.asOf,
        mode: timeline.mode,
        simulated: timeline.mode !== 'live',
        observed,
        ...(timeline.weather === undefined ? {} : { weather: timeline.weather }),
        ...(stationId === undefined || stationName === undefined || distanceKm === undefined
          ? {}
          : { station: { id: stationId, name: stationName, distanceKm } }),
      };
    },
  };
}
