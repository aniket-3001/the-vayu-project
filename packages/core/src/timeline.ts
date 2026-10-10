import {
  rules,
  type Band,
  type DaySummary,
  type HourPoint,
  type Mode,
  type RawHour,
  type Window,
  type WindowKind,
} from '@vayu/contracts';
import { bandFromConcentration, worseBand } from './bands';
import { makeProvenance } from './provenance';
import { clamp, groupBy, mean } from './stats';
import { usAqi } from './usAqi';
import {
  HOUR_MS,
  floorToHourMs,
  formatHour,
  hourOfDay,
  localDate,
  localHour,
  toIso,
  toMs,
} from './time';

const byStart = (a: RawHour, b: RawHour): number => toMs(a.hourStart) - toMs(b.hourStart);
const hourEndMs = (hour: RawHour): number => toMs(hour.hourStart) + HOUR_MS;
const present = (values: readonly (number | null)[]): number[] =>
  values.filter((value): value is number => value !== null);

/** Rule I1: only hours that have already ended by `asOf` may be used. Nothing later gets through. */
export function availableHours(hours: readonly RawHour[], asOf: string): RawHour[] {
  const limit = toMs(asOf);
  return hours.filter((hour) => hourEndMs(hour) <= limit).sort(byStart);
}

/**
 * The ratio of what was observed to what the forecast said over the same last 24 hours, clamped
 * to 0.5 to 3. Used to pull a biased regional forecast toward reality. 1 when there is not enough
 * to compare.
 */
export function biasFactor(
  observed: readonly RawHour[],
  forecast: readonly RawHour[],
  asOf: string,
): number {
  const forecastByHour = new Map(forecast.map((hour) => [toMs(hour.hourStart), hour.pm25]));
  const pairs = availableHours(observed, asOf)
    .slice(-24)
    .flatMap((hour) => {
      const predicted = forecastByHour.get(toMs(hour.hourStart));
      return hour.pm25 !== null && predicted !== undefined && predicted !== null
        ? [{ observed: hour.pm25, predicted }]
        : [];
    });
  if (pairs.length < 6) return 1;
  const predictedMean = mean(pairs.map((pair) => pair.predicted));
  return predictedMean > 0
    ? clamp(mean(pairs.map((pair) => pair.observed)) / predictedMean, 0.5, 3)
    : 1;
}

/**
 * An honest fallback forecast for replay: the mean hourly profile of the last 7 days, scaled by
 * how the last six hours compare with that profile. Reads only data that had ended by `asOf`.
 */
export function patternForecast(
  observed: readonly RawHour[],
  asOf: string,
  hoursAhead = 48,
): RawHour[] {
  const recent = availableHours(observed, asOf).slice(-7 * 24);
  const withPm25 = recent.filter((hour) => hour.pm25 !== null);
  if (withPm25.length < 24) return [];

  const profile = (pick: (hour: RawHour) => number | null): ReadonlyMap<number, number> => {
    const groups = groupBy(
      recent.filter((hour) => pick(hour) !== null),
      (hour) => localHour(hour.hourStart),
    );
    return new Map([...groups].map(([hour, items]) => [hour, mean(present(items.map(pick)))]));
  };
  const profile25 = profile((hour) => hour.pm25);
  const profile10 = profile((hour) => hour.pm10);
  const overall25 = mean(present(recent.map((hour) => hour.pm25)));
  const overall10Values = present(recent.map((hour) => hour.pm10));
  const overall10 = overall10Values.length > 0 ? mean(overall10Values) : null;

  const lastSix = withPm25.slice(-6);
  const typicalLastSix = mean(
    lastSix.map((hour) => profile25.get(localHour(hour.hourStart)) ?? overall25),
  );
  const scale =
    typicalLastSix > 0
      ? clamp(mean(present(lastSix.map((hour) => hour.pm25))) / typicalLastSix, 0.5, 3)
      : 1;

  const start = floorToHourMs(toMs(asOf));
  return Array.from({ length: hoursAhead }, (_, index) => {
    const hourStart = toIso(start + index * HOUR_MS);
    const hour = localHour(hourStart);
    return {
      hourStart,
      pm25: (profile25.get(hour) ?? overall25) * scale,
      pm10: overall10 === null ? null : (profile10.get(hour) ?? overall10) * scale,
    };
  });
}

