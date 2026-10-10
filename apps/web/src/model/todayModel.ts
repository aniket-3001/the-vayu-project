import type { Band, DaySummary, HourPoint, Provenance, WeatherNow } from '@vayu/contracts';
import {
  HOUR_MS,
  aqi24h,
  availableHours,
  buildHours,
  daySummaries,
  findWindow,
  floorToHourMs,
  headline,
  toMs,
  type Aqi24h,
  type BuiltHours,
  type WindowSearch,
} from '@vayu/core';
import type { PlaceObservations } from '../data/DataSource';

export interface Tip {
  readonly kind: 'walk' | 'airing';
  readonly title: string;
  readonly search: WindowSearch;
  /** Provenance of the first hour of the window, so the tip can say where it comes from. */
  readonly prov: Provenance | null;
}

export interface CurrentAir {
  /** Start of the hour this average covers. */
  readonly hourStart: string;
  readonly pm25: number;
  readonly band: Band;
  readonly prov: Provenance;
}

/** Everything the Today screen shows, already calculated. */
export interface TodayModel {
  readonly placeName: string;
  /** The monitor the numbers come from, when they are live. */
  readonly station: PlaceObservations['station'];
  readonly simulated: boolean;
  readonly asOf: string;
  readonly headline: string;
  readonly current: CurrentAir | null;
  /** Twelve hours back to thirty-six hours ahead, for the strip. */
  readonly hourly: readonly HourPoint[];
  /** The last seven days, for the week strip. */
  readonly week: readonly DaySummary[];
  readonly tips: readonly Tip[];
  readonly aqi: Aqi24h | null;
  /** Mean PM2.5 of the last 24 hours, when at least 16 of them have a reading (as CPCB requires). */
  readonly pm25Mean24h: number | null;
  readonly built: BuiltHours;
  /** The weather model's value for now, when there is one. */
  readonly weather: WeatherNow | undefined;
}

function currentAirOf(hour: HourPoint | undefined): CurrentAir | null {
  if (!hour) return null;
  const { pm25, band, prov, hourStart } = hour;
  return pm25 === null || band === null ? null : { hourStart, pm25, band, prov };
}

const HOURS_BACK_FOR_WEEK = 7 * 24;
const MIN_HOURS_FOR_24H_MEAN = 16;

function mean24h(values: readonly (number | null)[]): number | null {
  const present = values.filter(
    (value): value is number => value !== null && Number.isFinite(value),
  );
  if (present.length < MIN_HOURS_FOR_24H_MEAN) return null;
  return present.reduce((sum, value) => sum + value, 0) / present.length;
}

/** Turns observations into what the screen shows. Pure: the same input always gives the same model. */
export function buildTodayModel(
  input: PlaceObservations,
  options: { readonly sensitive?: boolean } = {},
): TodayModel {
  const built = buildHours({
    observed: input.observed,
    asOf: input.asOf,
    mode: input.mode,
    hoursBack: HOURS_BACK_FOR_WEEK,
    hoursAhead: 48,
    simulated: input.simulated,
    station: input.station === undefined ? undefined : { ...input.station },
  });

  const search = (kind: 'walk' | 'airing', minutes: number): WindowSearch =>
    findWindow({
      hours: built.hours,
      asOf: input.asOf,
      kind,
      minutes,
      sensitive: options.sensitive ?? false,
      latestObservedAgeMinutes: built.latestObservedAgeMinutes,
    });
  const walk = search('walk', 60);
  const airing = search('airing', 10);
  const tip = (kind: Tip['kind'], title: string, found: WindowSearch): Tip => ({
    kind,
    title,
    search: found,
    prov:
      found.kind === 'advice'
        ? (built.hours.find((hour) => hour.hourStart === found.window.start)?.prov ?? null)
        : null,
  });

  const observedHours = built.hours.filter((hour) => hour.kind === 'observed');
  const newest = observedHours.at(-1);
  const current = currentAirOf(newest);

  const nowHour = floorToHourMs(toMs(input.asOf));
  const last24 = availableHours(input.observed, input.asOf).slice(-24);

  return {
    placeName: input.place.name,
    station: input.station,
    simulated: input.simulated,
    asOf: input.asOf,
    headline: headline(walk, 'walk'),
    current,
    hourly: built.hours.filter((hour) => {
      const start = toMs(hour.hourStart);
      return start >= nowHour - 12 * HOUR_MS && start < nowHour + 36 * HOUR_MS;
    }),
    week: daySummaries(observedHours).slice(-7),
    tips: [tip('walk', 'A walk', walk), tip('airing', 'Air the room', airing)],
    pm25Mean24h: mean24h(last24.map((hour) => hour.pm25)),
    aqi: aqi24h(
      last24.map((hour) => hour.pm25),
      last24.map((hour) => hour.pm10),
    ),
    built,
    weather: input.weather,
  };
}
