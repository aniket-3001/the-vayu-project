import { levelForAqi, type Level } from '../design/levels';
import type { HourlyPoint, TodayData } from '../today/types';
import { hourOfDay } from '../today/time';

/**
 * How far you could see, in kilometres, for a PM2.5 in µg/m³. It is Koschmieder's rule with a rough
 * extinction of 10 + 8 per µg/m³ (in inverse megametres), which ignores humidity and so is a guide, not
 * a measurement. Capped at 50 km, since beyond that the horizon, not the air, is what stops the view.
 */
export function visibilityKm(pm25: number): number {
  const extinctionPerKm = (10 + 8 * Math.max(0, pm25)) / 1000;
  return Math.min(50, Math.round((3.912 / extinctionPerKm) * 10) / 10);
}

/** "7 km", "1.7 km", "500 m": a distance for people. */
export function formatDistance(km: number): string {
  if (km < 1) return `${String(Math.round((km * 1000) / 50) * 50)} m`;
  return km >= 10 ? `${String(Math.round(km))} km` : `${String(Math.round(km * 10) / 10)} km`;
}

export interface LensHour {
  readonly at: string;
  readonly aqi: number;
  readonly pm25: number;
  /** Missing when the weather model had no answer for this hour. */
  readonly wind?: { readonly kmh: number; readonly fromDeg: number };
  readonly isDay: boolean;
}

/** Daylight, when the weather model did not say: roughly 6 am to 6 pm India time. Only the scene's brightness uses it. */
const daylightByClock = (at: string): boolean => {
  const hour = hourOfDay(at);
  return hour >= 6 && hour < 18;
};

/** How many hours the time dial reaches, from now. */
export const DIAL_HOURS = 36;

export function lensSeries(data: TodayData): readonly LensHour[] {
  return data.hourly.slice(0, DIAL_HOURS + 1).map((point: HourlyPoint): LensHour => ({
    at: point.at,
    aqi: point.aqi,
    pm25: point.pm25,
    ...(point.weather === undefined
      ? {}
      : { wind: { kmh: point.weather.windKmh, fromDeg: point.weather.windFromDeg } }),
    isDay: point.weather?.isDay ?? daylightByClock(point.at),
  }));
}

/** The hour with the cleanest air, among the daylight hours ahead, within the next `within` hours. */
export function bestHour(series: readonly LensHour[], within = 24): LensHour | undefined {
  let best: LensHour | undefined;
  for (const hour of series.slice(1, within + 1)) {
    if (!hour.isDay) continue;
    if (best === undefined || hour.aqi < best.aqi) best = hour;
  }
  return best;
}

export interface Haze {
  /** Opacity of the fog laid over the view, 0 to 1. */
  readonly veil: number;
  /** How many specks hang in the air. */
  readonly specks: number;
  readonly level: Level;
}

/** What the air should look like for a PM2.5: thicker and more crowded as it gets worse. */
export function hazeFor(pm25: number, aqi: number): Haze {
  const level = levelForAqi(aqi);
  return {
    veil: Math.min(0.62, 0.04 + pm25 / 520),
    specks: Math.round(Math.min(420, 30 + pm25 * 1.5)),
    level,
  };
}

/**
 * The angle, clockwise from straight up the screen, at which wind should be drawn. Wind is said by where it
 * comes from, so it blows towards `from + 180`; turning the phone turns the picture the other way.
 */
export function windOnScreen(windFromDeg: number, headingDeg: number): number {
  return (((windFromDeg + 180 - headingDeg) % 360) + 360) % 360;
}

/** The compass heading from a deviceorientation reading, or undefined if the device gave none. */
export function headingFrom(event: {
  readonly webkitCompassHeading?: number | undefined;
  readonly alpha?: number | null | undefined;
  readonly absolute?: boolean | undefined;
}): number | undefined {
  if (typeof event.webkitCompassHeading === 'number') return event.webkitCompassHeading;
  if (event.absolute === true && typeof event.alpha === 'number') return (360 - event.alpha) % 360;
  return undefined;
}

/** Whether the sun is up at the hour of a series point, for dimming the sample scene at night. */
export const isNight = (hour: LensHour): boolean => !hour.isDay;

export const clockOf = (hour: LensHour): number => hourOfDay(hour.at);
