import { Today, type Gases, type TodayHour } from '@vayu/contracts';
import type { GasRepo, WeatherForecast, WeatherForecastRepo } from '@vayu/data';
import { loadAir, placeFromQuery, type AirDeps } from './air';
import { failure, okCached, type ApiRequest, type ApiResponse } from './respond';
import { timelineFor } from './timeline';

export interface TodayDeps extends AirDeps {
  readonly weatherForecastRepo?: WeatherForecastRepo | undefined;
  readonly gasRepo?: GasRepo | undefined;
  /** Honest about the repos behind it (rule I12): 'live' once real. */
  readonly mode: 'live' | 'model';
}

/** How long a shared cache may keep a Today answer. The harvest runs every 15 minutes, so a few minutes is safe. */
export const TODAY_CACHE_SECONDS = 300;

const PAST_HOURS = 48;
const FUTURE_HOURS = 120;

/**
 * `GET /v1/today?lat=..&lng=..` (or `?place=home`): everything the Today screen needs for one place, in one
 * cached answer. The air comes from the nearest monitor with a recent reading, and when none has one the
 * hours are the regional model and the answer says so (mode `model`, label Estimate): stale data never
 * becomes a current reading (rule I3). Weather and gases are context: if either model is down the air answer
 * still goes out without it.
 */
export async function handleToday(request: ApiRequest, deps: TodayDeps): Promise<ApiResponse> {
  if (request.method !== 'GET')
    return failure(405, 'method_not_allowed', `${request.method} is not supported here`);
  const choice = placeFromQuery(request.query);
  if (choice.kind === 'error') return choice.response;
  const { place } = choice;
  const asOf = deps.clock.now();

  const [air, weather, gases] = await Promise.all([
    loadAir(deps, place, asOf),
    deps.weatherForecastRepo
      ?.forecastAt(place, asOf)
      .catch((): WeatherForecast | undefined => undefined) ?? Promise.resolve(undefined),
    deps.gasRepo?.gasesAt(place, asOf).catch((): Gases | undefined => undefined) ??
      Promise.resolve(undefined),
  ]);

  const timeline = timelineFor({
    place,
    asOf,
    observed: air.fresh?.observed ?? [],
    forecast: air.forecast,
    nearest: air.fresh?.nearest,
    mode: air.fresh === undefined ? 'model' : deps.mode,
    weather: air.weather,
    hoursBack: PAST_HOURS,
    hoursAhead: FUTURE_HOURS,
    ...(air.fetchedAt === undefined ? {} : { fetchedAt: air.fetchedAt }),
  });
  const hours: TodayHour[] = timeline.hours.map((hour) => ({
    t: hour.hourStart,
    pm25: hour.pm25,
    kind: hour.kind,
  }));

  return okCached(
    Today.parse({
      schemaVersion: 1,
      place: timeline.place,
      asOf,
      mode: timeline.mode,
      hours,
      ...(weather === undefined ? {} : { weather }),
      ...(gases === undefined ? {} : { gases }),
      windows: timeline.windows,
      headline: timeline.headline,
      prov: timeline.prov,
    }),
    TODAY_CACHE_SECONDS,
  );
}