export interface BuildHoursInput {
  readonly observed: readonly RawHour[];
  /** A regional forecast. Leave out in replay: the pattern forecast is used instead. */
  readonly forecast?: readonly RawHour[] | undefined;
  readonly asOf: string;
  readonly mode: Mode;
  readonly hoursBack?: number | undefined;
  readonly hoursAhead?: number | undefined;
  readonly station?:
    { readonly id?: string; readonly name?: string; readonly distanceKm?: number } | undefined;
  readonly fetchedAt?: string | undefined;
  /** True for sample or modelled data, so every hour is labelled as such. */
  readonly simulated?: boolean | undefined;
}

export interface BuiltHours {
  readonly hours: readonly HourPoint[];
  readonly latestObservedAgeMinutes: number | null;
  readonly futureKind: 'forecast' | 'pattern' | 'none';
  readonly biasFactor: number | null;
}

/** Past observed hours followed by a forecast, each hour carrying its provenance (rule I2). */
export function buildHours(input: BuildHoursInput): BuiltHours {
  const hoursBack = input.hoursBack ?? 24;
  const hoursAhead = input.hoursAhead ?? 48;
  const past = availableHours(input.observed, input.asOf).slice(-hoursBack);

  const toPoint = (hour: RawHour, kind: HourPoint['kind']): HourPoint => ({
    hourStart: hour.hourStart,
    pm25: hour.pm25,
    pm10: hour.pm10,
    band: hour.pm25 === null ? null : bandFromConcentration('pm25', hour.pm25),
    kind,
    prov: makeProvenance({
      // A forecast or pattern is model output even when the readings beside it are live, and it
      // did not come from the observing station, so it carries neither the label nor the station.
      mode: kind === 'observed' || input.mode !== 'live' ? input.mode : 'model',
      source: kind === 'observed' ? 'station' : kind,
      asOf: input.asOf,
      fetchedAt: input.fetchedAt,
      observedAt: kind === 'observed' ? toIso(hourEndMs(hour)) : undefined,
      stationId: kind === 'observed' ? input.station?.id : undefined,
      stationName: kind === 'observed' ? input.station?.name : undefined,
      distanceKm: kind === 'observed' ? input.station?.distanceKm : undefined,
      simulated: input.simulated,
    }),
  });

  const currentHour = floorToHourMs(toMs(input.asOf));
  const usableForecast = (input.forecast ?? []).filter(
    (hour) => toMs(hour.hourStart) >= currentHour,
  );
  const useForecast =
    input.forecast !== undefined && usableForecast.length >= Math.min(hoursAhead, 24);

  const factor = useForecast ? biasFactor(input.observed, input.forecast ?? [], input.asOf) : null;
  const future: readonly RawHour[] =
    useForecast && factor !== null
      ? usableForecast.slice(0, hoursAhead).map((hour) => ({
          hourStart: hour.hourStart,
          pm25: hour.pm25 === null ? null : hour.pm25 * factor,
          pm10: hour.pm10 === null ? null : hour.pm10 * factor,
        }))
      : patternForecast(input.observed, input.asOf, hoursAhead);
  const futureKind: BuiltHours['futureKind'] = useForecast
    ? 'forecast'
    : future.length > 0
      ? 'pattern'
      : 'none';

  const newest = past.at(-1);
  return {
    hours: [
      ...past.map((hour) => toPoint(hour, 'observed')),
      ...future.map((hour) => toPoint(hour, futureKind === 'forecast' ? 'forecast' : 'pattern')),
    ],
    latestObservedAgeMinutes:
      newest === undefined
        ? null
        : Math.max(0, Math.round((toMs(input.asOf) - hourEndMs(newest)) / 60_000)),
    futureKind,
    biasFactor: factor,
  };
}

export type WindowMiss = 'stale' | 'no_data' | 'no_good_window';

/** The answer is either advice or the reason there is none, so the screen can always say why. */
export type WindowSearch =
  | { readonly kind: 'advice'; readonly window: Window }
  | { readonly kind: 'none'; readonly reason: WindowMiss };

export interface FindWindowInput {
  readonly hours: readonly HourPoint[];
  readonly asOf: string;
  readonly kind: WindowKind;
  /** The child or parent chip: use the stricter band limit. */
  readonly sensitive?: boolean;
  readonly minutes?: number;
  readonly latestObservedAgeMinutes: number | null;
}

/**
 * The lowest-average window in the allowed hours of the next day. Stale input never produces
 * advice (rule I3).
 */
