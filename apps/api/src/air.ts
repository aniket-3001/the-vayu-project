import type { Place, RawHour, WeatherNow } from '@vayu/contracts';
import type { Clock } from '@vayu/core';
import {
  fromHarvest,
  nearestFreshStation,
  type FreshStation,
  type ForecastRepo,
  type StationRepo,
  type WeatherRepo,
} from '@vayu/data';
import type { CacheReader } from './roomStores';
import { failure, type ApiResponse } from './respond';
import { findPlace, locationPlace } from './timeline';

export interface AirDeps {
  readonly stationRepo: StationRepo;
  readonly forecastRepo: ForecastRepo;
  readonly weatherRepo?: WeatherRepo | undefined;
  /** What the harvest cached. When present, the demo places are answered from it while it is fresh. */
  readonly cache?: CacheReader | undefined;
  readonly clock: Clock;
}

export interface Air {
  /** The nearest station with a recent reading, or undefined: then the answer is a labelled model estimate. */
  readonly fresh: FreshStation | undefined;
  readonly forecast: readonly RawHour[];
  readonly weather: WeatherNow | undefined;
  /** When the provider was last asked, if that was earlier than now (a harvested answer). */
  readonly fetchedAt: string | undefined;
}

/**
 * The air for a place right now. The four demo places are harvested every 15 minutes, so while that is fresh a
 * request never has to ask OpenAQ. Anything else (your own location), or a harvest that has gone quiet, is
 * looked up live. Only a station with a recent reading counts (rule I3); with none, the caller falls back to
 * the model estimate and says so, rather than show old numbers as current.
 */
export async function loadAir(deps: AirDeps, place: Place, asOf: string): Promise<Air> {
  const harvested =
    deps.cache !== undefined && findPlace(place.id) !== undefined
      ? fromHarvest(
          await deps.cache.latest(place.id, asOf),
          await deps.cache.latestForecast(place.id, asOf),
          asOf,
        )
      : undefined;
  const [fresh, forecast, weather] = await Promise.all([
    harvested?.station ?? nearestFreshStation(deps.stationRepo, place, asOf),
    // The forecast is context too: with the regional model down, a live monitor's readings still go out, with
    // the hours ahead worked out from its own recent pattern, and with nothing to go on the answer says so.
    harvested?.forecast ??
      deps.forecastRepo.forecastFor(place, asOf).catch((): readonly RawHour[] => []),
    // Weather is context. If the model is down, the air answer still goes out without it.
    (deps.weatherRepo?.nowAt(place, asOf) ?? Promise.resolve(undefined)).catch(() => undefined),
  ]);
  return {
    fresh,
    forecast,
    weather,
    fetchedAt:
      fresh !== undefined && fresh === harvested?.station ? harvested.fetchedAt : undefined,
  };
}

export type PlaceChoice =
  | { readonly kind: 'place'; readonly place: Place }
  | { readonly kind: 'error'; readonly response: ApiResponse };

/**
 * The place a request is about: its own coordinates (`lat` and `lng`, kept to about a kilometre and only inside
 * north India) or one of the demo places by name. Anything else is an error the caller can act on.
 */
export function placeFromQuery(query: Readonly<Record<string, string | undefined>>): PlaceChoice {
  const { lat, lng, place: placeId } = query;
  if (lat !== undefined || lng !== undefined) {
    const place = locationPlace(lat, lng);
    return place === undefined
      ? {
          kind: 'error',
          response: failure(
            400,
            'bad_location',
            'lat and lng must both be numbers inside north India (roughly 20 to 35 N, 70 to 90 E)',
            'lat',
          ),
        }
      : { kind: 'place', place };
  }
  if (placeId === undefined)
    return {
      kind: 'error',
      response: failure(
        400,
        'missing_parameter',
        'Add ?place=home (or school, office, park), or ?lat=..&lng=..',
        'place',
      ),
    };
  const place = findPlace(placeId);
  return place === undefined
    ? {
        kind: 'error',
        response: failure(
          404,
          'unknown_place',
          `No place called "${placeId}". Try one from /v1/places`,
          'place',
        ),
      }
    : { kind: 'place', place };
}
