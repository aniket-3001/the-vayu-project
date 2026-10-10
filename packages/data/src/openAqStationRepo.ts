import { RawHour } from '@vayu/contracts';
import type { StationRepo } from './repos';
import type { Point, Station } from './station';

/**
 * OpenAQ v3 client (build spec §7.1). Used only by the harvest, never per user request — OpenAQ
 * allows 60 requests a minute, 2,000 an hour, and this is the "full" tier: the razor fixture
 * version (`fixtureStationRepo`) is what every other block actually depends on.
 *
 * Shapes verified against https://docs.openaq.org (operations
 * `list_locations_v3_locations_get`'s geospatial query and
 * `sensor_hourly_measurements_get_v3_sensors__sensors_id__hours_get`) on 5 Oct 2026. [V] re-check
 * before relying on this against a real key — these endpoints were documented, not exercised live.
 */
export interface OpenAqClientOptions {
  readonly apiKey: string;
  readonly baseUrl?: string;
  /** Search radius in metres; OpenAQ's maximum is 25,000. Default is the maximum, because many
   * nearby monitors are stale and we filter on freshness afterwards. */
  readonly radiusMeters?: number;
  readonly fetchImpl?: typeof fetch;
}

interface OpenAqSensor {
  readonly id: number;
  readonly parameter: { readonly name: string };
}
interface OpenAqLocation {
  readonly id: number;
  readonly name: string;
  readonly coordinates: { readonly latitude: number; readonly longitude: number };
  readonly sensors: readonly OpenAqSensor[];
}
interface OpenAqLocationsResponse {
  readonly results: readonly OpenAqLocation[];
}

interface OpenAqHourResult {
  readonly value: number | null;
  readonly parameter: { readonly name: string };
  readonly period: { readonly datetimeFrom: { readonly utc: string } };
}
interface OpenAqHoursResponse {
  readonly results: readonly OpenAqHourResult[];
}

const isPm25 = (parameterName: string): boolean =>
  parameterName.toLowerCase().replaceAll(/[^a-z0-9]/g, '') === 'pm25';

// A location id alone cannot be used for /hours (that endpoint is per-sensor), so the station id
// we hand back encodes the PM2.5 sensor id directly — opaque to callers, meaningful only here.
const SENSOR_PREFIX = 'openaq-sensor-';

async function getJson<T>(
  doFetch: typeof fetch,
  url: string,
  apiKey: string,
  what: string,
): Promise<T> {
  const res = await doFetch(url, { headers: { 'X-API-Key': apiKey } });
  if (!res.ok) throw new Error(`OpenAQ ${what} request failed: ${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}

export function openAqStationRepo(options: OpenAqClientOptions): StationRepo {
  const baseUrl = options.baseUrl ?? 'https://api.openaq.org/v3';
  const doFetch = options.fetchImpl ?? fetch;

  return {
    async stationsNear(point: Point): Promise<readonly Station[]> {
      const url = `${baseUrl}/locations?coordinates=${point.lat},${point.lng}&radius=${options.radiusMeters ?? 25_000}&limit=200`;
      const body = await getJson<OpenAqLocationsResponse>(
        doFetch,
        url,
        options.apiKey,
        'locations',
      );
      return body.results.map((location) => {
        const pm25 = location.sensors.find((sensor) => isPm25(sensor.parameter.name));
        return {
          id: pm25 === undefined ? `openaq-location-${location.id}` : `${SENSOR_PREFIX}${pm25.id}`,
          name: location.name,
          lat: location.coordinates.latitude,
          lng: location.coordinates.longitude,
          hasPm25: pm25 !== undefined,
        };
      });
    },

    async hourlyFor(stationId: string, asOf: string): Promise<readonly RawHour[]> {
      if (!stationId.startsWith(SENSOR_PREFIX)) return [];
      const sensorId = stationId.slice(SENSOR_PREFIX.length);
      // /hours is oldest-first, so a bare `datetime_to` + limit returns the OLDEST 168 hours
      // (found against the live API, 6 Oct 2026). Bound the window from below to get the latest week.
      const from = new Date(new Date(asOf).getTime() - 7 * 24 * 3_600_000).toISOString();
      const url =
        `${baseUrl}/sensors/${sensorId}/hours?datetime_from=${encodeURIComponent(from)}` +
        `&datetime_to=${encodeURIComponent(asOf)}&limit=168`;
      const body = await getJson<OpenAqHoursResponse>(doFetch, url, options.apiKey, 'hours');
      return body.results
        .filter((item) => isPm25(item.parameter.name))
        .map((item) =>
          RawHour.parse({
            hourStart: item.period.datetimeFrom.utc,
            pm25: item.value,
            // The /hours endpoint is per-sensor; PM10 would need a second sensor + call.
            // Not needed for the razor — PM2.5 alone drives the CPCB band (build spec §6.1).
            pm10: null,
          }),
        );
    },
  };
}
