import type { RawHour } from '@vayu/contracts';
import { HOUR_MS, localHour, toIso, toMs } from './time';

/** Builds an hourly series from a function of the hour index and the local hour. For tests. */
export function hourlySeries(
  startIso: string,
  count: number,
  valueAt: (index: number, localHourOfDay: number) => number | null,
): RawHour[] {
  const start = toMs(startIso);
  return Array.from({ length: count }, (_, index) => {
    const hourStart = toIso(start + index * HOUR_MS);
    const value = valueAt(index, localHour(hourStart));
    return { hourStart, pm25: value, pm10: value === null ? null : value * 1.8 };
  });
}
