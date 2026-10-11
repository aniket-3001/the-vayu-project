import { usAqi } from '@vayu/core';
import type { Fire } from '../map/fires';
import { gridPoints, worldPoints, type WindPoint } from '../map/live';
import type { WeekScene } from './active';
import type { RecordedDay } from './types';

const HOUR_MS = 3_600_000;

/** The hour of a day's series that the demo moment falls in. */
export const nowIndex = (day: RecordedDay): number =>
  Math.floor((Date.parse(day.asOf) - Date.parse(`${day.seriesFrom}T00:00:00+05:30`)) / HOUR_MS);

/**
 * The fires and the wind of a recorded day. The fires are those the satellite saw in the 24 hours before the demo
 * moment. The wind is what was recorded at central Delhi that hour, laid over the whole map: the recording has one
 * wind, and the map says so.
 */
export function sceneFor(day: RecordedDay): WeekScene {
  const fires: Fire[] = day.fires.map((f, i) => ({
    id: `fire-${String(i + 1)}`,
    lat: f.lat,
    lng: f.lng,
    frp: f.frp,
    hoursAgo: Math.max(0, Math.round(f.hoursAgo)),
  }));
  const i = nowIndex(day);
  const kmh = day.weather.windKmh[i] ?? 0;
  const fromDeg = day.weather.windFromDeg[i] ?? 0;
  const speed = kmh / 3.6;
  const wind: WindPoint[] = [...gridPoints(3), ...worldPoints(15)].map(({ lat, lng }) => ({
    lat,
    lng,
    speed,
    fromDeg,
  }));
  return { fires, wind };
}

/** The AQI a day was in Delhi, from the mean of what the monitors read over its calendar day, for the chip's colour. */
export function dayAqi(day: RecordedDay): number | undefined {
  const first = 8 * 24;
  const values: number[] = [];
  for (const series of Object.values(day.air))
    for (let h = first; h < first + 24; h++) {
      const v = series.pm25[h];
      if (v !== null && v !== undefined) values.push(v);
    }
  if (values.length === 0) return undefined;
  return usAqi(values.reduce((a, b) => a + b, 0) / values.length)?.value;
}