export function findWindow(input: FindWindowInput): WindowSearch {
  const params = rules.walkWindow;
  if (input.latestObservedAgeMinutes === null) return { kind: 'none', reason: 'no_data' };
  if (input.latestObservedAgeMinutes > rules.trust.unusableMin) {
    return { kind: 'none', reason: 'stale' };
  }

  const limit = input.sensitive === true ? params.maxUsAqiSensitive : params.maxUsAqi;
  const length = Math.max(1, Math.ceil((input.minutes ?? params.minutes) / 60));
  const earliest = hourOfDay(params.earliest);
  const latest = hourOfDay(params.latest);
  const currentHour = floorToHourMs(toMs(input.asOf));
  const horizonEnd = currentHour + params.horizonHours * HOUR_MS;
  const byStartMs = new Map(input.hours.map((hour) => [toMs(hour.hourStart), hour]));

  const slicesAt = (startMs: number): readonly HourPoint[] | null => {
    const slice: HourPoint[] = [];
    for (let offset = 0; offset < length; offset++) {
      const hour = byStartMs.get(startMs + offset * HOUR_MS);
      if (hour?.pm25 === undefined || hour.pm25 === null) return null;
      slice.push(hour);
    }
    return slice;
  };

  const candidates = input.hours.flatMap((hour) => {
    const startMs = toMs(hour.hourStart);
    const hourOfDayLocal = localHour(hour.hourStart);
    const inRange = startMs >= currentHour && startMs < horizonEnd;
    const inAllowedDay = hourOfDayLocal >= earliest && hourOfDayLocal + length <= latest;
    const slice = inRange && inAllowedDay ? slicesAt(startMs) : null;
    return slice === null
      ? []
      : [
          {
            startMs,
            average: mean(present(slice.map((point) => point.pm25))),
            includesForecast: slice.some((point) => point.kind !== 'observed'),
          },
        ];
  });

  const best = candidates.reduce<(typeof candidates)[number] | undefined>(
    (top, candidate) => (top === undefined || candidate.average < top.average ? candidate : top),
    undefined,
  );
  if (best === undefined) return { kind: 'none', reason: 'no_data' };

  const band = bandFromConcentration('pm25', best.average);
  const us = usAqi(best.average);
  if (us === undefined || us.value > limit) return { kind: 'none', reason: 'no_good_window' };

  const start = toIso(best.startMs);
  const usualHour = hourOfDay(params.usualStart);
  const usualStart = input.hours.find(
    (hour) =>
      localDate(hour.hourStart) === localDate(start) && localHour(hour.hourStart) === usualHour,
  );
  const usualSlice = usualStart === undefined ? null : slicesAt(toMs(usualStart.hourStart));
  const usualAverage =
    usualSlice === null ? null : mean(present(usualSlice.map((point) => point.pm25)));
  const comparison =
    usualStart !== undefined &&
    usualStart.hourStart !== start &&
    usualAverage !== null &&
    usualAverage > best.average
      ? {
          versus: formatHour(usualStart.hourStart),
          lessPct: Math.round(((usualAverage - best.average) / usualAverage) * 100),
        }
      : null;

  return {
    kind: 'advice',
    window: {
      kind: input.kind,
      start,
      end: toIso(best.startMs + length * HOUR_MS),
      meanPm25: best.average,
      band,
      ...(comparison === null ? {} : { comparison }),
      rationale: [
        `Lowest ${length}-hour average in the next ${params.horizonHours} hours: ${Math.round(best.average)} µg/m³`,
        best.includesForecast
          ? 'Part of this window is a forecast, not a measurement'
          : 'Based on measured hours',
      ],
    },
  };
}

/** Daily minimum, maximum and worst hourly band, for the week strip. */
export function daySummaries(hours: readonly HourPoint[]): DaySummary[] {
  const days = groupBy(
    hours.filter((hour) => hour.pm25 !== null),
    (hour) => localDate(hour.hourStart),
  );
  return [...days]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, dayHours]) => {
      const values = present(dayHours.map((hour) => hour.pm25));
      return {
        date,
        minPm25: Math.min(...values),
        maxPm25: Math.max(...values),
        worstBand: dayHours.reduce<Band>(
          (worst, hour) => worseBand(worst, hour.band ?? 'good'),
          'good',
        ),
      };
    });
}

const ACTIVITY: Record<WindowKind, string> = {
  walk: 'a walk',
  play: 'outdoor play',
  airing: 'airing the room',
  assembly: 'assembly',
};

/** One calm, action-first sentence. */
export function headline(search: WindowSearch, kind: WindowKind = 'walk'): string {
  if (search.kind === 'advice') {
    const { start, end } = search.window;
    return `Good hour for ${ACTIVITY[kind]}: ${formatHour(start)} to ${formatHour(end)}`;
  }
  switch (search.reason) {
    case 'stale':
      return 'Not sure right now: the latest reading is too old to advise on';
    case 'no_data':
      return 'No data yet for this place';
    case 'no_good_window':
      return 'No clean hour outside today. Here is what helps indoors';
  }
}
