import {
  DEMO_PLACES,
  Timeline,
  type Mode,
  type Place,
  type RawHour,
  type WeatherNow,
} from '@vayu/contracts';
import { buildHours, daySummaries, findWindow, headline, makeProvenance } from '@vayu/core';
import type { NearestStation } from '@vayu/data';

/**
 * A place made from a caller's own coordinates. Rounded to two decimals (about 1 km), because the
 * nearest monitor never needs a street address and we should not take one. Only north India, where
 * our stations and fire box are, is covered.
 */
export function locationPlace(lat: string | undefined, lng: string | undefined): Place | undefined {
  if (lat === undefined || lng === undefined || lat.trim() === '' || lng.trim() === '') {
    return undefined;
  }
  const la = Number(lat);
  const ln = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return undefined;
  if (la < 20 || la > 35 || ln < 70 || ln > 90) return undefined;
  return {
    id: 'gps',
    name: 'Your location',
    kind: 'other',
    lat: Math.round(la * 100) / 100,
    lng: Math.round(ln * 100) / 100,
  };
}

export const findPlace = (placeId: string): Place | undefined =>
  DEMO_PLACES.find((place) => place.id === placeId);

export interface TimelineInputs {
  readonly place: Place;
  readonly asOf: string;
  /** Already fetched by the caller (the router) from a `StationRepo` — this stays a pure function. */
  readonly observed: readonly RawHour[];
  readonly forecast: readonly RawHour[];
  readonly nearest: NearestStation | undefined;
  /** Honest about the data behind it (rule I12) — 'model' while wired to the fixture repos, 'live' once a real key exists. */
  readonly mode: Mode;
  /** When the provider was last asked, if that was earlier than now (a harvested answer). */
  readonly fetchedAt?: string | undefined;
  /** The weather model's value for now, when it answered. */
  readonly weather?: WeatherNow | undefined;
}

/** The timeline for a place, built by the shared core and checked against the contract before it leaves. */
export function timelineFor(input: TimelineInputs): Timeline {
  const { place, asOf, observed, forecast, nearest, mode, fetchedAt, weather } = input;
  const simulated = mode !== 'live';

  const built = buildHours({
    observed,
    forecast,
    asOf,
    mode,
    hoursBack: 7 * 24,
    hoursAhead: 48,
    simulated,
    fetchedAt,
    station:
      nearest === undefined
        ? undefined
        : { id: nearest.station.id, name: nearest.station.name, distanceKm: nearest.distanceKm },
  });
  const search = findWindow({
    hours: built.hours,
    asOf,
    kind: 'walk',
    latestObservedAgeMinutes: built.latestObservedAgeMinutes,
  });

  return Timeline.parse({
    schemaVersion: 1,
    place,
    asOf,
    mode,
    hours: built.hours,
    week: daySummaries(built.hours.filter((hour) => hour.kind === 'observed')).slice(-7),
    windows: search.kind === 'advice' ? [search.window] : [],
    headline: headline(search, 'walk'),
    ...(weather === undefined ? {} : { weather }),
    prov: makeProvenance({
      mode,
      source: nearest === undefined ? 'model' : 'station',
      asOf,
      fetchedAt,
      simulated,
      stationId: nearest?.station.id,
      stationName: nearest?.station.name,
      distanceKm: nearest?.distanceKm,
    }),
  });
}
