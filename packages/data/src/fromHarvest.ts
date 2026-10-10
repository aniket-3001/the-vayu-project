import type { RawHour } from '@vayu/contracts';
import { availableHours, toMs } from '@vayu/core';
import { DEFAULT_FRESH_OPTIONS, newestAgeHours, type FreshStation } from './freshStation';
import type { ForecastSnapshot, StationSnapshot } from './harvest';

/** The harvest runs every 15 minutes; three missed runs means something is wrong, so look live. */
const MAX_HARVEST_AGE_MS = 45 * 60_000;

export interface FromHarvest {
  /** The same shape `nearestFreshStation` returns, or undefined when the harvest cannot be used. */
  readonly station: FreshStation | undefined;
  /** Forecast hours that have not finished by `asOf`, the one in progress included, or undefined when the harvest cannot be used. */
  readonly forecast: readonly RawHour[] | undefined;
  /** When the data was fetched from the provider (the harvest time), for provenance. */
  readonly fetchedAt: string | undefined;
}

const HOUR_MS = 3_600_000;

const recent = (harvestedAt: string, asOf: string): boolean => {
  const age = toMs(asOf) - toMs(harvestedAt);
  return age >= 0 && age <= MAX_HARVEST_AGE_MS;
};

/**
 * What the last harvest saw, turned into what a live lookup would have given, so a request does
 * not have to ask the provider. It declines (returns undefined for that part) whenever it cannot
 * be sure: an old harvest, a station that has gone quiet since, or an answer of "no fresh
 * station", which may only have been a rate limit. The caller then looks live.
 */
export function fromHarvest(
  station: StationSnapshot | undefined,
  forecast: ForecastSnapshot | undefined,
  asOf: string,
): FromHarvest {
  const stationUsable =
    station?.status === 'fresh' &&
    station.station !== undefined &&
    recent(station.harvestedAt, asOf) &&
    (newestAgeHours(availableHours(station.hours, asOf), asOf) ?? Infinity) <=
      DEFAULT_FRESH_OPTIONS.maxAgeHours;
  const forecastUsable = forecast?.status === 'ok' && recent(forecast.harvestedAt, asOf);

  return {
    station:
      stationUsable && station.station !== undefined
        ? {
            nearest: {
              station: { ...station.station, hasPm25: true },
              distanceKm: station.station.distanceKm,
            },
            observed: availableHours(station.hours, asOf),
          }
        : undefined,
    forecast: forecastUsable
      ? forecast.hours.filter((hour) => toMs(hour.hourStart) + HOUR_MS > toMs(asOf))
      : undefined,
    fetchedAt: stationUsable ? station.harvestedAt : undefined,
  };
}
